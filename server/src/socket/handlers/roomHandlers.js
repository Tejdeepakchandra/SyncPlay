const roomService = require('../../services/roomService');
const presenceService = require('../../services/presenceService');
const analyticsService = require('../../services/analyticsService');
const { socketRateLimiter } = require('../middleware/rateLimiter');
const Room = require('../../models/mongodb/Room');

module.exports = (socket, io) => {
  
  
   // Join a room
   
  socket.on('room:join', async ({ roomCode, guestName }, callback) => {
    socketRateLimiter('room:join')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        console.log(`[ROOM:JOIN] 🚪 User ${socket.userId} attempting to join room ${roomCode} (guestName: "${guestName}")`);
        
        const result = await roomService.joinRoom(
          roomCode,
          socket.userId,
          guestName  // Pass guest name (for guests entering a private room)
        );

        console.log(`[ROOM:JOIN] 📊 joinRoom returned status: "${result.status}"`);

        // Check if waiting for approval (private room, not invited)
        if (result.status === 'waiting_for_approval') {
          console.log(`[ROOM:JOIN] ⏳ ${guestName} (${socket.userId}) put in waiting area for approval`);
          
          // Notify host of waiting join request
          const room = await Room.findOne({ roomCode });
          io.to(roomCode).emit('room:join-request', {
            userId: socket.userId,
            username: guestName,
            message: `${guestName} is requesting to join the room`
          });

          // Send waiting response to guest
          return callback({
            success: true,
            status: 'waiting_for_approval',
            message: result.message,
            room: result.room
          });
        }

        // NORMAL JOIN (public room or invited user in private room or already approved)
        console.log(`[ROOM:JOIN] ✅ Proceeding with normal join for ${socket.userId}`);
        
        // Join socket.io room
        socket.join(roomCode);
        
        // Store room mapping in socket data
        socket.roomCode = roomCode;

        // Update presence
        await presenceService.updatePresence(socket.userId, roomCode);

        // Get current participants
        const participants = await roomService.getRoomParticipants(roomCode);
        console.log(`[ROOM:JOIN] 📤 Sending success response, participants count: ${participants.length}`);

        // Notify others in room
        socket.to(roomCode).emit('room:user-joined', {
          userId: socket.userId,
          username: guestName || socket.username,
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
          status: 'joined',
          room: result.room,
          participants,
          isHost: result.room.hostId === socket.userId  // String comparison
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
   
  // Host accepts a join request from a waiting guest
  socket.on('room:accept-join-request', async ({ roomCode, userId }, callback) => {
    try {
      console.log(`[ROOM] 🔔 Host ${socket.userId} accepting join request for guest ${userId} in room ${roomCode}`);
      
      const result = await roomService.acceptJoinRequest(roomCode, socket.userId, userId);
      
      console.log(`[ROOM] ✅ Host accepted join request for ${userId}. Broadcasting room:join-accepted...`);
      console.log(`[ROOM] 📢 Broadcasting with userId: ${userId}, roomCode: ${roomCode}`);
      
      // Broadcast to ALL connected clients (not just room) so guest can receive it
      // even if they're not in the socket.io room yet
      io.emit('room:join-accepted', {
        userId,
        roomCode,
        message: 'Your join request has been accepted! Joining room...'
      });

      callback({ success: true, message: 'Guest accepted' });
    } catch (error) {
      console.error('[ROOM] ❌ Error accepting join request:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  // Host rejects a join request from a waiting guest
  socket.on('room:reject-join-request', async ({ roomCode, userId }, callback) => {
    try {
      const result = await roomService.rejectJoinRequest(roomCode, socket.userId, userId);
      
      console.log(`[ROOM] ❌ Host rejected join request for ${userId}`);
      
      // Broadcast rejection to all connected clients
      io.emit('room:join-rejected', {
        userId,
        roomCode,
        message: 'Your join request has been rejected by the host.'
      });

      callback({ success: true, message: 'Guest rejected' });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
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

  // Get room state (before joining)
  socket.on('room:get-state', async ({ roomCode }, callback) => {
    try {
      if (!roomCode) {
        return callback({ success: false, error: 'Missing roomCode' });
      }

      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      const participants = await roomService.getRoomParticipants(roomCode);

      callback({
        success: true,
        room: {
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          hostId: room.hostId,
          currentMedia: room.currentMedia,
          settings: room.settings,
        },
        participants,
      });
    } catch (error) {
      callback({
        success: false,
        error: error.message,
      });
    }
  });
};