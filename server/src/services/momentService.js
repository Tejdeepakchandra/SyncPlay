const Moment = require('../models/mongodb/Moment');
const Room = require('../models/mongodb/Room');
const User = require('../models/mongodb/User');
const redisClient = require('../config/redis');
const { createRedisKey, generateEventId } = require('../utils/helpers');
const { MOMENT_LIMITS, MOMENT_CLIP, REDIS_KEYS } = require('../utils/constants');

class MomentService {
  constructor() {
    // Detection thresholds (base values — scaled dynamically by room size)
    this.BASE_REACTION_THRESHOLD = 5;
    this.BASE_COMMENT_THRESHOLD = 3;
    this.WINDOW_SIZE = 3000;          // 3 seconds window
    this.INTENSITY_HIGH = 0.7;        // High intensity triggers auto-capture
    this.MAX_WINDOW_ITEMS = 20;       // Only keep last 20 items for performance
    
    // Redis key prefixes
    this.REACTION_KEY = 'moment:reactions:';
    this.COMMENT_KEY = 'moment:comments:';
    this.PARTICIPANTS_KEY = 'moment:participants:';
  }

  /**
   * Dynamic threshold based on room size.
   * 2-user room → both must react. 8-user room → at least 4.
   */
  getReactionThreshold(participantCount) {
    if (participantCount <= 2) return 2;
    return Math.max(2, Math.ceil(participantCount * 0.5));
  }

  getCommentThreshold(participantCount) {
    if (participantCount <= 2) return 2;
    return Math.max(2, Math.ceil(participantCount * 0.4));
  }

  /**
   * Check per-type room limits before creating a moment.
   * Returns { allowed: true } or { allowed: false, ...details }.
   */
  async checkRoomLimits(roomCode, type) {
    // Get room-specific limits (or use defaults)
    const room = await Room.findOne({ roomCode }).select('settings').lean();
    const limits = room?.settings?.momentCapture?.limits || MOMENT_LIMITS;
    const limit = limits[type];

    if (limit == null) return { allowed: true };

    const count = await Moment.countDocuments({
      roomCode,
      type,
      status: { $nin: ['failed'] },
      mergedInto: { $exists: false }
    });

    if (count >= limit) {
      return {
        allowed: false,
        limitReached: true,
        momentType: type,
        currentCount: count,
        maxAllowed: limit
      };
    }

    // Also check total moments per room
    const totalCount = await Moment.countDocuments({
      roomCode,
      status: { $nin: ['failed'] },
      mergedInto: { $exists: false }
    });

    if (totalCount >= MOMENT_CLIP.MAX_PER_ROOM) {
      return {
        allowed: false,
        limitReached: true,
        momentType: 'total',
        currentCount: totalCount,
        maxAllowed: MOMENT_CLIP.MAX_PER_ROOM
      };
    }

    return { allowed: true };
  }

  /**
   * Check for nearby existing moment of same type and merge if overlapping.
   * Returns the existing moment if merged, null if no overlap found.
   */
  async checkAndMergeOverlap(roomCode, type, videoTimestamp, newParticipants = []) {
    const nearby = await Moment.findOne({
      roomCode,
      type,
      status: { $nin: ['failed'] },
      mergedInto: { $exists: false },
      timestamp: {
        $gte: videoTimestamp - MOMENT_CLIP.OVERLAP_WINDOW,
        $lte: videoTimestamp + MOMENT_CLIP.OVERLAP_WINDOW
      }
    }).sort({ timestamp: 1 });

    if (!nearby) return null;

    // Extend the existing moment's clip range
    const existingStart = nearby.clipRange?.startTime ?? (nearby.timestamp - MOMENT_CLIP.OFFSET_BEFORE);
    const existingEnd = nearby.clipRange?.endTime ?? (nearby.timestamp + MOMENT_CLIP.OFFSET_AFTER);
    const newStart = videoTimestamp - MOMENT_CLIP.OFFSET_BEFORE;
    const newEnd = videoTimestamp + MOMENT_CLIP.OFFSET_AFTER;

    nearby.clipRange = {
      startTime: Math.min(existingStart, newStart),
      endTime: Math.max(existingEnd, newEnd)
    };
    nearby.duration = nearby.clipRange.endTime - nearby.clipRange.startTime;

    // Add new participants (deduplicated)
    const existingUserIds = new Set(nearby.participants.map(p => p.userId));
    for (const p of newParticipants) {
      if (p.userId && !existingUserIds.has(p.userId)) {
        nearby.participants.push(p);
      }
    }

    await nearby.save();
    return nearby;
  }

  /**
   * Add reaction to window and check for spike — ATOMIC with Lua
   */
  async addReaction(roomCode, userId, reaction, videoTimestamp, username = 'Guest') {
    try {
      const now = Date.now();
      const windowKey = createRedisKey(this.REACTION_KEY, roomCode);

      // Get room participant count for dynamic threshold
      const room = await Room.findOne({ roomCode }).select('participants settings').lean();
      if (!room) return { detected: false, error: 'Room not found' };

      // Check if moment capture is enabled
      if (room.settings?.momentCapture?.enabled === false) {
        return { detected: false, disabled: true };
      }

      const participantCount = room.participants?.length || 1;
      const threshold = this.getReactionThreshold(participantCount);
      
      // ATOMIC OPERATION using Lua script
      const luaScript = `
        local windowKey = KEYS[1]
        local now = tonumber(ARGV[1])
        local windowSize = tonumber(ARGV[2])
        local threshold = tonumber(ARGV[3])
        local maxItems = tonumber(ARGV[4])
        local reactionData = ARGV[5]
        
        -- Add reaction
        redis.call('ZADD', windowKey, now, reactionData)
        
        -- Remove old reactions
        redis.call('ZREMRANGEBYSCORE', windowKey, 0, now - windowSize)
        
        -- Keep only last maxItems (for performance)
        local total = redis.call('ZCARD', windowKey)
        if total > maxItems then
          redis.call('ZREMRANGEBYRANK', windowKey, 0, total - maxItems - 1)
        end
        
        -- Set expiry (60 seconds)
        redis.call('EXPIRE', windowKey, 60)
        
        -- Count reactions
        local count = redis.call('ZCARD', windowKey)
        
        -- Get recent reactions (last 20)
        local reactions = redis.call('ZRANGE', windowKey, -20, -1)
        
        -- Track unique users
        local uniqueUsers = {}
        for i, v in ipairs(reactions) do
          local parsed = cjson.decode(v)
          uniqueUsers[parsed.userId] = true
        end
        
        -- Convert unique users to array
        local usersList = {}
        for userId,_ in pairs(uniqueUsers) do
          table.insert(usersList, userId)
        end
        
        return {count, #usersList, cjson.encode(reactions), cjson.encode(usersList)}
      `;

      const result = await redisClient.eval(luaScript, {
        keys: [windowKey],
        arguments: [
          now.toString(),
          this.WINDOW_SIZE.toString(),
          threshold.toString(),
          this.MAX_WINDOW_ITEMS.toString(),
          JSON.stringify({ userId, reaction, videoTimestamp, username, now })
        ]
      });

      const [count, uniqueCount, reactionsJson, usersJson] = result;
      const parsedCount = parseInt(count);
      const parsedUniqueCount = parseInt(uniqueCount);
      
      // Parse reactions (each item is a JSON string)
      const reactionsRaw = JSON.parse(reactionsJson);
      const reactions = reactionsRaw.map(r => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      }).filter(r => r !== null);
      
      // Parse unique users
      const uniqueUsers = JSON.parse(usersJson);
      
      // Calculate intensity (0-1)
      const intensity = Math.min(
        (parsedCount / threshold) * 0.5 + 
        (parsedUniqueCount / Math.max(2, participantCount * 0.5)) * 0.5,
        1
      );

      // Check for spike (using dynamic threshold)
      const minUniqueUsers = Math.max(2, Math.ceil(participantCount * 0.5));
      if (parsedCount >= threshold && parsedUniqueCount >= minUniqueUsers) {
        // Calculate average timestamp
        const avgTimestamp = reactions.reduce(
          (sum, r) => sum + (r.videoTimestamp || 0), 0
        ) / reactions.length;
        
        // CHECK FOR DUPLICATE before creating
        const existing = await Moment.findOne({
          roomCode,
          type: 'reaction_spike',
          mergedInto: { $exists: false },
          timestamp: { 
            $gte: avgTimestamp - MOMENT_CLIP.DEDUPE_WINDOW, 
            $lte: avgTimestamp + MOMENT_CLIP.DEDUPE_WINDOW 
          }
        });

        let moment = null;
        if (!existing) {
          // Check room limits
          const limitCheck = await this.checkRoomLimits(roomCode, 'reaction_spike');
          if (!limitCheck.allowed) {
            return {
              detected: true,
              moment: null,
              limitReached: true,
              ...limitCheck,
              count: parsedCount,
              intensity
            };
          }

          const result = await this.createMoment({
            roomCode,
            type: 'reaction_spike',
            timestamp: avgTimestamp,
            intensity,
            reactionCount: parsedCount,
            uniqueReactors: parsedUniqueCount,
            reactions,
            participants: uniqueUsers,
            participantCount
          });
          moment = result.moment;
        }
        
        return { 
          detected: true, 
          moment,
          count: parsedCount,
          intensity,
          captureJobId: moment?.captureJobId
        };
      }
      
      return { 
        detected: false, 
        count: parsedCount,
        intensity 
      };

    } catch (error) {
      console.error('Add reaction error:', error);
      return { detected: false, error: error.message };
    }
  }

  /**
   * Add comment to window and check for cluster — ATOMIC with Lua
   */
  async addComment(roomCode, userId, text, videoTimestamp, username = 'Guest') {
    try {
      const now = Date.now();
      const windowKey = createRedisKey(this.COMMENT_KEY, roomCode);

      // Get room participant count for dynamic threshold
      const room = await Room.findOne({ roomCode }).select('participants settings').lean();
      if (!room) return { detected: false, error: 'Room not found' };

      if (room.settings?.momentCapture?.enabled === false) {
        return { detected: false, disabled: true };
      }

      const participantCount = room.participants?.length || 1;
      const threshold = this.getCommentThreshold(participantCount);
      
      const luaScript = `
        local windowKey = KEYS[1]
        local now = tonumber(ARGV[1])
        local windowSize = tonumber(ARGV[2])
        local threshold = tonumber(ARGV[3])
        local maxItems = tonumber(ARGV[4])
        local commentData = ARGV[5]
        
        redis.call('ZADD', windowKey, now, commentData)
        redis.call('ZREMRANGEBYSCORE', windowKey, 0, now - windowSize)
        
        local total = redis.call('ZCARD', windowKey)
        if total > maxItems then
          redis.call('ZREMRANGEBYRANK', windowKey, 0, total - maxItems - 1)
        end
        
        redis.call('EXPIRE', windowKey, 60)
        
        local count = redis.call('ZCARD', windowKey)
        local comments = redis.call('ZRANGE', windowKey, -20, -1)
        
        local uniqueUsers = {}
        for i, v in ipairs(comments) do
          local parsed = cjson.decode(v)
          uniqueUsers[parsed.userId] = true
        end
        
        local usersList = {}
        for userId,_ in pairs(uniqueUsers) do
          table.insert(usersList, userId)
        end
        
        return {count, #usersList, cjson.encode(comments), cjson.encode(usersList)}
      `;

      const result = await redisClient.eval(luaScript, {
        keys: [windowKey],
        arguments: [
          now.toString(),
          this.WINDOW_SIZE.toString(),
          threshold.toString(),
          this.MAX_WINDOW_ITEMS.toString(),
          JSON.stringify({ userId, text: text.substring(0, 100), videoTimestamp, username, now })
        ]
      });

      const [count, uniqueCount, commentsJson, usersJson] = result;
      const parsedCount = parseInt(count);
      const parsedUniqueCount = parseInt(uniqueCount);
      
      // Parse comments
      const commentsRaw = JSON.parse(commentsJson);
      const comments = commentsRaw.map(c => {
        try {
          return JSON.parse(c);
        } catch {
          return null;
        }
      }).filter(c => c !== null);
      
      const uniqueUsers = JSON.parse(usersJson);
      
      const intensity = Math.min(
        (parsedCount / threshold) * 0.6 + 
        (parsedUniqueCount / Math.max(2, participantCount * 0.4)) * 0.4,
        1
      );

      const minUniqueUsers = Math.max(2, Math.ceil(participantCount * 0.4));
      if (parsedCount >= threshold && parsedUniqueCount >= minUniqueUsers) {
        const avgTimestamp = comments.reduce(
          (sum, c) => sum + (c.videoTimestamp || 0), 0
        ) / comments.length;
        
        // CHECK FOR DUPLICATE
        const existing = await Moment.findOne({
          roomCode,
          type: 'comment_cluster',
          mergedInto: { $exists: false },
          timestamp: { 
            $gte: avgTimestamp - MOMENT_CLIP.DEDUPE_WINDOW, 
            $lte: avgTimestamp + MOMENT_CLIP.DEDUPE_WINDOW 
          }
        });

        let moment = null;
        if (!existing) {
          // Check room limits
          const limitCheck = await this.checkRoomLimits(roomCode, 'comment_cluster');
          if (!limitCheck.allowed) {
            return {
              detected: true,
              moment: null,
              limitReached: true,
              ...limitCheck,
              count: parsedCount,
              intensity
            };
          }

          const result = await this.createMoment({
            roomCode,
            type: 'comment_cluster',
            timestamp: avgTimestamp,
            intensity,
            commentCount: parsedCount,
            uniqueReactors: parsedUniqueCount,
            comments,
            participants: uniqueUsers,
            participantCount
          });
          moment = result.moment;
        }
        
        return {
          detected: true,
          moment,
          count: parsedCount,
          intensity,
          captureJobId: moment?.captureJobId,
        };
      }
      
      return { detected: false, count: parsedCount, intensity };

    } catch (error) {
      console.error('Add comment error:', error);
      return { detected: false, error: error.message };
    }
  }

  /**
   * Manual bookmark moment — with overlap merge
   */
  async addBookmark(roomCode, userId, videoTimestamp, note = '', username = 'Guest') {
    try {
      // Check room limits first
      const limitCheck = await this.checkRoomLimits(roomCode, 'bookmark');
      if (!limitCheck.allowed) {
        const error = new Error('Bookmark limit reached');
        error.limitReached = true;
        error.details = limitCheck;
        throw error;
      }

      // Check for nearby bookmark to merge with
      const mergedMoment = await this.checkAndMergeOverlap(
        roomCode,
        'bookmark',
        videoTimestamp,
        [{ userId, username, displayName: username, reactionCount: 0 }]
      );

      if (mergedMoment) {
        return { moment: mergedMoment, merged: true };
      }

      // Create new bookmark
      const result = await this.createMoment({
        roomCode,
        type: 'bookmark',
        timestamp: videoTimestamp,
        intensity: 0.8,
        note,
        participants: [userId],
        reactions: [{
          userId,
          username,
          reaction: '⭐',
          videoTimestamp
        }]
      });
      
      return { moment: result.moment, merged: false };
    } catch (error) {
      console.error('Add bookmark error:', error);
      throw error;
    }
  }

  /**
   * Create moment in database with clip range and host capture info
   */
  async createMoment(momentData) {
    const { roomCode, type, timestamp, intensity, participants = [] } = momentData;
    
    // Get room info
    const room = await Room.findOne({ roomCode });
    if (!room) throw new Error('Room not found');
    
    // BATCH FETCH all user data — FIXED N+1
    const realUserIds = participants.filter(id => id && !id.startsWith('guest-'));
    const users = realUserIds.length > 0 
      ? await User.find({ clerkId: { $in: realUserIds } })
        .select('clerkId username displayName avatar')
          .lean()
      : [];
    
    const userMap = {};
    users.forEach(user => {
      userMap[user.clerkId] = user;
    });

    // Build participant list
    const participantList = participants
      .filter(id => id) // Remove null/undefined
      .map(id => {
        if (id.startsWith('guest-')) {
          return {
            userId: id,
            username: id,
            displayName: 'Guest',
            reactionCount: momentData.reactionCount || 0
          };
        } else {
          const user = userMap[id];
          return user ? {
            userId: user.clerkId,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            reactionCount: momentData.reactionCount || 0
          } : null;
        }
      }).filter(p => p);

    // Get media source info
    const mediaSource = {
      type: room.media?.current?.source || 'unknown',
      url: room.media?.current?.url,
      title: room.media?.current?.title,
      thumbnail: room.media?.current?.thumbnail,
      duration: room.media?.current?.duration
    };

    // Generate capture job ID
    const captureJobId = generateEventId();

    // Calculate clip range
    const clipRange = {
      startTime: Math.max(0, timestamp - MOMENT_CLIP.OFFSET_BEFORE),
      endTime: timestamp + MOMENT_CLIP.OFFSET_AFTER
    };

    // Create moment
    const moment = new Moment({
      roomId: room._id,
      roomCode,
      timestamp,
      duration: MOMENT_CLIP.DURATION,
      clipRange,
      type,
      intensity,
      mediaSource,
      participants: participantList,
      reactions: momentData.reactions || [],
      comments: momentData.comments || [],
      captureJobId,
      capturedBy: {
        userId: room.hostId,
        isHost: true
      },
      stats: {
        reactionCount: momentData.reactionCount || 0,
        commentCount: momentData.commentCount || 0,
        uniqueReactors: momentData.uniqueReactors || participantList.length
      },
      status: 'detected'
    });
    
    await moment.save();

    // Update room stats
    await Room.updateOne(
      { roomCode },
      { $inc: { 'stats.momentCount': 1 } }
    );
    
    // Return event data — capture only if intensity is high enough
    return {
      moment,
      captureEvent: intensity > this.INTENSITY_HIGH ? {
        momentId: moment._id,
        captureJobId,
        roomCode,
        timestamp: moment.timestamp,
        clipRange,
        duration: moment.duration,
        intensity
      } : null
    };
  }

  // Compatibility method used by chat handlers.
  async processComment(roomCode, userId, text, videoTimestamp = 0, username = 'Guest') {
    return this.addComment(roomCode, userId, text, videoTimestamp, username);
  }

  // Compatibility method for future non-socket pipelines.
  async processReaction(roomCode, userId, reaction, videoTimestamp = 0, username = 'Guest') {
    return this.addReaction(roomCode, userId, reaction, videoTimestamp, username);
  }

  /**
   * Get moments for a room
   */
  async getRoomMoments(roomCode, limit = 50) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');
      
      const moments = await Moment.find({ 
        roomId: room._id,
        status: 'ready',
        mergedInto: { $exists: false }
      })
      .sort({ timestamp: 1 })
      .limit(limit)
      .lean();
      
      return moments;
      
    } catch (error) {
      console.error('Get room moments error:', error);
      throw error;
    }
  }

  /**
   * Get all moments for a room (any status) — used for session-end merge
   */
  async getAllRoomMoments(roomCode) {
    return Moment.find({
      roomCode,
      status: 'ready',
      mergedInto: { $exists: false },
      'capturedVideo.url': { $exists: true }
    }).sort({ timestamp: 1 }).lean();
  }

  /**
   * Get moment counts by type for a room (for limit display)
   */
  async getRoomMomentCounts(roomCode) {
    const pipeline = [
      { $match: { roomCode, status: { $nin: ['failed'] }, mergedInto: { $exists: false } } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ];
    const results = await Moment.aggregate(pipeline);
    
    const counts = {};
    for (const r of results) {
      counts[r._id] = r.count;
    }
    return counts;
  }

  /**
   * Get moment by ID
   */
  async getMomentById(momentId) {
    try {
      const moment = await Moment.findById(momentId)
        .populate('roomId', 'name roomCode');
      
      if (!moment) throw new Error('Moment not found');
      
      // Increment view count
      moment.stats.viewCount += 1;
      await moment.save();
      
      return moment;
      
    } catch (error) {
      console.error('Get moment error:', error);
      throw error;
    }
  }

  /**
   * Validate capture upload
   */
  async validateCaptureUpload(momentId, captureJobId, userId) {
    try {
      const moment = await Moment.findById(momentId);
      if (!moment) throw new Error('Moment not found');
      
      if (moment.captureJobId !== captureJobId) {
        throw new Error('Invalid capture job ID');
      }
      
      // Only host can upload captures
      if (moment.capturedBy?.userId !== userId) {
        // Also check if user was a participant (backward compat)
        const isParticipant = moment.participants.some(
          p => p.userId?.toString() === userId || p.userId === userId
        );
        if (!isParticipant) {
          throw new Error('User was not a participant in this moment');
        }
      }
      
      return moment;
      
    } catch (error) {
      console.error('Validate capture upload error:', error);
      throw error;
    }
  }

  /**
   * Process uploaded moment video (called after host uploads to Cloudinary)
   */
  async processUploadedMoment(momentId, captureJobId, videoData) {
    try {
      const moment = await Moment.findById(momentId);
      if (!moment) throw new Error('Moment not found');
      
      if (moment.captureJobId !== captureJobId) {
        throw new Error('Invalid capture job ID');
      }
      
      // Update moment with video data from Cloudinary
      moment.capturedVideo = {
        url: videoData.url,
        thumbnailUrl: videoData.thumbnail || videoData.thumbnailUrl,
        webmUrl: videoData.webmUrl,
        mp4Url: videoData.mp4Url,
        duration: videoData.duration,
        size: videoData.size,
        format: videoData.format || 'webm',
        width: videoData.width,
        height: videoData.height
      };
      moment.cloudinaryPublicId = videoData.publicId || videoData.public_id;
      moment.status = 'ready';
      await moment.save();
      
      return moment;
      
    } catch (error) {
      console.error('Process uploaded moment error:', error);
      
      await Moment.findByIdAndUpdate(momentId, {
        status: 'failed',
        errorMessage: error.message
      });
      
      throw error;
    }
  }

  /**
   * Mark user as watching a moment (for sync skip)
   */
  async setUserWatchingMoment(userId, roomCode, momentId) {
    const key = createRedisKey(REDIS_KEYS.MOMENT_WATCHING, `${roomCode}:${userId}`);
    await redisClient.set(key, JSON.stringify({
      momentId,
      startedAt: Date.now()
    }), { EX: 300 }); // 5 min max — auto-cleanup
  }

  /**
   * Clear user watching state (for resync)
   */
  async clearUserWatchingMoment(userId, roomCode) {
    const key = createRedisKey(REDIS_KEYS.MOMENT_WATCHING, `${roomCode}:${userId}`);
    await redisClient.del(key);
  }

  /**
   * Check if user is currently watching a moment
   */
  async isUserWatchingMoment(userId, roomCode) {
    const key = createRedisKey(REDIS_KEYS.MOMENT_WATCHING, `${roomCode}:${userId}`);
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Delete moment
   */
  async deleteMoment(momentId, userId) {
    try {
      const moment = await Moment.findById(momentId);
      if (!moment) throw new Error('Moment not found');
      
      // Check if user is host or moment creator
      const room = await Room.findById(moment.roomId);
      if (room.hostId.toString() !== userId) {
        const participant = moment.participants.find(
          p => p.userId?.toString() === userId
        );
        if (!participant) {
          throw new Error('Not authorized to delete this moment');
        }
      }
      
      // Get cloudinary public ID for cleanup
      const publicId = moment.cloudinaryPublicId;
      
      await Moment.findByIdAndDelete(momentId);

      // Decrement room stats
      await Room.updateOne(
        { _id: moment.roomId },
        { $inc: { 'stats.momentCount': -1 } }
      );
      
      return { success: true, deletedPublicId: publicId };
      
    } catch (error) {
      console.error('Delete moment error:', error);
      throw error;
    }
  }

  /**
   * Clean up all moment data for a room (used on session end after merge)
   */
  async cleanupRoomMomentKeys(roomCode) {
    try {
      const reactionKey = createRedisKey(this.REACTION_KEY, roomCode);
      const commentKey = createRedisKey(this.COMMENT_KEY, roomCode);
      await redisClient.del(reactionKey);
      await redisClient.del(commentKey);
    } catch (error) {
      console.error('Cleanup room moment keys error:', error);
    }
  }
}

module.exports = new MomentService();