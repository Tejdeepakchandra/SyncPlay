const ChatMessage = require('../../models/mongodb/ChatMessage');
const Room = require('../../models/mongodb/Room');
const momentService = require('../../services/momentService');
const analyticsService = require('../../services/analyticsService');
const { socketRateLimiter } = require('../middleware/rateLimiter');

module.exports = (socket, io) => {
  /**
   * Helper function to check if user has permission
   */
  const checkChatPermission = async (roomCode, userId) => {
    try {
      const room = await Room.findOne({ roomCode });
      if (!room) return { allowed: false, error: 'Room not found' };

      const participant = room.participants.find(p => p.userId === userId);
      if (!participant) return { allowed: false, error: 'Participant not found' };

      // Host always has permissions
      if (participant.role === 'host') return { allowed: true };

      // Check if chat is disabled by host
      if (participant.restrictions?.chatDisabledByHost) {
        return { allowed: false, error: 'Chat has been disabled by host', error_code: 'CHAT_DISABLED_BY_HOST' };
      }

      return { allowed: true };
    } catch (error) {
      console.error('[CHAT-PERMISSION] Error checking permissions:', error);
      return { allowed: false, error: error.message };
    }
  };

  /**
   * Send a chat message
   * socket.emit('chat:send', { roomCode, text }, callback)
   */
  socket.on('chat:send', async ({ roomCode, text }, callback) => {
    // Rate limit: 1 message per 500ms per user
    socketRateLimiter('chat:message')(socket, async (err) => {
      if (err) return callback({ success: false, error: 'Rate limited' });

      try {
        if (!roomCode || !text || !text.trim()) {
          return callback({ success: false, error: 'Missing roomCode or text' });
        }

        // Validate user is in room
        const room = await Room.findOne({ roomCode });
        if (!room) {
          return callback({ success: false, error: 'Room not found' });
        }

        const participant = room.participants.find(
          (p) => p.userId.toString() === socket.userId.toString()
        );
        if (!participant) {
          return callback({ success: false, error: 'Not in room' });
        }

        // Check if room-level chat is enabled. Keep fallback for legacy docs.
        const isChatEnabled = room.settings?.chatEnabled ?? room.settings?.allowChat ?? true;
        if (!isChatEnabled) {
          return callback({ success: false, error: 'Chat disabled in this room' });
        }

        // Check user's individual chat permission
        const permission = await checkChatPermission(roomCode, socket.userId);
        if (!permission.allowed) {
          return callback({ 
            success: false, 
            error: permission.error,
            error_code: permission.error_code
          });
        }

        // Create message
        const message = new ChatMessage({
          roomCode,
          userId: socket.userId,
          username: socket.username || 'Anonymous',
          displayName: socket.displayName || 'Anonymous',
          avatar: participant.avatar || '😊',
          text: text.trim(),
          type: 'message',
        });

        await message.save();

        // Emit to all in room
        io.to(roomCode).emit('chat:message-new', {
          id: message._id.toString(),
          roomCode,
          userId: socket.userId,
          username: socket.username,
          displayName: socket.displayName,
          avatar: participant.avatar,
          text: message.text,
          type: 'message',
          timestamp: message.createdAt,
        });

        // ✅ Moment detection (comment surge)
        // This happens async, non-blocking
        momentService
          .processComment(roomCode, socket.userId, text)
          .catch((err) => console.error('Moment detection error:', err));

        // Analytics - async, non-blocking
        analyticsService
          .logUserAction(socket.userId, 'message')
          .catch(() => {});

        callback({
          success: true,
          messageId: message._id.toString(),
        });
      } catch (error) {
        console.error('chat:send error:', error);
        callback({
          success: false,
          error: error.message,
        });
      }
    });
  });

  /**
   * Get chat history for room
   * socket.emit('chat:get-history', { roomCode, limit }, callback)
   */
  socket.on('chat:get-history', async ({ roomCode, limit = 50 }, callback) => {
    try {
      if (!roomCode) {
        return callback({ success: false, error: 'Missing roomCode' });
      }

      // Verify user is in room
      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback({ success: false, error: 'Room not found' });
      }

      const isInRoom = room.participants.some(
        (p) => p.userId.toString() === socket.userId.toString()
      );
      if (!isInRoom) {
        return callback({ success: false, error: 'Not in room' });
      }

      // Fetch messages (most recent first, but reverse for display)
      const messages = await ChatMessage.find({ roomCode })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      callback({
        success: true,
        messages: messages.reverse().map((msg) => ({
          id: msg._id.toString(),
          userId: msg.userId.toString(),
          username: msg.username,
          displayName: msg.displayName,
          avatar: msg.avatar,
          text: msg.text,
          type: msg.type,
          timestamp: msg.createdAt,
        })),
      });
    } catch (error) {
      console.error('chat:get-history error:', error);
      callback({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * Send typing indicator
   * socket.emit('chat:typing', { roomCode, isTyping })
   */
  socket.on('chat:typing', ({ roomCode, isTyping }) => {
    try {
      if (!roomCode) return;

      io.to(roomCode).emit('chat:typing-indicator', {
        userId: socket.userId,
        displayName: socket.displayName,
        isTyping,
      });
    } catch (error) {
      console.error('chat:typing error:', error);
    }
  });
};
