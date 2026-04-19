const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const Story = require('../models/mongodb/Story');
const Friendship = require('../models/mongodb/Friendship');
const User = require('../models/mongodb/User');
const notificationService = require('../services/notificationService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const type = file?.mimetype || '';
    if (!type.startsWith('image/') && !type.startsWith('video/')) {
      return cb(new Error('Only image and video stories are supported'));
    }
    cb(null, true);
  },
});

const STORIES_TTL_HOURS = 24;

function ensureAuth(req, res, next) {
  if (req.isGuest || !req.userId) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  return next();
}

function normalizeStory(storyDoc, currentUserId) {
  const hasViewed = (storyDoc.views || []).some((v) => v.userId === currentUserId);
  return {
    id: storyDoc._id.toString(),
    user_id: storyDoc.userId,
    user: {
      id: storyDoc.userId,
      display_name: storyDoc.displayName || storyDoc.username || 'User',
      username: storyDoc.username || 'user',
      avatar_url: storyDoc.avatar || null,
      avatar_emoji: '🧑',
    },
    type: storyDoc.type,
    media_url: storyDoc.mediaUrl || null,
    text_content: storyDoc.textContent || null,
    caption: storyDoc.caption || null,
    background_color: storyDoc.backgroundColor || '#111827',
    duration: storyDoc.storyDuration || null,
    created_at: storyDoc.createdAt,
    expires_at: storyDoc.expiresAt,
    has_viewed: hasViewed,
    view_count: storyDoc.viewCount || 0,
    room: storyDoc.roomCode
      ? {
          room_code: storyDoc.roomCode,
          room_name: storyDoc.roomName || null,
          room_type: storyDoc.roomType || null,
          path: storyDoc.ctaPath || (storyDoc.roomType === 'music' ? `/music/room/${storyDoc.roomCode}` : `/room/${storyDoc.roomCode}`),
          label: storyDoc.ctaLabel || 'Join Room',
        }
      : null,
    reactions: (storyDoc.reactions || []).map((reaction) => ({
      id: reaction._id?.toString?.() || null,
      user_id: reaction.userId,
      username: reaction.username || null,
      display_name: reaction.displayName || null,
      reaction: reaction.reaction,
      created_at: reaction.createdAt,
    })),
    replies: (storyDoc.replies || []).map((reply) => ({
      id: reply._id?.toString?.() || null,
      user_id: reply.userId,
      username: reply.username || null,
      display_name: reply.displayName || null,
      text: reply.text,
      created_at: reply.createdAt,
    })),
  };
}

async function getAudienceUserIds(ownerUserId) {
  const links = await Friendship.find({
    status: 'accepted',
    $or: [{ requesterId: ownerUserId }, { addresseeId: ownerUserId }],
  })
    .select('requesterId addresseeId')
    .lean();

  const audience = new Set([ownerUserId]);
  links.forEach((link) => {
    audience.add(link.requesterId);
    audience.add(link.addresseeId);
  });
  return [...audience];
}

async function emitStoryEvent(req, eventName, payload, ownerUserId) {
  const io = req.app.get('io');
  if (!io) return;

  const audience = await getAudienceUserIds(ownerUserId);
  audience.forEach((uid) => {
    io.to(`user:${uid}`).emit(eventName, payload);
  });
}

async function ensureStoriesUploadDir() {
  const dir = path.resolve(__dirname, '../../../uploads/stories');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

router.get('/', ensureAuth, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
    const currentUserId = req.userId;

    const links = await Friendship.find({
      status: 'accepted',
      $or: [{ requesterId: currentUserId }, { addresseeId: currentUserId }],
    })
      .select('requesterId addresseeId')
      .lean();

    const friendIds = new Set([currentUserId]);
    links.forEach((link) => {
      friendIds.add(link.requesterId);
      friendIds.add(link.addresseeId);
    });

    const stories = await Story.find({
      userId: { $in: [...friendIds] },
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: {
        stories: stories.map((story) => normalizeStory(story, currentUserId)),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', ensureAuth, upload.single('media'), async (req, res, next) => {
  try {
    const currentUserId = req.userId;
    const user = await User.findOne({ clerkId: currentUserId }).select('clerkId username displayName avatar').lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found' });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + STORIES_TTL_HOURS * 60 * 60 * 1000);

    const caption = String(req.body?.caption || '').trim().slice(0, 220);
    const textContent = String(req.body?.textContent || '').trim().slice(0, 300);
    const backgroundColor = String(req.body?.backgroundColor || '#111827').slice(0, 32);

    let type = 'text';
    let mediaUrl = null;

    if (req.file) {
      const uploadsDir = await ensureStoriesUploadDir();
      const ext = path.extname(req.file.originalname || '') || (req.file.mimetype.startsWith('image/') ? '.jpg' : '.mp4');
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
      const filePath = path.join(uploadsDir, fileName);
      await fs.writeFile(filePath, req.file.buffer);

      mediaUrl = `/uploads/stories/${fileName}`;
      type = req.file.mimetype.startsWith('video/') ? 'video' : 'photo';
    } else if (!textContent) {
      return res.status(400).json({ success: false, message: 'Story requires media or text content' });
    }

    const durationFromBody = Number(req.body?.duration || 0);
    const storyDuration = Number.isFinite(durationFromBody) && durationFromBody > 0
      ? Math.min(durationFromBody, 30)
      : type === 'video'
        ? 15
        : 5;

    const roomCode = String(req.body?.roomCode || '').trim().toUpperCase();
    const roomName = String(req.body?.roomName || '').trim().slice(0, 100);
    const roomType = String(req.body?.roomType || '').trim().toLowerCase();
    const ctaPath = String(req.body?.ctaPath || '').trim().slice(0, 180);
    const ctaLabel = String(req.body?.ctaLabel || '').trim().slice(0, 40);

    const normalizedRoomType = roomType === 'music' || roomType === 'movie' ? roomType : null;
    const normalizedRoomCode = roomCode || null;
    const normalizedCtaPath = ctaPath || (normalizedRoomCode
      ? (normalizedRoomType === 'music' ? `/music/room/${normalizedRoomCode}` : `/room/${normalizedRoomCode}`)
      : null);

    // Keep only one active room story per user and room code.
    if (normalizedRoomCode) {
      const existingRoomStories = await Story.find({
        userId: currentUserId,
        roomCode: normalizedRoomCode,
        expiresAt: { $gt: now },
      }).lean();

      for (const existing of existingRoomStories) {
        if (existing.mediaUrl && existing.mediaUrl.startsWith('/uploads/stories/')) {
          const uploadFilePath = path.resolve(__dirname, '../../../', existing.mediaUrl.replace(/^\//, ''));
          fs.unlink(uploadFilePath).catch(() => null);
        }
      }

      if (existingRoomStories.length > 0) {
        await Story.deleteMany({
          _id: { $in: existingRoomStories.map((s) => s._id) },
        });
      }
    }

    const story = await Story.create({
      userId: currentUserId,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      roomId: null,
      roomName: normalizedRoomCode ? (roomName || null) : null,
      roomCode: normalizedRoomCode,
      roomType: normalizedRoomCode ? normalizedRoomType : null,
      ctaLabel: normalizedRoomCode ? (ctaLabel || 'Join Room') : null,
      ctaPath: normalizedRoomCode ? normalizedCtaPath : null,
      type,
      mediaUrl,
      caption,
      textContent: type === 'text' ? textContent : null,
      backgroundColor: type === 'text' ? backgroundColor : null,
      storyDuration,
      liveData: null,
      recapData: null,
      participants: [],
      views: [],
      viewCount: 0,
      reactions: [],
      expiresAt,
    });

    await User.updateOne(
      { clerkId: currentUserId },
      { $inc: { 'stats.storiesCreated': 1 } }
    );

    res.status(201).json({
      success: true,
      data: {
        story: normalizeStory(story.toObject(), currentUserId),
      },
    });

    emitStoryEvent(
      req,
      'stories:created',
      { story: normalizeStory(story.toObject(), currentUserId) },
      currentUserId
    ).catch(() => null);

    if (normalizedRoomCode) {
      const audience = await getAudienceUserIds(currentUserId);
      const recipientIds = audience.filter((id) => id !== currentUserId);
      const roomPathForNotif = normalizedCtaPath || (normalizedRoomType === 'music' ? `/music/room/${normalizedRoomCode}` : `/room/${normalizedRoomCode}`);

      notificationService.createManyNotifications({
        io: req.app.get('io'),
        userIds: recipientIds,
        actorId: currentUserId,
        type: 'room_story',
        title: `${user.displayName || user.username || 'Your friend'} posted a room story`,
        body: `Join ${roomName || 'their room'} now`,
        metadata: {
          room_code: normalizedRoomCode,
          room_name: roomName || null,
          room_type: normalizedRoomType,
          path: '/friends',
          room_path: roomPathForNotif,
        },
      }).catch(() => null);
    }
  } catch (error) {
    next(error);
  }
});

router.post('/:storyId/view', ensureAuth, async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const currentUserId = req.userId;

    const story = await Story.findOne({ _id: storyId, expiresAt: { $gt: new Date() } });
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found or expired' });
    }

    const alreadyViewed = story.views.some((entry) => entry.userId === currentUserId);
    if (!alreadyViewed) {
      story.views.push({ userId: currentUserId, viewedAt: new Date() });
      story.viewCount = (story.viewCount || 0) + 1;
      await story.save();

      emitStoryEvent(
        req,
        'stories:viewed',
        {
          storyId: story._id.toString(),
          viewerId: currentUserId,
          viewCount: story.viewCount,
        },
        story.userId
      ).catch(() => null);
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:storyId/reactions', ensureAuth, async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const currentUserId = req.userId;
    const reaction = String(req.body?.reaction || '').trim().slice(0, 8);

    if (!reaction) {
      return res.status(400).json({ success: false, message: 'reaction is required' });
    }

    const [story, user] = await Promise.all([
      Story.findOne({ _id: storyId, expiresAt: { $gt: new Date() } }),
      User.findOne({ clerkId: currentUserId }).select('username displayName').lean(),
    ]);

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found or expired' });
    }

    story.reactions.push({
      userId: currentUserId,
      username: user?.username || 'user',
      displayName: user?.displayName || 'User',
      reaction,
      createdAt: new Date(),
    });
    await story.save();

    const storyPayload = normalizeStory(story.toObject(), currentUserId);
    res.json({ success: true, data: { story: storyPayload } });

    emitStoryEvent(req, 'stories:updated', { story: storyPayload }, story.userId).catch(() => null);
  } catch (error) {
    next(error);
  }
});

router.post('/:storyId/replies', ensureAuth, async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const currentUserId = req.userId;
    const text = String(req.body?.text || '').trim().slice(0, 250);

    if (!text) {
      return res.status(400).json({ success: false, message: 'text is required' });
    }

    const [story, user] = await Promise.all([
      Story.findOne({ _id: storyId, expiresAt: { $gt: new Date() } }),
      User.findOne({ clerkId: currentUserId }).select('username displayName').lean(),
    ]);

    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found or expired' });
    }

    story.replies.push({
      userId: currentUserId,
      username: user?.username || 'user',
      displayName: user?.displayName || 'User',
      text,
      createdAt: new Date(),
    });
    await story.save();

    const storyPayload = normalizeStory(story.toObject(), currentUserId);
    res.json({ success: true, data: { story: storyPayload } });

    emitStoryEvent(req, 'stories:updated', { story: storyPayload }, story.userId).catch(() => null);
  } catch (error) {
    next(error);
  }
});

router.delete('/:storyId', ensureAuth, async (req, res, next) => {
  try {
    const { storyId } = req.params;
    const currentUserId = req.userId;

    const story = await Story.findOne({ _id: storyId, userId: currentUserId });
    if (!story) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    if (story.mediaUrl && story.mediaUrl.startsWith('/uploads/stories/')) {
      const uploadFilePath = path.resolve(__dirname, '../../../', story.mediaUrl.replace(/^\//, ''));
      fs.unlink(uploadFilePath).catch(() => null);
    }

    await Story.deleteOne({ _id: storyId });
    res.json({ success: true });

    emitStoryEvent(req, 'stories:deleted', { storyId }, currentUserId).catch(() => null);
  } catch (error) {
    next(error);
  }
});

module.exports = router;