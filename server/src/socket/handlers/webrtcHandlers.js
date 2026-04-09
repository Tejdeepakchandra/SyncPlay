/**
 * WebRTC Signaling Handlers
 * Manages peer-to-peer connection setup via Socket.IO
 */

const Room = require('../../models/mongodb/Room');

module.exports = (socket, io) => {
  const emitToUserInRoom = async (roomCode, targetUserId, eventName, payload) => {
    const socketsInRoom = await io.in(roomCode).fetchSockets();
    socketsInRoom
      .filter((roomSocket) => roomSocket.userId === targetUserId)
      .forEach((roomSocket) => roomSocket.emit(eventName, payload));
  };

  /**
   * Helper function to check if user has permission
   */
  const checkPermissions = async (roomCode, userId, permissionType) => {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) return { allowed: false, error: 'Room not found' };

      const participant = room.participants.find(p => p.userId === userId);
      if (!participant) return { allowed: false, error: 'Participant not found' };

      // Host always has permissions
      if (participant.role === 'host') return { allowed: true };

      // Check restrictions
      if (permissionType === 'audio' && participant.restrictions?.micDisabledByHost) {
        return { allowed: false, error: 'Microphone has been disabled by host', error_code: 'MIC_DISABLED_BY_HOST' };
      }
      if (permissionType === 'video' && participant.restrictions?.videoDisabledByHost) {
        return { allowed: false, error: 'Video has been disabled by host', error_code: 'VIDEO_DISABLED_BY_HOST' };
      }
      if (permissionType === 'chat' && participant.restrictions?.chatDisabledByHost) {
        return { allowed: false, error: 'Chat has been disabled by host', error_code: 'CHAT_DISABLED_BY_HOST' };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[PERMISSIONS] Error checking permissions:', error);
      return { allowed: false, error: error.message };
    }
  };

  /**
   * WebRTC Star Topology (Host → Participants)
   * Host broadcasts screen/video to all participants
   */

  // Participant requests stream from host
  socket.on('webrtc:request-stream', ({ roomCode, from }) => {
    try {
      if (!roomCode) return;
      // Broadcast to host in the room
      io.to(roomCode).emit('webrtc:request-stream', {
        from,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:request-stream error:', error);
    }
  });

  // Send offer to peer
  socket.on('webrtc:offer', async ({ roomCode, to, sdp, from }) => {
    try {
      if (!roomCode || !to) return;
      await emitToUserInRoom(roomCode, to, 'webrtc:offer', {
        from,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:offer error:', error);
    }
  });

  // Send answer to peer
  socket.on('webrtc:answer', async ({ roomCode, to, sdp, from }) => {
    try {
      if (!roomCode || !to) return;
      await emitToUserInRoom(roomCode, to, 'webrtc:answer', {
        from,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:answer error:', error);
    }
  });

  // Send ICE candidate to peer
  socket.on('webrtc:ice-candidate', async ({ roomCode, to, candidate, from }) => {
    try {
      if (!roomCode || !to) return;
      await emitToUserInRoom(roomCode, to, 'webrtc:ice-candidate', {
        from,
        candidate,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:ice-candidate error:', error);
    }
  });

  // Notify stream stopped
  socket.on('webrtc:stream-stopped', ({ roomCode, from }) => {
    try {
      if (!roomCode) return;
      io.to(roomCode).emit('webrtc:stream-stopped', {
        from,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:stream-stopped error:', error);
    }
  });

  /**
   * WebRTC Mesh Topology (Everyone ↔ Everyone)
   * Full mesh network with all participants connected
   */

  // Announce participant joining mesh
  socket.on('webrtc-mesh:join', async ({ roomCode }) => {
    try {
      if (!roomCode) return;

      // Allow mesh join even if video is disabled - user can participate with audio only
      // Video permission is checked when they actually try to share video tracks

      socket.to(roomCode).emit('webrtc-mesh:join', {
        from: socket.userId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:join error:', error);
    }
  });

  // Announce participant leaving mesh
  socket.on('webrtc-mesh:leave', async ({ roomCode }) => {
    try {
      if (!roomCode) return;

      socket.to(roomCode).emit('webrtc-mesh:leave', {
        from: socket.userId,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:leave error:', error);
    }
  });

  // Send mesh offer
  socket.on('webrtc-mesh:offer', async ({ roomCode, to, sdp }) => {
    try {
      if (!roomCode || !to) return;
      await emitToUserInRoom(roomCode, to, 'webrtc-mesh:offer', {
        from: socket.userId,
        to,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:offer error:', error);
    }
  });

  // Send mesh answer
  socket.on('webrtc-mesh:answer', async ({ roomCode, to, sdp }) => {
    try {
      if (!roomCode || !to) return;
      await emitToUserInRoom(roomCode, to, 'webrtc-mesh:answer', {
        from: socket.userId,
        to,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:answer error:', error);
    }
  });

  // Send mesh ICE candidate
  socket.on('webrtc-mesh:ice-candidate', async ({ roomCode, to, candidate }) => {
    try {
      if (!roomCode || !to) return;
      await emitToUserInRoom(roomCode, to, 'webrtc-mesh:ice-candidate', {
        from: socket.userId,
        to,
        candidate,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:ice-candidate error:', error);
    }
  });

  /**
   * Audio State Tracking
   * Track participant speaking, muted, and audio enabled states
   */

  // Participant broadcasts their audio state (speaking, muted, audioEnabled)
  socket.on('audio:state-change', async ({ roomCode, userId, audioEnabled, isMuted, isSpeaking }) => {
    try {
      if (!roomCode || !userId) return;
      
      // Check permission to enable audio
      if (audioEnabled && !isMuted) {
        const permission = await checkPermissions(roomCode, userId, 'audio');
        if (!permission.allowed) {
          // Notify user that they can't unmute
          socket.emit('audio:permission-denied', {
            error: permission.error,
            error_code: permission.error_code,
            roomCode
          });
          // Still broadcast but with audio disabled
          io.to(roomCode).emit('audio:participant-state', {
            userId,
            audioEnabled: false,
            isMuted: true,
            isSpeaking: false,
            timestamp: Date.now(),
            restricted: true
          });
          return;
        }
      }
      
      // Broadcast to all participants in room
      io.to(roomCode).emit('audio:participant-state', {
        userId,
        audioEnabled,
        isMuted,
        isSpeaking,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('audio:state-change error:', error);
    }
  });

  // Participant broadcasting audio activity level (0-1) for equalizer visualization
  socket.on('audio:activity-level', ({ roomCode, userId, level }) => {
    try {
      if (!roomCode || !userId || typeof level !== 'number') return;
      
      // Broadcast activity to all participants
      io.to(roomCode).emit('audio:participant-activity', {
        userId,
        level: Math.min(1, Math.max(0, level)), // Clamp 0-1
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('audio:activity-level error:', error);
    }
  });

  // Request current audio states in room (when joining)
  socket.on('audio:request-states', ({ roomCode }) => {
    try {
      if (!roomCode) return;
      // Client will fetch participant states from room state
      socket.emit('audio:request-states-ack', { roomCode, timestamp: Date.now() });
    } catch (error) {
      console.error('audio:request-states error:', error);
    }
  });
};
