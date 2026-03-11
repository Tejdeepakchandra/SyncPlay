const Moment = require('../models/mongodb/Moment');
const Room = require('../models/mongodb/Room');
const User = require('../models/mongodb/User');
const redisClient = require('../config/redis');
const { createRedisKey } = require('../utils/helpers');
const { v4: uuidv4 } = require('uuid');

class MomentService {
  constructor() {
    // Detection thresholds
    this.REACTION_THRESHOLD = 5;      // 5 reactions in window
    this.COMMENT_THRESHOLD = 3;       // 3 comments in window
    this.WINDOW_SIZE = 3000;          // 3 seconds window
    this.INTENSITY_HIGH = 0.7;        // High intensity triggers auto-capture
    this.DEDUPE_WINDOW = 10;          // 10 seconds dedupe window
    this.MAX_WINDOW_ITEMS = 20;       // Only keep last 20 items for performance
    
    // Redis key prefixes
    this.REACTION_KEY = 'moment:reactions:';
    this.COMMENT_KEY = 'moment:comments:';
    this.PARTICIPANTS_KEY = 'moment:participants:';
  }

  /**
   * Add reaction to window and check for spike — ATOMIC with Lua
   */
  async addReaction(roomCode, userId, reaction, videoTimestamp, username = 'Guest') {
    try {
      const now = Date.now();
      const windowKey = createRedisKey(this.REACTION_KEY, roomCode);
      
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
          this.REACTION_THRESHOLD.toString(),
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
        (parsedCount / this.REACTION_THRESHOLD) * 0.5 + 
        (parsedUniqueCount / 3) * 0.5,
        1
      );

      // Check for spike
      if (parsedCount >= this.REACTION_THRESHOLD && parsedUniqueCount >= 3) {
        // Calculate average timestamp
        const avgTimestamp = reactions.reduce(
          (sum, r) => sum + (r.videoTimestamp || 0), 0
        ) / reactions.length;
        
        // CHECK FOR DUPLICATE before creating
        const existing = await Moment.findOne({
          roomCode,
          type: 'reaction_spike',
          timestamp: { 
            $gte: avgTimestamp - this.DEDUPE_WINDOW, 
            $lte: avgTimestamp + this.DEDUPE_WINDOW 
          }
        });

        let moment = null;
        if (!existing) {
          // Create moment
          const result = await this.createMoment({
            roomCode,
            type: 'reaction_spike',
            timestamp: avgTimestamp,
            intensity,
            reactionCount: parsedCount,
            uniqueReactors: parsedUniqueCount,
            reactions,
            participants: uniqueUsers
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
          this.COMMENT_THRESHOLD.toString(),
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
        (parsedCount / this.COMMENT_THRESHOLD) * 0.6 + 
        (parsedUniqueCount / 2) * 0.4,
        1
      );

      if (parsedCount >= this.COMMENT_THRESHOLD && parsedUniqueCount >= 2) {
        const avgTimestamp = comments.reduce(
          (sum, c) => sum + (c.videoTimestamp || 0), 0
        ) / comments.length;
        
        // CHECK FOR DUPLICATE
        const existing = await Moment.findOne({
          roomCode,
          type: 'comment_cluster',
          timestamp: { 
            $gte: avgTimestamp - this.DEDUPE_WINDOW, 
            $lte: avgTimestamp + this.DEDUPE_WINDOW 
          }
        });

        let moment = null;
        if (!existing) {
          const result = await this.createMoment({
            roomCode,
            type: 'comment_cluster',
            timestamp: avgTimestamp,
            intensity,
            commentCount: parsedCount,
            uniqueReactors: parsedUniqueCount,
            comments,
            participants: uniqueUsers
          });
          moment = result.moment;
        }
        
        return { detected: true, moment, count: parsedCount, intensity };
      }
      
      return { detected: false, count: parsedCount, intensity };

    } catch (error) {
      console.error('Add comment error:', error);
      return { detected: false, error: error.message };
    }
  }

  /**
   * Manual bookmark moment
   */
  async addBookmark(roomCode, userId, videoTimestamp, note = '', username = 'Guest') {
    try {
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
      
      return result.moment;
    } catch (error) {
      console.error('Add bookmark error:', error);
      throw error;
    }
  }

  /**
   * Create moment in database — FIXED N+1 query
   */
  async createMoment(momentData) {
    const { roomCode, type, timestamp, intensity, participants = [] } = momentData;
    
    // Get room info
    const room = await Room.findOne({ roomCode })
      .populate('hostId', 'username displayName avatar');
    
    if (!room) throw new Error('Room not found');
    
    // BATCH FETCH all user data — FIXED N+1
    const realUserIds = participants.filter(id => id && !id.startsWith('guest-'));
    const users = realUserIds.length > 0 
      ? await User.find({ _id: { $in: realUserIds } })
          .select('username displayName avatar')
          .lean()
      : [];
    
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
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
            userId: user._id,
            username: user.username,
            displayName: user.displayName,
            avatar: user.avatar,
            reactionCount: momentData.reactionCount || 0
          } : null;
        }
      }).filter(p => p);

    // Get media source info
    const mediaSource = {
      type: room.media?.source || 'unknown',
      url: room.media?.url,
      title: room.media?.title,
      thumbnail: room.media?.thumbnail,
      duration: room.media?.duration
    };

    // Generate capture job ID
    const captureJobId = uuidv4();

    // Create moment
    const moment = new Moment({
      roomId: room._id,
      roomCode,
      timestamp,
      type,
      intensity,
      mediaSource,
      participants: participantList,
      reactions: momentData.reactions || [],
      comments: momentData.comments || [],
      captureJobId,
      stats: {
        reactionCount: momentData.reactionCount || 0,
        commentCount: momentData.commentCount || 0,
        uniqueReactors: momentData.uniqueReactors || participantList.length
      },
      status: 'detected'
    });
    
    await moment.save();
    
    // Return event data instead of emitting
    return {
      moment,
      captureEvent: intensity > this.INTENSITY_HIGH ? {
        momentId: moment._id,
        captureJobId,
        roomCode,
        timestamp: moment.timestamp,
        duration: moment.duration,
        intensity
      } : null
    };
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
        status: 'ready'
      })
      .sort({ timestamp: 1 })
      .limit(limit)
      .populate('participants.userId', 'username displayName avatar');
      
      return moments;
      
    } catch (error) {
      console.error('Get room moments error:', error);
      throw error;
    }
  }

  /**
   * Get moment by ID
   */
  async getMomentById(momentId) {
    try {
      const moment = await Moment.findById(momentId)
        .populate('roomId', 'name roomCode')
        .populate('participants.userId', 'username displayName avatar');
      
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
      
      // Check if user was a participant
      const isParticipant = moment.participants.some(
        p => p.userId?.toString() === userId || p.userId === userId
      );
      
      if (!isParticipant) {
        throw new Error('User was not a participant in this moment');
      }
      
      return moment;
      
    } catch (error) {
      console.error('Validate capture upload error:', error);
      throw error;
    }
  }

  /**
   * Process uploaded moment video
   */
  async processUploadedMoment(momentId, captureJobId, videoData) {
    try {
      const moment = await Moment.findById(momentId);
      if (!moment) throw new Error('Moment not found');
      
      if (moment.captureJobId !== captureJobId) {
        throw new Error('Invalid capture job ID');
      }
      
      // Update moment with video data
      moment.capturedVideo = {
        url: videoData.url,
        thumbnailUrl: videoData.thumbnail,
        webmUrl: videoData.webmUrl,
        mp4Url: videoData.mp4Url,
        duration: videoData.duration,
        size: videoData.size,
        format: videoData.format,
        width: videoData.width,
        height: videoData.height
      };
      
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
      
      await Moment.findByIdAndDelete(momentId);
      
      // Delete from cloud storage (implement separately)
      
      return { success: true };
      
    } catch (error) {
      console.error('Delete moment error:', error);
      throw error;
    }
  }
}

module.exports = new MomentService();