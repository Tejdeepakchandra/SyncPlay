const presenceService = require('../../services/presenceService');
const roomService = require('../../services/roomService');

module.exports = (socket, io) => {
  
  
   // Heartbeat to keep presence alive
   
  socket.on('presence:heartbeat', async ({ roomCode }) => {
    await presenceService.updatePresence(socket.userId, roomCode);
    
    // Broadcast to room that user is active
    if (roomCode) {
      socket.to(roomCode).emit('presence:active', {
        userId: socket.userId,
        timestamp: Date.now()
      });
    }
  });

  
   // Get online users in room
   
  socket.on('presence:get-room', async ({ roomCode }, callback) => {
    try {
      const presence = await presenceService.getRoomPresence(roomCode);
      callback({ 
        success: true, 
        presence 
      });
    } catch (error) {
      callback({ 
        success: false, 
        error: error.message 
      });
    }
  });

  
   //Get user presence
  
  socket.on('presence:get-user', async ({ userId }, callback) => {
    try {
      const presence = await presenceService.getUserPresence(userId);
      callback({ 
        success: true, 
        presence 
      });
    } catch (error) {
      callback({ 
        success: false, 
        error: error.message 
      });
    }
  });
};