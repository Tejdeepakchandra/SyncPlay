const Room = require('../models/mongodb/Room');
const roomService = require('../services/roomService');
const { ROOM_STATUS } = require('../utils/constants');

const ROOM_EXPIRATION_MS = 5 * 60 * 60 * 1000; // 5 hours in milliseconds

function startRoomExpirationJob(io) {
  // Run every 5 minutes to check for expired rooms
  setInterval(async () => {
    try {
      const expirationThreshold = new Date(Date.now() - ROOM_EXPIRATION_MS);

      // Find rooms that are active/lobby/paused and were created before the threshold
      const expiredRooms = await Room.find({
        status: { $in: ['active', 'lobby', 'paused'] },
        createdAt: { $lt: expirationThreshold }
      }).select('roomCode hostId').limit(10);

      if (expiredRooms.length === 0) {
        return;
      }

      console.log(`[ROOM-EXPIRATION] Found ${expiredRooms.length} expired room(s). Ending them...`);

      for (const room of expiredRooms) {
        try {
          // End the room gracefully
          const endedRoom = await roomService.endRoom(room.roomCode, room.hostId);
          
          if (io) {
            // Notify clients in the room
            io.to(room.roomCode).emit('room:ended', { reason: 'auto_expired' });
            
            // Notify discovery page
            io.emit('discovery:rooms-updated', {
              type: endedRoom?.type || null,
              roomCode: room.roomCode,
              roomName: endedRoom?.name || null,
              reason: 'room-ended',
              at: new Date().toISOString(),
            });
          }
        } catch (err) {
          console.error(`[ROOM-EXPIRATION] Failed to end room ${room.roomCode}:`, err.message);
        }
      }
    } catch (error) {
      console.error('[ROOM-EXPIRATION] Job error:', error.message);
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
}

module.exports = { startRoomExpirationJob };
