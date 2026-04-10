const roomService = require('../../services/roomService');
const presenceService = require('../../services/presenceService');
const analyticsService = require('../../services/analyticsService');
const { socketRateLimiter } = require('../middleware/rateLimiter');
const Room = require('../../models/mongodb/Room');

module.exports = (socket, io) => {
  const buildPermissionsForRole = (role) => {
    if (role === 'host') return roomService.getHostPermissions();
    if (role === 'co-host' || role === 'cohost') return roomService.getCoHostPermissions();
    return roomService.getDefaultPermissions(true);
  };
  
  
   // Join a room
   
  socket.on('room:join', async ({ roomCode, guestName }, callback) => {
    socketRateLimiter('room:join')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        roomCode = String(roomCode || '').trim().toUpperCase();
        if (!roomCode) {
          return callback({ success: false, error: 'Missing room code' });
        }
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

        // Find the newly joined participant from the database for full data
        const newParticipant = participants.find(p => p.userId === socket.userId);
        
        // Notify others in room with full participant data
        socket.to(roomCode).emit('room:user-joined', {
          userId: socket.userId,
          username: newParticipant?.username || guestName || socket.username,
          displayName: newParticipant?.displayName || guestName || "Guest",
          avatar: newParticipant?.avatar || null,
          avatar_emoji: newParticipant?.avatar_emoji || '🧑',
          role: newParticipant?.role || 'guest',
          isGuest: socket.isGuest,
          timestamp: Date.now()
        });

        // If original host rejoined and reclaimed host role, notify everyone.
        if (result.hostTransfer?.newHostId) {
          io.to(roomCode).emit('room:new-host', {
            newHostId: result.hostTransfer.newHostId,
            previousHost: result.hostTransfer.previousHostId,
            reason: result.hostTransfer.reason,
            restored: !!result.hostTransfer.restored,
          });
        }

        // Analytics
        const room = await Room.findOne({ roomCode }).select('_id');
        if (room && !socket.isGuest) {
          await analyticsService.logUserAction(socket.userId, 'join');
        }

        // Send success response
        callback({
          success: true,
          status: 'joined',
          userId: socket.userId,  // Include current user's ID
          room: {
            ...result.room.toObject ? result.room.toObject() : result.room,
            participantCount: participants.length,
            participants: participants
          },
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
        const roomCode = (data?.roomCode || socket.roomCode || '').toUpperCase();
        
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
            previousHost: socket.userId,
            reason: 'host-left',
            restored: false,
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
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
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
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
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
      roomCode = String(roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
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
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
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
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }

      const room = await roomService.endRoom(roomCode, socket.userId);

      // Notify all in room
      io.to(roomCode).emit('room:ended', {
        endedBy: socket.userId,
        timestamp: Date.now()
      });

      // Force disconnect all clients from this room immediately.
      const roomSockets = io.sockets.adapter.rooms.get(roomCode);
      if (roomSockets) {
        const socketIds = Array.from(roomSockets);
        for (const socketId of socketIds) {
          const clientSocket = io.sockets.sockets.get(socketId);
          if (!clientSocket) continue;

          clientSocket.leave(roomCode);
          if (clientSocket.roomCode === roomCode) {
            clientSocket.roomCode = null;
          }

          await presenceService.updatePresence(clientSocket.userId, null);
          clientSocket.emit('room:force-leave', { reason: 'room-ended', roomCode });
        }
      }

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
      roomCode = String(roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing roomCode' });
      }

      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      if (room.status === 'ended') {
        return callback({ success: false, error: 'Room has ended', code: 'ROOM_ENDED' });
      }

      const participants = await roomService.getRoomParticipants(roomCode);

      callback({
        success: true,
        userId: socket.userId,  // Include current user's ID
        room: {
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          hostId: room.hostId,
          currentMedia: room.currentMedia,
          settings: room.settings,
          participantCount: participants.length,
          participants: participants,
          joinRequests: room.joinRequests || [],
          waitingUsers: room.waitingUsers || [],
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

  // Update participant permissions (host only)
  socket.on('room:update-participant-permissions', async ({ roomCode, targetUserId, restrictions }, callback) => {
    try {
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
      console.log(`[PERMISSIONS] 🔒 Host ${socket.userId} updating permissions for ${targetUserId}:`, restrictions);

      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      // Verify moderator (host or co-host)
      const actingParticipant = room.participants.find(p => p.userId === socket.userId);
      const isModerator = room.hostId === socket.userId || actingParticipant?.role === 'co-host' || actingParticipant?.role === 'cohost';
      if (!isModerator) {
        return callback({ success: false, error: 'Only host/co-host can update permissions' });
      }

      // Find participant
      const participant = room.participants.find(p => p.userId === targetUserId);
      if (!participant) {
        return callback({ success: false, error: 'Participant not found' });
      }

      // Update restrictions (partial merge to preserve existing values)
      const currentRestrictions = participant.restrictions || {};
      participant.restrictions = {
        micDisabledByHost: restrictions.micDisabledByHost ?? currentRestrictions.micDisabledByHost ?? false,
        videoDisabledByHost: restrictions.videoDisabledByHost ?? currentRestrictions.videoDisabledByHost ?? false,
        chatDisabledByHost: restrictions.chatDisabledByHost ?? currentRestrictions.chatDisabledByHost ?? false,
        mediaControlDisabledByHost: restrictions.mediaControlDisabledByHost ?? currentRestrictions.mediaControlDisabledByHost ?? false,
        restrictedAt: new Date(),
        restrictedBy: socket.userId
      };

      // Keep canControl in sync with media-control restriction for this participant.
      if (participant.restrictions.mediaControlDisabledByHost) {
        participant.permissions = {
          ...(participant.permissions || {}),
          canControl: false,
        };
      } else {
        const rolePermissions = buildPermissionsForRole(participant.role);
        participant.permissions = {
          ...(participant.permissions || {}),
          canControl: !!rolePermissions.canControl,
        };
      }

      room.version += 1;
      await room.save();

      console.log(`[PERMISSIONS] ✅ Permissions updated for ${targetUserId}`);

      // Notify the affected user about restriction
      io.to(roomCode).emit('room:participant-permissions-updated', {
        userId: targetUserId,
        targetUserId,
        restrictions: participant.restrictions,
        permissions: participant.permissions,
        updatedBy: socket.userId,
        message: `Permissions have been changed by the host`
      });

      callback({ 
        success: true, 
        message: 'Permissions updated',
        restrictions: participant.restrictions,
        permissions: participant.permissions,
      });
    } catch (error) {
      console.error('[PERMISSIONS] ❌ Error updating permissions:', error);
      callback({
        success: false,
        error: error.message,
      });
    }
  });

  // Promote/Demote user to co-host (host only)
  socket.on('room:update-role', async ({ roomCode, targetUserId, newRole }, callback) => {
    try {
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
      console.log(`[ROLE] 👑 Host ${socket.userId} updating role for ${targetUserId} to ${newRole}`);

      const normalizedRole = newRole === 'cohost' ? 'co-host' : newRole;

      if (!['guest', 'participant', 'co-host'].includes(normalizedRole)) {
        return callback({ success: false, error: 'Invalid role update target' });
      }

      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      // Verify host
      if (room.hostId !== socket.userId) {
        return callback({ success: false, error: 'Only host can update roles' });
      }

      // Find participant
      const participant = room.participants.find(p => p.userId === targetUserId);
      if (!participant) {
        return callback({ success: false, error: 'Participant not found' });
      }

      // Don't allow demoting the host
      if (participant.role === 'host' && newRole !== 'host') {
        return callback({ success: false, error: 'Cannot change host role' });
      }

      participant.role = normalizedRole;
      participant.permissions = buildPermissionsForRole(normalizedRole);

      // Keep room.coHosts aligned with participant roles
      const currentCoHosts = new Set(room.coHosts || []);
      if (normalizedRole === 'co-host') {
        currentCoHosts.add(targetUserId);
      } else {
        currentCoHosts.delete(targetUserId);
      }
      room.coHosts = Array.from(currentCoHosts);

      room.version += 1;
      await room.save();

      console.log(`[ROLE] ✅ Role updated for ${targetUserId} to ${normalizedRole}`);

      // Broadcast role change to all users in room
      io.to(roomCode).emit('room:participant-role-updated', {
        userId: targetUserId,
        targetUserId,
        newRole: normalizedRole,
        updatedBy: socket.userId,
        message: `${participant.displayName} is now a ${normalizedRole}`
      });

      // Backward-compatible event name used by some clients
      io.to(roomCode).emit('room:role-updated', {
        userId: targetUserId,
        targetUserId,
        newRole: normalizedRole,
        updatedBy: socket.userId,
        message: `${participant.displayName} is now a ${normalizedRole}`
      });

      callback({ 
        success: true, 
        message: 'Role updated',
        newRole: normalizedRole
      });
    } catch (error) {
      console.error('[ROLE] ❌ Error updating role:', error);
      callback({
        success: false,
        error: error.message,
      });
    }
  });

  // Remove participant from room (host/co-host)
  socket.on('room:remove-participant', async ({ roomCode, targetUserId }, callback) => {
    try {
      roomCode = String(roomCode || socket.roomCode || '').trim().toUpperCase();
      if (!roomCode) {
        return callback({ success: false, error: 'Missing room code' });
      }
      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      if (room.hostId !== socket.userId) {
        return callback({ success: false, error: 'Only host can remove participants' });
      }

      if (targetUserId === room.hostId) {
        return callback({ success: false, error: 'Cannot remove host from room' });
      }

      const targetParticipant = room.participants.find(p => p.userId === targetUserId);
      if (!targetParticipant) {
        return callback({ success: false, error: 'Participant not found' });
      }

      await roomService.leaveRoom(roomCode, targetUserId);

      // Force target user's socket(s) out of room and notify them
      const roomSockets = await io.in(roomCode).fetchSockets();
      roomSockets
        .filter((s) => s.userId === targetUserId)
        .forEach((s) => {
          s.leave(roomCode);
          s.roomCode = null;
          s.emit('room:force-leave', {
            reason: 'removed-by-host',
            removedBy: socket.userId,
            roomCode,
          });
        });

      io.to(roomCode).emit('room:user-left', {
        userId: targetUserId,
        timestamp: Date.now(),
        removedBy: socket.userId,
      });

      callback({ success: true, message: 'Participant removed' });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};