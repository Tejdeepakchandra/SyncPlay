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
      const startTime = Date.now();
      console.log(`[ROOM-SERVICE] 🔄 Creating room for user ${hostId.substring(0, 8)}...`);
      
      // Create room immediately - don't wait for user to exist in DB
      // User creation happens async via Clerk webhook
      
      // Generate unique room code
      console.log(`[ROOM-SERVICE] 📝 Generating room code...`);
      const roomCode = await Room.generateRoomCode();
      console.log(`[ROOM-SERVICE] ✓ Room code: ${roomCode}`);

      // Create room with minimal participant info
      console.log(`[ROOM-SERVICE] 💾 Saving room to MongoDB...`);
      const room = new Room({
        roomCode,
        name: roomData.name,
        type: roomData.type,
        description: roomData.description || '',
        hostId,
        maxParticipants: roomData.settings?.maxParticipants || 20,
        participantCount: 1,  // Host is initial participant
        settings: {
          privacy: roomData.settings?.privacy || PRIVACY_LEVELS.PUBLIC,
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
          username: `user_${hostId.slice(-6)}`, // Temp name, will update via webhook
          displayName: 'Host', // Will be updated when host joins
          avatar: 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
          role: 'host',
          permissions: this.getHostPermissions()
        }]
      });

      await room.save();
      console.log(`[ROOM-SERVICE] ✓ Room saved (${Date.now() - startTime}ms)`);

      // Store in Redis for quick access
      console.log(`[ROOM-SERVICE] 📤 Caching in Redis...`);
      const redisKey = createRedisKey(REDIS_KEYS.ROOM, roomCode);
      await redisClient.set(redisKey, JSON.stringify({
        id: room._id.toString(),
        roomCode,
        name: room.name,
        type: room.type,
        hostId: room.hostId,  // Already a string, no .toString() needed
        status: room.status,
        participantCount: 1,
        version: room.version,
        settings: room.settings
      }), {
        EX: CACHE_TTL.ROOM
      });

      // Track in Redis for presence
      await redisClient.sAdd(createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode), hostId);
      
      // Room metadata for atomic operations
      await redisClient.hSet(createRedisKey(REDIS_KEYS.ROOM_METADATA, roomCode), {
        participant_count: '1',
        max_participants: room.maxParticipants.toString(),
        last_activity: Date.now().toString()
      });

      console.log(`[ROOM-SERVICE] ✅ Room created successfully (${Date.now() - startTime}ms)`);
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
      const room = await Room.findOne({ roomCode });
        // Can't populate because userIds are now Clerk strings, not MongoDB ObjectIds

      if (room) {
        // Cache in Redis
        await redisClient.set(redisKey, JSON.stringify({
          id: room._id.toString(),
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          hostId: room.hostId,  // Already a string
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
   
  async joinRoom(roomCode, userId, guestName = null) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');

      const isGuest = userId.startsWith('guest-');
      const isHost = room.hostId === userId;  // Check if this is the host
      const isAlreadyParticipant = room.participants.some(p => p.userId === userId);  // Check if already approved
      const isInvited = room.invitedUsers?.some(inv => 
        inv.userId === userId || (isGuest && inv.email === userId)
      );

      console.log(`[ROOM-SERVICE] 🔍 Join analysis for ${userId}:`, {
        isHost,
        isAlreadyParticipant,
        isInvited,
        privacy: room.settings.privacy,
        participantIds: room.participants.map(p => p.userId)
      });

      // HOST BYPASS - Host created the room, they can join directly
      if (isHost) {
        console.log(`[ROOM-SERVICE] 👑 Host ${userId} joining their room (${roomCode})`);
        // Update host's displayName with the one sent from client
        const hostParticipant = room.participants.find(p => p.userId === userId);
        if (hostParticipant && guestName) {
          hostParticipant.displayName = guestName;
          console.log(`[ROOM-SERVICE] ✏️ Updated host displayName to: "${guestName}"`);
        }
        // Skip all access control - host has all rights
      }
      // ALREADY APPROVED - If user is already in participants, they were approved and can join
      else if (isAlreadyParticipant) {
        console.log(`[ROOM-SERVICE] ✅ Already approved participant ${userId} re-joining (${roomCode})`);
        // Skip all access control - they're already in the room
      }
      // PRIVATE/INVITE-ONLY ROOM ACCESS LOGIC (only for non-hosts and non-approved)
      else if (room.settings.privacy === PRIVACY_LEVELS.PRIVATE || 
          room.settings.privacy === PRIVACY_LEVELS.INVITE_ONLY) {
        
        // For private rooms: guests must be invited
        // For invite-only: everyone must be invited
        if (!isInvited) {
          // Guest is not invited - put in waiting area and request approval
          console.log(`[ROOM-SERVICE] 🚪 Guest ${guestName} (${userId}) requesting access to private room`);
          
          // Add to join requests if not already there
          if (!room.joinRequests.some(jr => jr.userId === userId)) {
            room.joinRequests.push({
              userId,
              username: guestName || userId,
              requestedAt: new Date(),
              status: 'pending'
            });
          }

          // Add to waiting area
          if (!room.waitingUsers.some(wu => wu.userId === userId)) {
            room.waitingUsers.push({
              userId,
              username: guestName || userId,
              displayName: guestName || 'Guest',
              avatar: null,
              joinRequestedAt: new Date(),
              role: 'guest'
            });
          }

          await room.save();

          // Return special response indicating waiting for approval
          return {
            room,
            status: 'waiting_for_approval',
            message: `Join request sent to host. Waiting for ${room.name} host to approve.`,
            participantCount: room.participants.length
          };
        }
        // If invited, continue to normal join logic below
      }

      // NORMAL JOIN LOGIC (public rooms or invited users in private rooms)

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
          room.maxParticipants.toString(),
          Date.now().toString()
        ]
      });

      if (result[1] === 'room_full') {
        throw new Error('Room is full');
      }

      // Add to MongoDB (canonical participant list) if not already there
      if (!room.participants.some(p => p.userId === userId)) {
        room.participants.push({
          userId,
          username: guestName || (isGuest ? `guest-${userId.slice(-4)}` : `user_${userId.slice(-6)}`),
          displayName: guestName || (isGuest ? 'Guest' : 'User'),
          avatar: isGuest ? null : 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
          avatar_emoji: '🧑',  // Default emoji for participant avatars
          role: isGuest ? 'guest' : 'participant',
          joinedAt: new Date(),
          permissions: this.getDefaultPermissions(isGuest)
        });
        
        // Remove from waiting area if they were there
        room.waitingUsers = room.waitingUsers.filter(wu => wu.userId !== userId);
        // Mark join request as accepted
        room.joinRequests = room.joinRequests.map(jr => 
          jr.userId === userId ? { ...jr, status: 'accepted' } : jr
        );

        // Update participant count (fallback to array length if result invalid)
        const currentCount = result && result[2] ? parseInt(result[2]) : room.participants.length;
        if (!isNaN(currentCount)) {
          room.participantCount = currentCount;
          room.version += 1;
          await room.save();

          // Update peak participants if needed
          if (currentCount > room.stats.peakParticipants) {
            room.stats.peakParticipants = currentCount;
            await room.save();
          }
        }
      } else if (isHost && guestName) {
        // Update host's displayName if they already exist (shouldn't happen, but safety check)
        const existingHost = room.participants.find(p => p.userId === userId);
        if (existingHost) {
          existingHost.displayName = guestName;
          // Update participant count just in case
          const currentCount = result && result[2] ? parseInt(result[2]) : room.participants.length;
          if (!isNaN(currentCount)) {
            room.participantCount = currentCount;
            await room.save();
          }
        }
      }

      const finalCount = result && result[2] ? parseInt(result[2]) : room.participants.length;
      return { room, status: 'joined', participantCount: isNaN(finalCount) ? room.participants.length : finalCount };

    } catch (error) {
      console.error('Join room error:', error);
      throw error;
    }
  }

  // Handle host accepting a join request
  async acceptJoinRequest(roomCode, hostId, userId) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');

      if (room.hostId !== hostId) {
        throw new Error('Only host can accept join requests');
      }

      // Find and remove from waiting users
      const waitingUser = room.waitingUsers.find(wu => wu.userId === userId);
      if (!waitingUser) {
        throw new Error('User not in waiting area');
      }

      // Add to participants with all required fields explicitly set
      if (!room.participants.some(p => p.userId === userId)) {
        room.participants.push({
          userId: waitingUser.userId,
          username: waitingUser.username,
          displayName: waitingUser.displayName || 'Guest',
          avatar: waitingUser.avatar || null,
          avatar_emoji: '🧑',  // Default emoji for participant avatars
          role: 'guest',
          joinedAt: new Date(),
          permissions: this.getDefaultPermissions(true),
          streamSettings: {
            videoEnabled: true,
            audioEnabled: true,
            screenShare: false
          },
          lastActive: new Date()
        });
      }

      // Remove from waiting and mark request as accepted
      room.waitingUsers = room.waitingUsers.filter(wu => wu.userId !== userId);
      room.joinRequests = room.joinRequests.map(jr =>
        jr.userId === userId ? { ...jr, status: 'accepted' } : jr
      );

      room.participantCount = room.participants.length;
      room.version += 1;
      await room.save();

      return { success: true, room };
    } catch (error) {
      console.error('Accept join request error:', error);
      throw error;
    }
  }

  // Handle host rejecting a join request
  async rejectJoinRequest(roomCode, hostId, userId) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');

      if (room.hostId !== hostId) {
        throw new Error('Only host can reject join requests');
      }

      // Remove from waiting area and mark as rejected
      room.waitingUsers = room.waitingUsers.filter(wu => wu.userId !== userId);
      room.joinRequests = room.joinRequests.map(jr =>
        jr.userId === userId ? { ...jr, status: 'rejected' } : jr
      );

      room.version += 1;
      await room.save();

      return { success: true, message: 'Join request rejected' };
    } catch (error) {
      console.error('Reject join request error:', error);
      throw error;
    }
  }

  
   // Leave a room with host reassignment
   
  async leaveRoom(roomCode, userId) {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) throw new Error('Room not found');

      // Check if leaving user is host
      const isHost = room.hostId === userId;  // Both are strings now
      let newHostId = null;

      if (isHost) {
        // Find next host (co-host first, then oldest participant)
        const coHost = room.participants.find(p => 
          p.role === 'cohost' && p.userId !== userId  // Both are strings now
        );
        
        if (coHost) {
          newHostId = coHost.userId;
        } else {
          // Promote oldest participant (excluding guests)
          const oldestParticipant = room.participants
            .filter(p => p.role !== 'guest' && p.userId !== userId)  // Both are strings now
            .sort((a, b) => a.joinedAt - b.joinedAt)[0];
          
          newHostId = oldestParticipant?.userId || null;
        }

        if (newHostId) {
          room.hostId = newHostId;
          // Update role
          const newHost = room.participants.find(p => p.userId === newHostId);  // Both are strings now
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
        p => p.userId === userId  // Both are strings now
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

 
 // Get room participants (from Room document, not User model)
 
async getRoomParticipants(roomCode) {
  try {
    const room = await Room.findOne({ roomCode })
      .select('participants')
      .lean();

    if (!room) {
      console.warn(`[ROOM-SERVICE] Room not found: ${roomCode}`);
      return [];
    }

    // Room already has all participant data with usernames, displayNames, avatars
    // No need to query User model - use the data already stored in participants array
    return room.participants || [];

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