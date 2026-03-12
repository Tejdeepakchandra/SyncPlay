const { authenticateSocket } = require('./middleware/auth');
const roomHandlers = require('./handlers/roomHandlers');
const syncHandlers = require('./handlers/syncHandlers');
const presenceHandlers = require('./handlers/presenceHandlers');
const roomService = require('../services/roomService');
const presenceService = require('../services/presenceService');
const momentHandlers = require('./handlers/momentHandlers');


 // Setup all socket handlers

const setupSocketHandlers = (io) => {
  // Authentication middleware for all sockets
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} (User: ${socket.userId})`);

    // Initialize all handlers
    roomHandlers(socket, io);
    syncHandlers(socket, io);
    presenceHandlers(socket, io);
    momentHandlers(socket, io);

    // Auto-leave room and cleanup on disconnect — FIXED
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${socket.id} (User: ${socket.userId})`);
      
      // Auto-leave room if user was in one
      if (socket.roomCode) {
        try {
          // First leave the room properly
          const result = await roomService.leaveRoom(socket.roomCode, socket.userId);
          
          // Notify others
          socket.to(socket.roomCode).emit('room:user-left', {
            userId: socket.userId,
            timestamp: Date.now(),
            autoLeft: true
          });

          // If host left and new host promoted, notify
          if (result.newHostId) {
            io.to(socket.roomCode).emit('room:new-host', {
              newHostId: result.newHostId,
              previousHost: socket.userId
            });
          }

        } catch (error) {
          console.error('Auto-leave error:', error);
        }
      }

      // Then mark as offline
      if (!socket.isGuest) {
        await presenceService.setOffline(socket.userId);
      }
    });
  });

  // Periodic cleanup (every 5 minutes)
  setInterval(() => {
    
  }, 5 * 60 * 1000);
};

module.exports = { setupSocketHandlers };