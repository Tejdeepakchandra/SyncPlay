const DirectMessage = require('../../models/mongodb/DirectMessage');
const User = require('../../models/mongodb/User');

module.exports = (socket, io) => {
  socket.on('dm:send', async ({ partnerId, text }, callback) => {
    const done = typeof callback === 'function' ? callback : () => {};

    try {
      const senderId = socket.userId;
      const recipientId = String(partnerId || '').trim();
      const cleanedText = String(text || '').trim().slice(0, 1000);

      if (!recipientId) return done({ success: false, error: 'partnerId is required' });
      if (!cleanedText) return done({ success: false, error: 'text is required' });
      if (recipientId === senderId) return done({ success: false, error: 'Cannot message yourself' });

      const senderUser = await User.findOne({ clerkId: senderId }).select('username displayName avatar').lean();

      const message = await DirectMessage.create({
        senderId,
        recipientId,
        text: cleanedText,
      });

      const payload = {
        id: message._id.toString(),
        sender_id: message.senderId,
        recipient_id: message.recipientId,
        text: message.text,
        sender_name: senderUser?.displayName || senderUser?.username || 'User',
        sender_avatar_url: senderUser?.avatar || null,
        read: false,
        read_at: null,
        created_at: message.createdAt,
      };

      io.to(`user:${senderId}`).emit('dm:new', { message: { ...payload, own: true } });
      io.to(`user:${recipientId}`).emit('dm:new', { message: { ...payload, own: false } });

      done({ success: true, message: { ...payload, own: true } });
    } catch (error) {
      done({ success: false, error: error.message });
    }
  });

  socket.on('dm:mark-read', async ({ partnerId }, callback) => {
    const done = typeof callback === 'function' ? callback : () => {};

    try {
      const currentUserId = socket.userId;
      const senderId = String(partnerId || '').trim();
      if (!senderId) return done({ success: false, error: 'partnerId is required' });

      const now = new Date();
      await DirectMessage.updateMany(
        {
          senderId,
          recipientId: currentUserId,
          readAt: null,
        },
        {
          $set: { readAt: now },
        }
      );

      done({ success: true });
    } catch (error) {
      done({ success: false, error: error.message });
    }
  });
};
