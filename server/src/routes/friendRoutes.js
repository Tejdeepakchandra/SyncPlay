const express = require('express');
const friendService = require('../services/friendService');
const User = require('../models/mongodb/User');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');

const router = express.Router();

const emitFriendsChanged = (req, userIds, payload = {}) => {
  const io = req.app.get('io');
  if (!io) return;

  [...new Set((userIds || []).filter(Boolean))].forEach((userId) => {
    io.to(`user:${userId}`).emit('friends:changed', {
      userId,
      at: new Date().toISOString(),
      ...payload,
    });
  });
};

const emitStoriesGraphChanged = (req, userIds, payload = {}) => {
  const io = req.app.get('io');
  if (!io) return;

  [...new Set((userIds || []).filter(Boolean))].forEach((userId) => {
    io.to(`user:${userId}`).emit('stories:updated', {
      reason: 'friend_graph_changed',
      userId,
      at: new Date().toISOString(),
      ...payload,
    });
  });
};

const ensureAuthenticated = (req, res, next) => {
  if (req.isGuest) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  return next();
};

router.get('/', ensureAuthenticated, async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const discoverLimit = Number(req.query.limit || 20);
    const data = await friendService.getOverview(req.userId, { search, discoverLimit });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/summary', ensureAuthenticated, async (req, res, next) => {
  try {
    const data = await friendService.getSummary(req.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests', ensureAuthenticated, async (req, res, next) => {
  try {
    const targetUserId = String(req.body?.targetUserId || '').trim();
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'targetUserId is required' });
    }

    const friendship = await friendService.sendRequest(req.userId, targetUserId);

    emitFriendsChanged(req, [req.userId, targetUserId], {
      type: 'friend_request_sent',
      friendshipId: friendship._id.toString(),
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      status: friendship.status,
    });

    // Send in-app notification + email to the target user if offline
    if (friendship.status === 'pending') {
      const [requesterDoc, addresseeDoc] = await Promise.all([
        User.findOne({ clerkId: req.userId }).select('displayName username').lean(),
        User.findOne({ clerkId: targetUserId }).select('displayName username email isOnline').lean(),
      ]);

      const requesterName = requesterDoc?.displayName || requesterDoc?.username || 'Someone';

      // In-app notification
      const io = req.app.get('io');
      notificationService.createNotification({
        io,
        userId: targetUserId,
        actorId: req.userId,
        type: 'friend_request',
        title: `${requesterName} sent you a friend request`,
        body: 'Accept to start watching together!',
        metadata: { path: '/friends' },
      }).catch(() => {});

      // Email for offline users
      if (addresseeDoc && !addresseeDoc.isOnline && addresseeDoc.email && !addresseeDoc.email.endsWith('@syncplay.local')) {
        emailService.sendFriendRequestEmail({
          to: addresseeDoc.email,
          fromName: requesterName,
          toName: addresseeDoc.displayName || addresseeDoc.username || 'there',
        }).catch((err) => {
          console.error('[FRIEND-EMAIL] Error:', err.message);
        });
      }
    }

    res.status(201).json({ success: true, data: { friendshipId: friendship._id.toString(), status: friendship.status } });
  } catch (error) {
    if (/already|Cannot send|not found/i.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
});

router.delete('/requests/:targetUserId', ensureAuthenticated, async (req, res, next) => {
  try {
    const targetUserId = String(req.params.targetUserId || '').trim();
    await friendService.cancelSentRequest(req.userId, targetUserId);

    emitFriendsChanged(req, [req.userId, targetUserId], {
      type: 'friend_request_cancelled',
      requesterId: req.userId,
      addresseeId: targetUserId,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/requests/:friendshipId/accept', ensureAuthenticated, async (req, res, next) => {
  try {
    const friendship = await friendService.acceptRequest(req.userId, req.params.friendshipId);
    const requester = await User.findOne({ clerkId: friendship.requesterId }).select('displayName username').lean();

    emitFriendsChanged(req, [friendship.requesterId, friendship.addresseeId], {
      type: 'friend_request_accepted',
      friendshipId: friendship._id.toString(),
      requesterId: friendship.requesterId,
      addresseeId: friendship.addresseeId,
      status: friendship.status,
    });

    emitStoriesGraphChanged(req, [friendship.requesterId, friendship.addresseeId], {
      type: 'friend_request_accepted',
      friendshipId: friendship._id.toString(),
    });

    res.json({
      success: true,
      data: {
        friendshipId: friendship._id.toString(),
        requesterId: friendship.requesterId,
        requesterName: requester?.displayName || requester?.username || 'User',
      },
    });
  } catch (error) {
    if (/not found/i.test(error.message)) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
});

router.delete('/requests/:friendshipId/decline', ensureAuthenticated, async (req, res, next) => {
  try {
    const affected = await friendService.declineRequest(req.userId, req.params.friendshipId);

    emitFriendsChanged(req, [affected?.requesterId, affected?.addresseeId], {
      type: 'friend_request_declined',
      friendshipId: req.params.friendshipId,
      requesterId: affected?.requesterId || null,
      addresseeId: affected?.addresseeId || req.userId,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.delete('/:friendshipId', ensureAuthenticated, async (req, res, next) => {
  try {
    const affected = await friendService.removeFriend(req.userId, req.params.friendshipId);

    emitFriendsChanged(req, affected, {
      type: 'friend_removed',
      friendshipId: req.params.friendshipId,
    });

    emitStoriesGraphChanged(req, affected, {
      type: 'friend_removed',
      friendshipId: req.params.friendshipId,
    });

    res.json({ success: true });
  } catch (error) {
    if (/not found/i.test(error.message)) {
      return res.status(404).json({ success: false, message: error.message });
    }
    next(error);
  }
});

module.exports = router;
