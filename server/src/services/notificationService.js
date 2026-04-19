const Notification = require('../models/mongodb/Notification');

function normalizeNotification(doc) {
  return {
    id: doc._id.toString(),
    user_id: doc.userId,
    actor_id: doc.actorId || null,
    type: doc.type,
    title: doc.title,
    body: doc.body,
    metadata: doc.metadata || {},
    read: !!doc.readAt,
    read_at: doc.readAt,
    created_at: doc.createdAt,
  };
}

async function createNotification({ io, userId, actorId = null, type = 'system', title, body, metadata = {} }) {
  const notification = await Notification.create({
    userId,
    actorId,
    type,
    title,
    body,
    metadata,
  });

  const payload = normalizeNotification(notification.toObject());
  if (io) {
    io.to(`user:${userId}`).emit('notification:new', { notification: payload });
  }

  return payload;
}

async function createManyNotifications({ io, userIds, actorId = null, type = 'system', title, body, metadata = {} }) {
  const uniqueUserIds = [...new Set((userIds || []).filter(Boolean))];
  if (uniqueUserIds.length === 0) return [];

  const docs = uniqueUserIds.map((uid) => ({
    userId: uid,
    actorId,
    type,
    title,
    body,
    metadata,
  }));

  const created = await Notification.insertMany(docs, { ordered: false });
  const normalized = created.map((doc) => normalizeNotification(doc.toObject()));

  if (io) {
    normalized.forEach((notif) => {
      io.to(`user:${notif.user_id}`).emit('notification:new', { notification: notif });
    });
  }

  return normalized;
}

async function markRead({ io, userId, notificationId }) {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { $set: { readAt: new Date() } },
    { new: true }
  ).lean();

  if (!notification) return null;

  const payload = normalizeNotification(notification);
  if (io) {
    io.to(`user:${userId}`).emit('notification:updated', { notification: payload });
  }

  return payload;
}

async function markAllRead({ io, userId }) {
  const now = new Date();
  await Notification.updateMany(
    { userId, readAt: null },
    { $set: { readAt: now } }
  );

  if (io) {
    io.to(`user:${userId}`).emit('notification:all-read', { at: now.toISOString() });
  }
}

module.exports = {
  normalizeNotification,
  createNotification,
  createManyNotifications,
  markRead,
  markAllRead,
};
