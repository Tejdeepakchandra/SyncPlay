const express = require('express');
const Notification = require('../models/mongodb/Notification');
const notificationService = require('../services/notificationService');

const router = express.Router();

function ensureAuth(req, res, next) {
  if (req.isGuest || !req.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  return next();
}

router.get('/', ensureAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 100);
    const notifications = await Notification.find({ userId: req.userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const items = notifications.map(notificationService.normalizeNotification);
    const unreadCount = items.reduce((sum, n) => sum + (n.read ? 0 : 1), 0);

    res.json({
      success: true,
      data: {
        notifications: items,
        unreadCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/:notificationId/read', ensureAuth, async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const notification = await notificationService.markRead({
      io,
      userId: req.userId,
      notificationId: req.params.notificationId,
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.json({ success: true, data: { notification } });
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', ensureAuth, async (req, res, next) => {
  try {
    const io = req.app.get('io');
    await notificationService.markAllRead({ io, userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Delete a single notification
router.delete('/:notificationId', ensureAuth, async (req, res, next) => {
  try {
    const result = await Notification.findOneAndDelete({
      _id: req.params.notificationId,
      userId: req.userId,
    });
    if (!result) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Clear all notifications
router.delete('/', ensureAuth, async (req, res, next) => {
  try {
    await Notification.deleteMany({ userId: req.userId });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
