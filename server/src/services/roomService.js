const Room = require('../models/mongodb/Room');
const User = require('../models/mongodb/User');
const redisClient = require('../config/redis');
const pgPool = require('../config/postgres');
const fs = require('fs').promises;
const path = require('path');
const { generateRoomCode, createRedisKey } = require('../utils/helpers');
const { REDIS_KEYS, CACHE_TTL, ROOM_STATUS, PRIVACY_LEVELS } = require('../utils/constants');

class RoomService {
  
 
  async createRoom(roomData, hostId) {
    try {
      // Get host user details
      const host = await User.findById(hostId);
      if (!host) {
        throw new Error('Host user not found');
      }

      // Generate unique room code
      const roomCode = await Room.generateRoomCode();

      // Create room
      const room = new Room({
        roomCode,
        name: roomData.name,
        type: roomData.type,
        description: roomData.description || '',
        hostId,
        settings: {
          privacy: roomData.settings?.privacy || PRIVACY_LEVELS.PUBLIC,
          maxParticipants: roomData.settings?.maxParticipants || 20,
          requireApproval: roomData.settings?.requireApproval || false,
          allowGuests: roomData.settings?.allowGuests !== false,
          allowChat: roomData.settings?.allowChat !== false,
          allowReactions: roomData.settings?.allowReactions !== false,
          allowScreenShare: roomData.settings?.allowScreenShare !== false,
          allowQueue: roomData.settings?.allowQueue !== false,
          slowMode: roomData.settings?.slowMode || false
        },
        participants: [{
          userId: hostId,
          username: host.username,
          displayName: host.displayName,
          avatar: host.avatar,
          role: 'host',
          permissions: this.getHostPermissions()
        }]
      });

      await room.save();

      // Store in Redis for quick access
      const redisKey = createRedisKey(REDIS_KEYS.ROOM, roomCode);
      await redisClient.set(redisKey, JSON.stringify({
        id: room._id.toString(),
        roomCode,
        name: room.name,
        type: room.type,
        hostId: room.hostId.toString(),
        status: room.status,
        participantCount: 1,
        version: room.version,
        settings: room.settings
      }), {
        EX: CACHE_TTL.ROOM
      });

      // Track in Redis for presence
      await redisClient.sAdd(createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode), hostId.toString());
      
      // Room metadata for atomic operations
      await redisClient.hSet(createRedisKey(REDIS_KEYS.ROOM_METADATA, roomCode), {
        participant_count: '1',
        max_participants: room.settings.maxParticipants.toString(),
        last_activity: Date.now().toString()
      });

      return room;

    } catch (error) {
      console.error('Create room error:', error);
      throw error;
    }
  }

  
   // Get room by code (with Redis cache) , first we will check redis then we will check mongoDB if not found in redis, if found in mongoDB then we will cache it in redis for future requests
   
  async getRoomByCode(roomCode) {
    try {
      // Try Redis first
      const redisKey = createRedisKey(REDIS_KEYS.ROOM, roomCode);
      const cached = await redisClient.get(redisKey);
      
      if (cached) {
        const roomData = JSON.parse(cached);
        // Get current participant count from Redis
        const participants = await redisClient.sMembers(
          createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode)
        );
        roomData.currentParticipants = participants.length;
        return roomData;
      }

      // Fallback to MongoDB
      const room = await Room.findOne({ roomCode })
        .populate('participants.userId', 'username displayName avatar')
        .populate('hostId', 'username displayName avatar');

      if (room) {
        // Cache in Redis
        await redisClient.set(redisKey, JSON.stringify({
          id: room._id.toString(),
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          hostId: room.hostId.toString(),
          status: room.status,
          participantCount: room.participants.length,
          version: room.version,
          settings: room.settings
        }), {
          EX: CACHE_TTL.ROOM
        });
      }

      return room;

    } catch (error) {
      console.error('Get room error:', error);
      throw error;
    }
  }

  
   //Join a room with atomic operation
   
  async joinRoom(roomCode, userId, asGuest = false) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');

      // PRIVACY ENFORCEMENT
      if (room.settings.privacy === PRIVACY_LEVELS.PRIVATE && asGuest) {
        throw new Error('Private rooms require login');
      }
      
      if (room.settings.privacy === PRIVACY_LEVELS.INVITE_ONLY && 
          !room.invitedUsers?.includes(userId)) {
        throw new Error('This room is invite-only');
      }

      // Load Lua script
      const luaScript = await fs.readFile(
        path.join(__dirname, '../scripts/joinRoom.lua'), 
        'utf8'
      );

      // ATOMIC JOIN WITH LUA
      const result = await redisClient.eval(luaScript, {
        keys: [
          createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode),
          createRedisKey(REDIS_KEYS.ROOM_METADATA, roomCode)
        ],
        arguments: [
          userId,
          room.settings.maxParticipants.toString(),
          Date.now().toString()
        ]
      });

      if (result[1] === 'room_full') {
        throw new Error('Room is full');
      }

      // Add to MongoDB (canonical participant list) if not already there
      if (!room.participants.some(p => p.userId.toString() === userId.toString())) {
        let user = null;
        if (!asGuest) {
          user = await User.findById(userId);
        }
        
        room.participants.push({
          userId,
          username: asGuest ? `guest-${userId.slice(-4)}` : user.username,
          displayName: asGuest ? 'Guest' : user.displayName,
          avatar: asGuest ? null : user.avatar,
          role: asGuest ? 'guest' : 'participant',
          joinedAt: new Date(),
          permissions: this.getDefaultPermissions(asGuest)
        });
        
        room.version += 1;
        await room.save();

        // Update peak participants if needed
        const currentCount = parseInt(result[2]);
        if (currentCount > room.stats.peakParticipants) {
          room.stats.peakParticipants = currentCount;
          await room.save();
        }
      }

      return { room, participantCount: parseInt(result[2]) };

    } catch (error) {
      console.error('Join room error:', error);
      throw error;
    }
  }

  
   // Leave a room with host reassignment
   
  async leaveRoom(roomCode, userId) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');

      // Check if leaving user is host
      const isHost = room.hostId.toString() === userId.toString();
      let newHostId = null;

      if (isHost) {
        // Find next host (co-host first, then oldest participant)
        const coHost = room.participants.find(p => 
          p.role === 'cohost' && p.userId.toString() !== userId
        );
        
        if (coHost) {
          newHostId = coHost.userId;
        } else {
          // Promote oldest participant (excluding guests)
          const oldestParticipant = room.participants
            .filter(p => p.role !== 'guest' && p.userId.toString() !== userId)
            .sort((a, b) => a.joinedAt - b.joinedAt)[0];
          
          newHostId = oldestParticipant?.userId || null;
        }

        if (newHostId) {
          room.hostId = newHostId;
          // Update role
          const newHost = room.participants.find(p => p.userId.toString() === newHostId.toString());
          if (newHost) {
            newHost.role = 'host';
            newHost.permissions = this.getHostPermissions();
          }
        }
      }

      // Remove from Redis
      await redisClient.sRem(createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode), userId);

      // Update Redis metadata
      const currentCount = await redisClient.sCard(createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode));
      await redisClient.hSet(createRedisKey(REDIS_KEYS.ROOM_METADATA, roomCode), {
        participant_count: currentCount.toString(),
        last_activity: Date.now().toString()
      });

      // Remove from MongoDB
      const participantIndex = room.participants.findIndex(
        p => p.userId.toString() === userId.toString()
      );
      if (participantIndex !== -1) {
        room.participants.splice(participantIndex, 1);
        room.version += 1;
        await room.save();
      }

      return { 
        room, 
        newHostId,
        isHostLeft: isHost,
        participantCount: currentCount
      };

    } catch (error) {
      console.error('Leave room error:', error);
      throw error;
    }
  }

 
 // Get room participants 
 
async getRoomParticipants(roomCode) {
  try {
    const participantIds = await redisClient.sMembers(
      createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode)
    );

    // Separate guests and real users
    const guestIds = participantIds.filter(id => id.startsWith('guest-'));
    const realUserIds = participantIds.filter(id => !id.startsWith('guest-'));

    // Bulk fetch all real users in one query — FIXED N+1
    const users = realUserIds.length > 0 
      ? await User.find({ _id: { $in: realUserIds } })
          .select('username displayName avatar')
          .lean()
      : [];

    // Create map for O(1) lookup
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = user;
    });

    // Build participants array
    const participants = [];

    // Add guests
    guestIds.forEach(id => {
      participants.push({
        userId: id,
        username: id,
        displayName: 'Guest',
        isGuest: true
      });
    });

    // Add real users
    realUserIds.forEach(id => {
      const user = userMap[id];
      if (user) {
        participants.push({
          userId: user._id,
          username: user.username,
          displayName: user.displayName,
          avatar: user.avatar,
          isGuest: false
        });
      }
    });

    return participants;

  } catch (error) {
    console.error('Get participants error:', error);
    throw error;
  }
}

  
   // Update room settings (host only)
   
  async updateRoomSettings(roomCode, userId, settings) {
    try {
      const room = await Room.findOne({ roomCode });
      
      if (!room) {
        throw new Error('Room not found');
      }

      // Check if user is host
      if (room.hostId.toString() !== userId.toString()) {
        throw new Error('Only host can update settings');
      }

      // Update settings
      room.settings = { ...room.settings, ...settings };
      room.version += 1;
      await room.save();

      // Update Redis cache
      const redisKey = createRedisKey(REDIS_KEYS.ROOM, roomCode);
      await redisClient.del(redisKey);

      return room;

    } catch (error) {
      console.error('Update settings error:', error);
      throw error;
    }
  }

  
   // End room (host only)
   
  async endRoom(roomCode, userId) {
    try {
      const room = await Room.findOne({ roomCode });
      
      if (!room) {
        throw new Error('Room not found');
      }

      // Check if user is host
      if (room.hostId.toString() !== userId.toString()) {
        throw new Error('Only host can end room');
      }

      // Update status
      room.status = ROOM_STATUS.ENDED;
      room.endedAt = new Date();
      room.version += 1;
      await room.save();

      // Calculate watch time for analytics
      if (room.startedAt) {
        const watchTimeMinutes = Math.round(
          (room.endedAt - room.startedAt) / (1000 * 60)
        );
        
        await pgPool.query(
          `UPDATE room_analytics 
           SET total_watch_time_minutes = $1,
               peak_concurrent = $2
           WHERE room_id = $3 AND date = CURRENT_DATE`,
          [watchTimeMinutes, room.stats.peakParticipants, room._id.toString()]
        );
      }

      // Clean up Redis
      const redisKey = createRedisKey(REDIS_KEYS.ROOM, roomCode);
      await redisClient.del(redisKey);
      
      const usersKey = createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode);
      await redisClient.del(usersKey);
      
      const metaKey = createRedisKey(REDIS_KEYS.ROOM_METADATA, roomCode);
      await redisClient.del(metaKey);

      return room;

    } catch (error) {
      console.error('End room error:', error);
      throw error;
    }
  }

  getHostPermissions() {
    return {
      canControl: true,
      canAddToQueue: true,
      canChat: true,
      canReact: true,
      canInvite: true,
      canKick: true,
      canPromote: true
    };
  }

  getDefaultPermissions(isGuest) {
    if (isGuest) {
      return {
        canControl: false,
        canAddToQueue: true,
        canChat: true,
        canReact: true,
        canInvite: false,
        canKick: false,
        canPromote: false
      };
    }
    return {
      canControl: false,
      canAddToQueue: true,
      canChat: true,
      canReact: true,
      canInvite: false,
      canKick: false,
      canPromote: false
    };
  }
}

module.exports = new RoomService();