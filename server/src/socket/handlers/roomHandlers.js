const roomService = require('../../services/roomService');
const presenceService = require('../../services/presenceService');
const analyticsService = require('../../services/analyticsService');
const { socketRateLimiter } = require('../middleware/rateLimiter');
const Room = require('../../models/mongodb/Room');

module.exports = (socket, io) => {
  
  
   // Join a room
   
  socket.on('room:join', async ({ roomCode }, callback) => {
    socketRateLimiter('room:join')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        const result = await roomService.joinRoom(
          roomCode,
          socket.userId,
          socket.isGuest
        );                              // Remember one thing socket.to().emit() will send to everyone in the room except the sender.
                                        // And io.to().emit() will send to everyone in the room including the sender.
        // Join socket.io room
        socket.join(roomCode);
        
        // Store room mapping in socket data
        socket.roomCode = roomCode;

        // Update presence
        await presenceService.updatePresence(socket.userId, roomCode);

        // Get current participants
        const participants = await roomService.getRoomParticipants(roomCode);

        // Notify others in room
        socket.to(roomCode).emit('room:user-joined', {
          userId: socket.userId,
          isGuest: socket.isGuest,
          timestamp: Date.now()
        });

        // Analytics
        const room = await Room.findOne({ roomCode }).select('_id');
        if (room && !socket.isGuest) {
          await analyticsService.logUserAction(socket.userId, 'join');
        }

        // Send success response
        callback({
          success: true,
          room: result.room,
          participants,
          isHost: result.room.hostId.toString() === socket.userId.toString()
        });

      } catch (error) {
        callback({ 
          success: false, 
          error: error.message 
        });
      }
    });
  });

  
   // Leave current room
   
  socket.on('room:leave', async (data, callback) => {
    socketRateLimiter('room:leave')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        const roomCode = socket.roomCode;
        
        if (!roomCode) {
          return callback({ 
            success: false, 
            error: 'Not in a room' 
          });
        }

        const result = await roomService.leaveRoom(roomCode, socket.userId);

        // Leave socket.io room
        socket.leave(roomCode);
        const oldRoomCode = socket.roomCode;
        socket.roomCode = null;

        // Update presence
        await presenceService.updatePresence(socket.userId, null);

        // Notify others
        socket.to(roomCode).emit('room:user-left', {
          userId: socket.userId,
          timestamp: Date.now()
        });

        // If host left and new host promoted, notify
        if (result.newHostId) {
          io.to(roomCode).emit('room:new-host', {
            newHostId: result.newHostId,
            previousHost: socket.userId
          });
        }

        callback({ 
          success: true,
          participants: result.participants
        });

      } catch (error) {
        callback({ 
          success: false, 
          error: error.message 
        });
      }
    });
  });

  
   // Get room info
   
  socket.on('room:info', async ({ roomCode }, callback) => {
    try {
      const room = await roomService.getRoomByCode(roomCode);
      const participants = await roomService.getRoomParticipants(roomCode);

      callback({
        success: true,
        room,
        participants
      });

    } catch (error) {
      callback({ 
        success: false, 
        error: error.message 
      });
    }
  });

  
   // Update room settings (host only)
   
  socket.on('room:update-settings', async ({ roomCode, settings }, callback) => {
    try {
      const room = await roomService.updateRoomSettings(
        roomCode,
        socket.userId,
        settings
      );

      // Broadcast updated settings to all in room          
      io.to(roomCode).emit('room:settings-updated', {
        settings: room.settings,
        updatedBy: socket.userId
      });

      callback({ success: true, room });

    } catch (error) {
      callback({ 
        success: false, 
        error: error.message 
      });
    }
  });

  
   // End room (host only)
   
  socket.on('room:end', async ({ roomCode }, callback) => {
    try {
      const room = await roomService.endRoom(roomCode, socket.userId);

      // Notify all in room
      io.to(roomCode).emit('room:ended', {
        endedBy: socket.userId,
        timestamp: Date.now()
      });

      // Force disconnect all clients from this room after delay
      setTimeout(() => {
        const roomSockets = io.sockets.adapter.rooms.get(roomCode);
        if (roomSockets) {
          roomSockets.forEach(socketId => {
            const clientSocket = io.sockets.sockets.get(socketId);
            if (clientSocket) {
              clientSocket.leave(roomCode);
              clientSocket.emit('room:force-leave', { reason: 'room-ended' });
            }
          });
        }
      }, 3000);

      callback({ success: true });

    } catch (error) {
      callback({ 
        success: false, 
        error: error.message 
      });
    }
  });
};