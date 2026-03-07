const pgPool = require('../config/postgres');

class AnalyticsService {

 
   // Ensure room exists in PostgreSQL
  
  async ensureRoom(roomId, roomCode, roomType, hostId, createdAt) {
    try {
      await pgPool.query(
        `INSERT INTO rooms (id, room_code, room_type, host_id, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [roomId, roomCode, roomType, hostId, createdAt]
      );
    } catch (error) {
      console.error('Ensure room error:', error);
    }
  }

  
   //Log room event
   
  async logRoomEvent(roomId, eventType, userId = null, data = {}) {
    try {
      await pgPool.query(
        `INSERT INTO room_events (room_id, event_type, user_id, data, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [roomId, eventType, userId, JSON.stringify(data)]
      );
    } catch (error) {
      console.error('Log room event error:', error);
    }
  }

  
   // Update room stats
   
  async updateRoomStats(roomId, stats) {
    try {
      await pgPool.query(
        `INSERT INTO room_analytics (room_id, date, participant_count, peak_concurrent)
         VALUES ($1, CURRENT_DATE, $2, $3)
         ON CONFLICT (room_id, date) 
         DO UPDATE SET 
           participant_count = $2,
           peak_concurrent = GREATEST(room_analytics.peak_concurrent, $3),
           updated_at = NOW()`,
        [roomId, stats.participantCount || 0, stats.peakParticipants || 0]
      );
    } catch (error) {
      console.error('Update room stats error:', error);
    }
  }

  
 // Increment sync action count — with column safety
 
async incrementSyncAction(roomId, actionType) {
  try {
    
    let column = '';
    switch (actionType) {
      case 'play':
      case 'pause':
        column = 'play_pause_count';
        break;
      case 'seek':
        column = 'seek_count';
        break;
      default:
        return;
    }

    
    await pgPool.query(
      `UPDATE room_analytics 
       SET ${column} = ${column} + 1,
           updated_at = NOW()
       WHERE room_id = $1 AND date = CURRENT_DATE`,
      [roomId]
    );
  } catch (error) {
    console.error('Increment sync action error:', error);
  }
}

 
  // Log user action
 
  async logUserAction(userId, action, metadata = {}) {
    try {
      let column = '';
      const values = [userId];

      switch (action) {
        case 'message':
          column = 'messages_sent';
          break;
        case 'reaction':
          column = 'reactions_sent';
          break;
        case 'join':
          column = 'rooms_joined';
          break;
        case 'create':
          column = 'rooms_created';
          break;
        case 'watch_time':
          column = 'watch_time_minutes';
          values.push(metadata.minutes || 0);
          break;
        default:
          return;
      }

      if (action === 'watch_time') {
        await pgPool.query(
          `INSERT INTO user_engagement (user_id, date, ${column})
           VALUES ($1, CURRENT_DATE, $2)
           ON CONFLICT (user_id, date) 
           DO UPDATE SET ${column} = user_engagement.${column} + $2`,
          values
        );
      } else {
        await pgPool.query(
          `INSERT INTO user_engagement (user_id, date, ${column})
           VALUES ($1, CURRENT_DATE, 1)
           ON CONFLICT (user_id, date) 
           DO UPDATE SET ${column} = user_engagement.${column} + 1`,
          values
        );
      }
    } catch (error) {
      console.error('Log user action error:', error);
    }
  }
}

module.exports = new AnalyticsService();