/**
 * WebRTC Signaling Handlers
 * Manages peer-to-peer connection setup via Socket.IO
 */

module.exports = (socket, io) => {
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
  socket.on('webrtc:offer', ({ roomCode, to, sdp, from }) => {
    try {
      if (!roomCode || !to) return;
      // Send to specific peer
      io.to(to).emit('webrtc:offer', {
        from,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:offer error:', error);
    }
  });

  // Send answer to peer
  socket.on('webrtc:answer', ({ roomCode, to, sdp, from }) => {
    try {
      if (!roomCode || !to) return;
      io.to(to).emit('webrtc:answer', {
        from,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc:answer error:', error);
    }
  });

  // Send ICE candidate to peer
  socket.on('webrtc:ice-candidate', ({ roomCode, to, candidate, from }) => {
    try {
      if (!roomCode || !to) return;
      io.to(to).emit('webrtc:ice-candidate', {
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
  socket.on('webrtc-mesh:join', ({ roomCode, from }) => {
    try {
      if (!roomCode) return;
      socket.to(roomCode).emit('webrtc-mesh:join', {
        from,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:join error:', error);
    }
  });

  // Send mesh offer
  socket.on('webrtc-mesh:offer', ({ roomCode, to, sdp, from }) => {
    try {
      if (!roomCode || !to) return;
      io.to(to).emit('webrtc-mesh:offer', {
        from,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:offer error:', error);
    }
  });

  // Send mesh answer
  socket.on('webrtc-mesh:answer', ({ roomCode, to, sdp, from }) => {
    try {
      if (!roomCode || !to) return;
      io.to(to).emit('webrtc-mesh:answer', {
        from,
        sdp,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:answer error:', error);
    }
  });

  // Send mesh ICE candidate
  socket.on('webrtc-mesh:ice-candidate', ({ roomCode, to, candidate, from }) => {
    try {
      if (!roomCode || !to) return;
      io.to(to).emit('webrtc-mesh:ice-candidate', {
        from,
        candidate,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('webrtc-mesh:ice-candidate error:', error);
    }
  });
};
