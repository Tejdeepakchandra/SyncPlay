const express = require('express');
const DirectMessage = require('../models/mongodb/DirectMessage');
const User = require('../models/mongodb/User');

const router = express.Router();

function ensureAuth(req, res, next) {
  if (req.isGuest || !req.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  return next();
}

function normalizeMessage(doc, currentUserId) {
  const own = doc.senderId === currentUserId;
  return {
    id: doc._id.toString(),
    sender_id: doc.senderId,
    recipient_id: doc.recipientId,
    text: doc.text,
    read: !!doc.readAt,
    read_at: doc.readAt,
    created_at: doc.createdAt,
    own,
  };
}

router.get('/conversations', ensureAuth, async (req, res, next) => {
  try {
    const currentUserId = req.userId;

    const messages = await DirectMessage.find({
      $or: [{ senderId: currentUserId }, { recipientId: currentUserId }],
    })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const byKey = new Map();

    messages.forEach((m) => {
      if (!byKey.has(m.conversationKey)) {
        byKey.set(m.conversationKey, {
          lastMessage: m,
          unreadCount: 0,
        });
      }

      if (m.recipientId === currentUserId && !m.readAt) {
        byKey.get(m.conversationKey).unreadCount += 1;
      }
    });

    const partnerIds = [];
    byKey.forEach((value) => {
      const partnerId = value.lastMessage.senderId === currentUserId
        ? value.lastMessage.recipientId
        : value.lastMessage.senderId;
      partnerIds.push(partnerId);
      value.partnerId = partnerId;
    });

    const users = await User.find({ clerkId: { $in: [...new Set(partnerIds)] } })
      .select('clerkId username displayName avatar')
      .lean();

    const userMap = new Map(users.map((u) => [u.clerkId, u]));

    const conversations = [...byKey.values()]
      .map((entry) => {
        const partner = userMap.get(entry.partnerId);
        return {
          partner: {
            id: entry.partnerId,
            username: partner?.username || 'user',
            display_name: partner?.displayName || partner?.username || 'User',
            avatar_url: partner?.avatar || null,
          },
          unread_count: entry.unreadCount,
          last_message: normalizeMessage(entry.lastMessage, currentUserId),
        };
      })
      .sort((a, b) => new Date(b.last_message.created_at).getTime() - new Date(a.last_message.created_at).getTime());

    res.json({ success: true, data: { conversations } });
  } catch (error) {
    next(error);
  }
});

router.get('/:partnerId', ensureAuth, async (req, res, next) => {
  try {
    const currentUserId = req.userId;
    const partnerId = String(req.params.partnerId || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 60), 1), 200);
    const before = req.query.before ? new Date(req.query.before) : null;

    if (!partnerId) {
      return res.status(400).json({ success: false, message: 'partnerId is required' });
    }

    const conversationKey = DirectMessage.buildConversationKey(currentUserId, partnerId);
    const query = { conversationKey };
    if (before && !Number.isNaN(before.getTime())) {
      query.createdAt = { $lt: before };
    }

    const messages = await DirectMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: {
        messages: messages.reverse().map((m) => normalizeMessage(m, currentUserId)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:partnerId', ensureAuth, async (req, res, next) => {
  try {
    const io = req.app.get('io');
    const senderId = req.userId;
    const partnerId = String(req.params.partnerId || '').trim();
    const text = String(req.body?.text || '').trim().slice(0, 1000);

    if (!partnerId) {
      return res.status(400).json({ success: false, message: 'partnerId is required' });
    }
    if (!text) {
      return res.status(400).json({ success: false, message: 'Message text is required' });
    }
    if (partnerId === senderId) {
      return res.status(400).json({ success: false, message: 'Cannot message yourself' });
    }

    const message = await DirectMessage.create({
      senderId,
      recipientId: partnerId,
      text,
    });

    const payload = normalizeMessage(message.toObject(), senderId);

    const senderUser = await User.findOne({ clerkId: senderId }).select('username displayName avatar').lean();

    const payloadWithMeta = {
      ...payload,
      sender_name: senderUser?.displayName || senderUser?.username || 'User',
      sender_avatar_url: senderUser?.avatar || null,
    };

    if (io) {
      io.to(`user:${senderId}`).emit('dm:new', { message: payloadWithMeta });
      io.to(`user:${partnerId}`).emit('dm:new', {
        message: {
          ...payloadWithMeta,
          own: false,
        },
      });
    }

    res.status(201).json({ success: true, data: { message: payloadWithMeta } });
  } catch (error) {
    next(error);
  }
});

router.post('/:partnerId/read', ensureAuth, async (req, res, next) => {
  try {
    const currentUserId = req.userId;
    const partnerId = String(req.params.partnerId || '').trim();
    const now = new Date();

    await DirectMessage.updateMany(
      {
        senderId: partnerId,
        recipientId: currentUserId,
        readAt: null,
      },
      {
        $set: { readAt: now },
      }
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
