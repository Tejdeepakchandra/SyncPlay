const redisClient = require('../config/redis');
const User = require('../models/mongodb/User');
const { createRedisKey } = require('../utils/helpers');
const { REDIS_KEYS, CACHE_TTL } = require('../utils/constants');

class PresenceService {
  
  
   // Update user presence (heartbeat) - Redis ONLY
   
  async updatePresence(userId, roomCode = null) {
    try {
      const presenceKey = createRedisKey(REDIS_KEYS.PRESENCE, userId);
      
      await redisClient.set(presenceKey, JSON.stringify({
        userId,
        roomCode,
        lastSeen: Date.now(),
        status: 'online'
      }), {
        EX: CACHE_TTL.PRESENCE
      });

      await User.updateOne(
        { clerkId: userId },
        {
          $set: {
            isOnline: true,
            currentRoom: roomCode || null,
            lastActive: new Date(),
          },
        }
      );

      return true;

    } catch (error) {
      console.error('Update presence error:', error);
      return false;
    }
  }

  
   // Batch update MongoDB for online users (using SCAN)
   
  async batchUpdateMongo() {
    try {
      const pattern = createRedisKey(REDIS_KEYS.PRESENCE, '*');
      let cursor = '0';
      const onlineUsers = [];
      const onlineUserIds = [];
      const batchSize = 100;

      do {
        // SCAN instead of KEYS
        const reply = await redisClient.scan(cursor, {
          MATCH: pattern,
          COUNT: batchSize
        });
        
        cursor = reply.cursor;
        const keys = reply.keys;

        for (const key of keys) {
          const presenceData = await redisClient.get(key);
          if (presenceData) {
            const user = JSON.parse(presenceData);
            onlineUsers.push(user);
            onlineUserIds.push(user.userId);
          }
        }

      } while (cursor !== '0');

      // BULK WRITE to MongoDB
      if (onlineUsers.length > 0) {
        const bulkOps = onlineUsers.map(user => ({
          updateOne: {
            filter: { _id: user.userId },
            update: {
              $set: {
                lastActive: new Date(user.lastSeen),
                isOnline: true,
                currentRoom: user.roomCode
              }
            }
          }
        }));

        await User.bulkWrite(bulkOps);
      }

      // Mark others offline in bulk
      await User.updateMany(
        {
          _id: { $nin: onlineUserIds },
          isOnline: true
        },
        {
          $set: {
            isOnline: false,
            lastActive: new Date()
          }
        }
      );


    } catch (error) {
      console.error('Batch update presence error:', error);
    }
  }

  
   // Get user presence
   
  async getUserPresence(userId) {
    try {
      const presenceKey = createRedisKey(REDIS_KEYS.PRESENCE, userId);
      const presence = await redisClient.get(presenceKey);
      
      if (presence) {
        return JSON.parse(presence);
      }

      return {
        userId,
        roomCode: null,
        lastSeen: null,
        status: 'offline'
      };

    } catch (error) {
      console.error('Get presence error:', error);
      return null;
    }
  }

  
   // Get all online users in a room
   
  async getRoomPresence(roomCode) {
    try {
      // Get all users in room from Redis set
      const userIds = await redisClient.sMembers(
        createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode)
      );

      const presence = [];
      for (const userId of userIds) {
        const userPresence = await this.getUserPresence(userId);
        if (userPresence.status === 'online') {
          presence.push(userPresence);
        }
      }

      return presence;

    } catch (error) {
      console.error('Get room presence error:', error);
      return [];
    }
  }

  
   // Mark user as offline (on disconnect)
   
  async setOffline(userId) {
    try {
      const presenceKey = createRedisKey(REDIS_KEYS.PRESENCE, userId);
      await redisClient.del(presenceKey);

      await User.updateOne(
        { clerkId: userId },
        {
          $set: {
            isOnline: false,
            currentRoom: null,
            lastActive: new Date(),
          },
        }
      );

      return true;

    } catch (error) {
      console.error('Set offline error:', error);
      return false;
    }
  }
}

module.exports = new PresenceService();