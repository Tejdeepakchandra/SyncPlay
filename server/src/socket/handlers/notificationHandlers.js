const notificationService = require('../../services/notificationService');

module.exports = (socket, io) => {
  socket.on('notification:mark-read', async ({ notificationId }, callback) => {
    const done = typeof callback === 'function' ? callback : () => {};
    try {
      if (!notificationId) {
        return done({ success: false, error: 'notificationId is required' });
      }

      const notification = await notificationService.markRead({
        io,
        userId: socket.userId,
        notificationId,
      });

      if (!notification) {
        return done({ success: false, error: 'Notification not found' });
      }

      done({ success: true, notification });
    } catch (error) {
      done({ success: false, error: error.message });
    }
  });

  socket.on('notification:mark-all-read', async (_payload, callback) => {
    const done = typeof callback === 'function' ? callback : () => {};
    try {
      await notificationService.markAllRead({ io, userId: socket.userId });
      done({ success: true });
    } catch (error) {
      done({ success: false, error: error.message });
    }
  });
};
