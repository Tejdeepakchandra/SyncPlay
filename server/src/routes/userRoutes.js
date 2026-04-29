const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/mongodb/User');
const Room = require('../models/mongodb/Room');
const Friendship = require('../models/mongodb/Friendship');
const DirectMessage = require('../models/mongodb/DirectMessage');
const Notification = require('../models/mongodb/Notification');
const Moment = require('../models/mongodb/Moment');
const pgPool = require('../config/postgres');

const router = express.Router();

const toUtcDateOnly = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const computeStreakDays = (dateRows = []) => {
  if (!Array.isArray(dateRows) || dateRows.length === 0) return 0;

  const normalized = dateRows
    .map((row) => toUtcDateOnly(row?.date))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  if (normalized.length === 0) return 0;

  let streak = 1;
  let cursor = normalized[0];

  for (let i = 1; i < normalized.length; i += 1) {
    const nextExpected = new Date(cursor);
    nextExpected.setUTCDate(nextExpected.getUTCDate() - 1);
    if (normalized[i].getTime() !== nextExpected.getTime()) break;
    streak += 1;
    cursor = normalized[i];
  }

  return streak;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

const asIso = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toISOString();
};

const roomWatchMinutes = (room) => {
  const start = room?.startedAt ? new Date(room.startedAt).getTime() : Number.NaN;
  const end = room?.endedAt ? new Date(room.endedAt).getTime() : Number.NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
};

const validFavoriteBucket = (bucket) => ['rooms', 'moments', 'activities'].includes(bucket);

const sanitizeFavoriteItem = (bucket, item = {}) => {
  if (bucket === 'rooms') {
    const roomCode = String(item.roomCode || '').trim().toUpperCase();
    if (!roomCode) return null;
    return {
      roomCode,
      name: String(item.name || '').trim().slice(0, 120) || 'Room',
      type: ['movie', 'music', 'custom'].includes(item.type) ? item.type : 'custom',
      addedAt: new Date(),
    };
  }

  if (bucket === 'moments') {
    const momentId = String(item.momentId || '').trim();
    if (!momentId) return null;
    return {
      momentId,
      title: String(item.title || 'Moment').trim().slice(0, 120),
      roomCode: String(item.roomCode || '').trim().toUpperCase(),
      addedAt: new Date(),
    };
  }

  if (bucket === 'activities') {
    const activityId = String(item.activityId || '').trim();
    if (!activityId) return null;
    return {
      activityId,
      label: String(item.label || 'Activity').trim().slice(0, 160),
      type: String(item.type || 'activity').trim().slice(0, 40),
      addedAt: new Date(),
    };
  }

  return null;
};

/**
 * GET /api/users/me
 * Get current authenticated user
 */
router.get('/me', async (req, res) => {
  try {
    if (req.isGuest) {
      return res.json({
        success: true,
        data: {
          isGuest: true,
          userId: req.userId
        }
      });
    }

    const user = await User.findOne({ clerkId: req.userId })
      .select('clerkId username displayName email avatar avatar_emoji bio preferences stats isOnline lastActive currentRoom')
      .lean();

    if (user) {
      const [roomsCreatedMongo, hostedWatchAgg, pgTotals, pgWatchDays] = await Promise.all([
        Room.countDocuments({ hostId: req.userId }),
        Room.aggregate([
          {
            $match: {
              hostId: req.userId,
              startedAt: { $ne: null },
              endedAt: { $ne: null },
            },
          },
          {
            $project: {
              watchMinutes: {
                $max: [
                  0,
                  {
                    $divide: [
                      { $subtract: ['$endedAt', '$startedAt'] },
                      60000,
                    ],
                  },
                ],
              },
            },
          },
          {
            $group: {
              _id: null,
              totalWatchMinutes: { $sum: '$watchMinutes' },
            },
          },
        ]),
        pgPool.query(
          `SELECT
             COALESCE(SUM(rooms_created), 0) AS rooms_created,
             COALESCE(SUM(rooms_joined), 0) AS rooms_joined,
             COALESCE(SUM(watch_time_minutes), 0) AS watch_time_minutes
           FROM user_engagement
           WHERE user_id = $1`,
          [req.userId]
        ).catch(() => ({ rows: [{ rooms_created: 0, rooms_joined: 0, watch_time_minutes: 0 }] })),
        pgPool.query(
          `SELECT date
           FROM user_engagement
           WHERE user_id = $1
             AND (COALESCE(watch_time_minutes, 0) > 0 OR COALESCE(rooms_joined, 0) > 0)
           ORDER BY date DESC
           LIMIT 120`,
          [req.userId]
        ).catch(() => ({ rows: [] })),
      ]);

      const pgRow = pgTotals?.rows?.[0] || {};
      const hostedWatchMinutesMongo = Math.round(toNumber(hostedWatchAgg?.[0]?.totalWatchMinutes));
      const watchedStreakDays = computeStreakDays(pgWatchDays?.rows || []);

      const resolvedStats = {
        ...(user.stats || {}),
        roomsCreated: Math.max(
          toNumber(user?.stats?.roomsCreated),
          toNumber(pgRow.rooms_created),
          toNumber(roomsCreatedMongo)
        ),
        roomsJoined: Math.max(
          toNumber(user?.stats?.roomsJoined),
          toNumber(pgRow.rooms_joined)
        ),
        watchTimeMinutes: Math.max(
          toNumber(user?.stats?.watchTimeMinutes),
          toNumber(pgRow.watch_time_minutes),
          hostedWatchMinutesMongo
        ),
        watchedStreakDays: Math.max(
          toNumber(user?.stats?.watchedStreakDays),
          watchedStreakDays
        ),
      };

      User.updateOne(
        { clerkId: req.userId },
        {
          $set: {
            'stats.roomsCreated': resolvedStats.roomsCreated,
            'stats.roomsJoined': resolvedStats.roomsJoined,
            'stats.watchTimeMinutes': resolvedStats.watchTimeMinutes,
            'stats.watchedStreakDays': resolvedStats.watchedStreakDays,
          },
        }
      ).catch(() => {});

      return res.json({
        success: true,
        data: {
          id: user.clerkId,
          userId: user.clerkId,
          clerkId: user.clerkId,
          username: user.username,
          displayName: user.displayName,
          email: user.email,
          avatar: user.avatar,
          avatar_emoji: user.avatar_emoji || '🧑',
          bio: user.bio || '',
          preferences: user.preferences || {},
          stats: resolvedStats,
          isOnline: !!user.isOnline,
          lastActive: user.lastActive || null,
          currentRoom: user.currentRoom || null,
          isAuthenticated: true,
          isPending: false,
        }
      });
    }

    return res.json({
      success: true,
      data: {
        id: req.userId,
        userId: req.userId,
        clerkId: req.clerkId,
        isAuthenticated: true,
        isPending: req.userPending || false
      }
    });
  } catch (error) {
    return res.json({
      success: true,
      data: {
        id: req.userId,
        userId: req.userId,
        clerkId: req.clerkId,
        isAuthenticated: true,
        isPending: true
      }
    });
  }
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({
        success: false,
        message: 'Guest users cannot update profile'
      });
    }

    const { displayName, display_name, bio, preferences, avatar_emoji } = req.body;
    
    const updateData = {};
    if (displayName || display_name) updateData.displayName = String(displayName || display_name).trim();
    if (bio !== undefined) updateData.bio = bio;
    if (avatar_emoji !== undefined) updateData.avatar_emoji = avatar_emoji;

    if (preferences && typeof preferences === 'object') {
      const existing = await User.findOne({ clerkId: req.userId }).select('preferences').lean();
      updateData.preferences = {
        ...(existing?.preferences || {}),
        ...preferences,
        notifications: {
          ...(existing?.preferences?.notifications || {}),
          ...(preferences.notifications || {}),
        },
        privacy: {
          ...(existing?.preferences?.privacy || {}),
          ...(preferences.privacy || {}),
        },
        discovery: {
          ...(existing?.preferences?.discovery || {}),
          ...(preferences.discovery || {}),
        },
      };
    }

    const user = await User.findOneAndUpdate(
      { clerkId: req.userId },
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('clerkId username displayName email avatar avatar_emoji bio preferences stats isOnline lastActive currentRoom');

    res.json({
      success: true,
      data: {
        id: user?.clerkId,
        userId: user?.clerkId,
        clerkId: user?.clerkId,
        username: user?.username,
        displayName: user?.displayName,
        email: user?.email,
        avatar: user?.avatar,
        avatar_emoji: user?.avatar_emoji || '🧑',
        bio: user?.bio || '',
        preferences: user?.preferences || {},
        stats: user?.stats || {},
        isOnline: !!user?.isOnline,
        lastActive: user?.lastActive || null,
        currentRoom: user?.currentRoom || null,
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/me/stats
 * Dedicated profile stats payload for charts and leaderboard widgets
 */
router.get('/me/stats', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({
        success: false,
        message: 'Guest users do not have persisted stats'
      });
    }

    const user = await User.findOne({ clerkId: req.userId })
      .select('clerkId username displayName avatar_emoji stats')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User profile not found'
      });
    }

    const [roomsCreatedMongo, hostedWatchAgg, pgTotals, pgWatchDays, pgTimeseries, rankRows, topWatchRows, topCreateRows] = await Promise.all([
      Room.countDocuments({ hostId: req.userId }),
      Room.aggregate([
        {
          $match: {
            hostId: req.userId,
            startedAt: { $ne: null },
            endedAt: { $ne: null },
          },
        },
        {
          $project: {
            watchMinutes: {
              $max: [
                0,
                {
                  $divide: [
                    { $subtract: ['$endedAt', '$startedAt'] },
                    60000,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalWatchMinutes: { $sum: '$watchMinutes' },
          },
        },
      ]),
      pgPool.query(
        `SELECT
           COALESCE(SUM(rooms_created), 0) AS rooms_created,
           COALESCE(SUM(rooms_joined), 0) AS rooms_joined,
           COALESCE(SUM(watch_time_minutes), 0) AS watch_time_minutes,
           COALESCE(SUM(messages_sent), 0) AS messages_sent,
           COALESCE(SUM(reactions_sent), 0) AS reactions_sent
         FROM user_engagement
         WHERE user_id = $1`,
        [req.userId]
      ).catch(() => ({ rows: [{ rooms_created: 0, rooms_joined: 0, watch_time_minutes: 0, messages_sent: 0, reactions_sent: 0 }] })),
      pgPool.query(
        `SELECT date
         FROM user_engagement
         WHERE user_id = $1
           AND (COALESCE(watch_time_minutes, 0) > 0 OR COALESCE(rooms_joined, 0) > 0)
         ORDER BY date DESC
         LIMIT 120`,
        [req.userId]
      ).catch(() => ({ rows: [] })),
      pgPool.query(
        `SELECT
           date,
           COALESCE(rooms_joined, 0) AS rooms_joined,
           COALESCE(rooms_created, 0) AS rooms_created,
           COALESCE(watch_time_minutes, 0) AS watch_time_minutes,
           COALESCE(messages_sent, 0) AS messages_sent,
           COALESCE(reactions_sent, 0) AS reactions_sent
         FROM user_engagement
         WHERE user_id = $1
           AND date >= (CURRENT_DATE - INTERVAL '29 days')
         ORDER BY date ASC`,
        [req.userId]
      ).catch(() => ({ rows: [] })),
      pgPool.query(
        `WITH totals AS (
           SELECT
             user_id,
             COALESCE(SUM(watch_time_minutes), 0) AS watch_time,
             COALESCE(SUM(rooms_created), 0) AS rooms_created
           FROM user_engagement
           GROUP BY user_id
         ), ranked AS (
           SELECT
             user_id,
             DENSE_RANK() OVER (ORDER BY watch_time DESC, user_id ASC) AS watch_time_rank,
             DENSE_RANK() OVER (ORDER BY rooms_created DESC, user_id ASC) AS rooms_created_rank
           FROM totals
         )
         SELECT user_id, watch_time_rank, rooms_created_rank
         FROM ranked
         WHERE user_id = $1`,
        [req.userId]
      ).catch(() => ({ rows: [] })),
      pgPool.query(
        `WITH totals AS (
           SELECT
             user_id,
             COALESCE(SUM(watch_time_minutes), 0) AS watch_time,
             COALESCE(SUM(rooms_created), 0) AS rooms_created
           FROM user_engagement
           GROUP BY user_id
         )
         SELECT user_id, watch_time, rooms_created
         FROM totals
         ORDER BY watch_time DESC, user_id ASC
         LIMIT 10`
      ).catch(() => ({ rows: [] })),
      pgPool.query(
        `WITH totals AS (
           SELECT
             user_id,
             COALESCE(SUM(watch_time_minutes), 0) AS watch_time,
             COALESCE(SUM(rooms_created), 0) AS rooms_created
           FROM user_engagement
           GROUP BY user_id
         )
         SELECT user_id, watch_time, rooms_created
         FROM totals
         ORDER BY rooms_created DESC, user_id ASC
         LIMIT 10`
      ).catch(() => ({ rows: [] })),
    ]);

    const pgRow = pgTotals?.rows?.[0] || {};
    const hostedWatchMinutesMongo = Math.round(toNumber(hostedWatchAgg?.[0]?.totalWatchMinutes));
    const watchedStreakDays = computeStreakDays(pgWatchDays?.rows || []);

    const resolvedStats = {
      ...(user.stats || {}),
      roomsCreated: Math.max(
        toNumber(user?.stats?.roomsCreated),
        toNumber(pgRow.rooms_created),
        toNumber(roomsCreatedMongo)
      ),
      roomsJoined: Math.max(
        toNumber(user?.stats?.roomsJoined),
        toNumber(pgRow.rooms_joined)
      ),
      watchTimeMinutes: Math.max(
        toNumber(user?.stats?.watchTimeMinutes),
        toNumber(pgRow.watch_time_minutes),
        hostedWatchMinutesMongo
      ),
      watchedStreakDays: Math.max(
        toNumber(user?.stats?.watchedStreakDays),
        watchedStreakDays
      ),
      messagesSent: toNumber(pgRow.messages_sent),
      reactionsSent: toNumber(pgRow.reactions_sent),
    };

    const leaderboardUserIds = [
      ...new Set([
        req.userId,
        ...(topWatchRows?.rows || []).map((row) => row.user_id).filter(Boolean),
        ...(topCreateRows?.rows || []).map((row) => row.user_id).filter(Boolean),
      ]),
    ];

    const leaderboardUsers = await User.find({ clerkId: { $in: leaderboardUserIds } })
      .select('clerkId displayName username avatar_emoji')
      .lean();

    const profileByUserId = new Map(
      (leaderboardUsers || []).map((u) => [
        u.clerkId,
        {
          displayName: u.displayName || u.username || 'User',
          username: u.username || null,
          avatar_emoji: u.avatar_emoji || '🧑',
        },
      ])
    );

    const mapLeaderboardRow = (row) => {
      const profile = profileByUserId.get(row.user_id) || {};
      return {
        userId: row.user_id,
        displayName: profile.displayName || 'User',
        username: profile.username || null,
        avatar_emoji: profile.avatar_emoji || '🧑',
        watchTimeMinutes: toNumber(row.watch_time),
        roomsCreated: toNumber(row.rooms_created),
      };
    };

    User.updateOne(
      { clerkId: req.userId },
      {
        $set: {
          'stats.roomsCreated': resolvedStats.roomsCreated,
          'stats.roomsJoined': resolvedStats.roomsJoined,
          'stats.watchTimeMinutes': resolvedStats.watchTimeMinutes,
          'stats.watchedStreakDays': resolvedStats.watchedStreakDays,
        },
      }
    ).catch(() => {});

    return res.json({
      success: true,
      data: {
        summary: resolvedStats,
        chart: {
          dailyEngagement: (pgTimeseries?.rows || []).map((row) => ({
            date: row.date,
            roomsJoined: toNumber(row.rooms_joined),
            roomsCreated: toNumber(row.rooms_created),
            watchTimeMinutes: toNumber(row.watch_time_minutes),
            messagesSent: toNumber(row.messages_sent),
            reactionsSent: toNumber(row.reactions_sent),
          })),
        },
        leaderboard: {
          byWatchTime: (topWatchRows?.rows || []).map(mapLeaderboardRow),
          byRoomsCreated: (topCreateRows?.rows || []).map(mapLeaderboardRow),
          myRank: {
            watchTime: toNumber(rankRows?.rows?.[0]?.watch_time_rank) || null,
            roomsCreated: toNumber(rankRows?.rows?.[0]?.rooms_created_rank) || null,
          },
        },
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/me/activity
 * Rich profile activity timeline with room/social/messaging events.
 */
router.get('/me/activity', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userId = req.userId;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 60);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const categoryFilter = String(req.query.category || 'all').trim().toLowerCase();
    const validCategories = ['all', 'movie', 'music', 'social', 'system'];
    const selectedCategory = validCategories.includes(categoryFilter) ? categoryFilter : 'all';

    const [
      hostedRooms,
      participantRooms,
      friendships,
      dmMessages,
      notifications,
      bookmarkedMoments,
    ] = await Promise.all([
      Room.find({ hostId: userId })
        .select('roomCode name type status participantCount startedAt endedAt createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
      Room.find({ 'participants.userId': userId })
        .select('roomCode name type status participantCount participants startedAt endedAt createdAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(120)
        .lean(),
      Friendship.find({
        $or: [{ requesterId: userId }, { addresseeId: userId }],
      })
        .select('requesterId addresseeId status createdAt acceptedAt updatedAt')
        .sort({ updatedAt: -1 })
        .limit(120)
        .lean(),
      DirectMessage.find({
        $or: [{ senderId: userId }, { recipientId: userId }],
      })
        .select('senderId recipientId createdAt text')
        .sort({ createdAt: -1 })
        .limit(120)
        .lean(),
      Notification.find({ userId })
        .select('type title createdAt readAt')
        .sort({ createdAt: -1 })
        .limit(120)
        .lean(),
      Moment.find({
        type: 'bookmark',
        'participants.userId': userId,
      })
        .select('roomCode timestamp type createdAt')
        .sort({ createdAt: -1 })
        .limit(80)
        .lean(),
    ]);

    const timeline = [];

    hostedRooms.forEach((room) => {
      timeline.push({
        id: `room-created-${room.roomCode}-${room.createdAt}`,
        category: room.type === 'music' ? 'music' : 'movie',
        type: 'room_created',
        title: `Created ${room.type} room`,
        description: `${room.name} (${room.roomCode})`,
        at: asIso(room.createdAt),
        room: {
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          participantCount: Number(room.participantCount || 0),
          watchMinutes: roomWatchMinutes(room),
        },
      });
    });

    participantRooms.forEach((room) => {
      const participant = (room.participants || []).find((p) => String(p.userId) === String(userId));
      if (!participant) return;

      timeline.push({
        id: `room-joined-${room.roomCode}-${participant.joinedAt || room.updatedAt}`,
        category: room.type === 'music' ? 'music' : 'movie',
        type: 'room_joined',
        title: `Joined ${room.type} room`,
        description: `${room.name} (${room.roomCode})`,
        at: asIso(participant.joinedAt || room.updatedAt || room.createdAt),
        room: {
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          participantCount: Number(room.participantCount || 0),
          watchMinutes: roomWatchMinutes(room),
        },
      });
    });

    friendships.forEach((friendship) => {
      if (friendship.status === 'accepted') {
        timeline.push({
          id: `friend-accepted-${friendship.requesterId}-${friendship.addresseeId}-${friendship.acceptedAt || friendship.updatedAt}`,
          category: 'social',
          type: 'friend_request_accepted',
          title: 'Friend request accepted',
          description: `Connection with ${friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId}`,
          at: asIso(friendship.acceptedAt || friendship.updatedAt),
        });
      } else if (friendship.status === 'pending') {
        timeline.push({
          id: `friend-pending-${friendship.requesterId}-${friendship.addresseeId}-${friendship.createdAt}`,
          category: 'social',
          type: friendship.addresseeId === userId ? 'friend_request_received' : 'friend_request_sent',
          title: friendship.addresseeId === userId ? 'Friend request received' : 'Friend request sent',
          description: `From/to ${friendship.requesterId === userId ? friendship.addresseeId : friendship.requesterId}`,
          at: asIso(friendship.createdAt),
        });
      }
    });

    dmMessages.forEach((message) => {
      const sent = message.senderId === userId;
      timeline.push({
        id: `dm-${sent ? 'sent' : 'received'}-${message._id || message.createdAt}`,
        category: 'social',
        type: sent ? 'dm_sent' : 'dm_received',
        title: sent ? 'Message sent' : 'Message received',
        description: String(message.text || '').slice(0, 90),
        at: asIso(message.createdAt),
      });
    });

    notifications.forEach((notification) => {
      timeline.push({
        id: `notification-${notification._id || notification.createdAt}`,
        category: 'system',
        type: 'notification',
        title: notification.title || 'Notification',
        description: notification.type || 'system',
        at: asIso(notification.createdAt),
        metadata: {
          type: notification.type,
          read: !!notification.readAt,
        },
      });
    });

    bookmarkedMoments.forEach((moment) => {
      timeline.push({
        id: `moment-bookmark-${moment._id || moment.createdAt}`,
        category: 'movie',
        type: 'moment_bookmarked',
        title: 'Bookmarked a moment',
        description: `${moment.roomCode} at ${Math.round(Number(moment.timestamp || 0))}s`,
        at: asIso(moment.createdAt),
      });
    });

    timeline.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());
    const cappedTimeline = timeline.slice(0, 500);

    const filteredTimeline = selectedCategory === 'all'
      ? cappedTimeline
      : cappedTimeline.filter((item) => item.category === selectedCategory);

    const totalItems = filteredTimeline.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / limit));
    const safePage = Math.min(page, totalPages);
    const startIndex = (safePage - 1) * limit;
    const pagedTimeline = filteredTimeline.slice(startIndex, startIndex + limit);

    const summary = {
      total: cappedTimeline.length,
      movie: cappedTimeline.filter((item) => item.category === 'movie').length,
      music: cappedTimeline.filter((item) => item.category === 'music').length,
      social: cappedTimeline.filter((item) => item.category === 'social').length,
      system: cappedTimeline.filter((item) => item.category === 'system').length,
    };

    res.json({
      success: true,
      data: {
        summary,
        timeline: pagedTimeline,
        pagination: {
          page: safePage,
          limit,
          totalItems,
          totalPages,
          hasNextPage: safePage < totalPages,
          hasPreviousPage: safePage > 1,
          category: selectedCategory,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/me/activity/room/:roomCode
 * Detailed room context for activity actions.
 */
router.get('/me/activity/room/:roomCode', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const roomCode = String(req.params.roomCode || '').trim().toUpperCase();
    if (!roomCode) {
      return res.status(400).json({ success: false, message: 'roomCode is required' });
    }

    const room = await Room.findOne({ roomCode })
      .select('roomCode name type description hostId status participantCount participants participantHistory startedAt endedAt createdAt stats settings')
      .lean();

    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    const userId = req.userId;
    const isHost = String(room.hostId || '') === String(userId || '');
    const isParticipant = (room.participants || []).some((p) => String(p.userId || '') === String(userId || ''));
    if (!isHost && !isParticipant) {
      return res.status(403).json({ success: false, message: 'You do not have access to this room details' });
    }

    const nowMs = Date.now();
    const startedMs = room?.startedAt ? new Date(room.startedAt).getTime() : Number.NaN;
    const endedMs = room?.endedAt ? new Date(room.endedAt).getTime() : Number.NaN;
    const roomEndMs = Number.isFinite(endedMs) ? endedMs : nowMs;

    const effectiveStartMs = Number.isFinite(startedMs)
      ? startedMs
      : (room?.createdAt ? new Date(room.createdAt).getTime() : Number.NaN);

    const totalRoomMinutes = Number.isFinite(effectiveStartMs)
      ? Math.max(0, Math.round((roomEndMs - effectiveStartMs) / 60000))
      : 0;

    const activeParticipants = (room.participants || []).map((participant) => {
      const joinedMs = participant?.joinedAt
        ? new Date(participant.joinedAt).getTime()
        : Number.isFinite(effectiveStartMs)
          ? effectiveStartMs
          : nowMs;

      const leftMs = Number.isFinite(endedMs) ? endedMs : nowMs;
      const timeSpentMinutes = Number.isFinite(joinedMs)
        ? Math.max(0, Math.round((leftMs - joinedMs) / 60000))
        : 0;

      return {
        userId: participant.userId,
        username: participant.username || '',
        displayName: participant.displayName || participant.username || 'Participant',
        avatar: participant.avatar || '',
        avatarEmoji: participant.avatar_emoji || '🧑',
        role: participant.role || 'participant',
        joinedAt: asIso(participant.joinedAt),
        lastActive: asIso(participant.lastActive),
        timeSpentMinutes,
      };
    });

    const historicalParticipants = (room.participantHistory || []).map((participant) => {
      const joinedMs = participant?.joinedAt ? new Date(participant.joinedAt).getTime() : Number.NaN;
      const leftMs = participant?.leftAt
        ? new Date(participant.leftAt).getTime()
        : (Number.isFinite(endedMs) ? endedMs : nowMs);

      const computedMinutes = Number.isFinite(joinedMs)
        ? Math.max(0, Math.round((leftMs - joinedMs) / 60000))
        : 0;

      return {
        userId: participant.userId,
        username: participant.username || '',
        displayName: participant.displayName || participant.username || 'Participant',
        avatar: participant.avatar || '',
        avatarEmoji: participant.avatar_emoji || '🧑',
        role: participant.role || 'participant',
        joinedAt: asIso(participant.joinedAt),
        lastActive: asIso(participant.lastActive),
        timeSpentMinutes: Math.max(Number(participant.timeSpentMinutes || 0), computedMinutes),
      };
    });

    const participantMap = new Map();
    [...historicalParticipants, ...activeParticipants].forEach((participant) => {
      const key = `${participant.userId || 'unknown'}:${participant.joinedAt || 'na'}`;
      if (!participantMap.has(key)) {
        participantMap.set(key, participant);
        return;
      }

      const existing = participantMap.get(key);
      participantMap.set(key, {
        ...existing,
        displayName: participant.displayName || existing.displayName,
        avatar: participant.avatar || existing.avatar,
        avatarEmoji: participant.avatarEmoji || existing.avatarEmoji,
        role: participant.role || existing.role,
        lastActive: participant.lastActive || existing.lastActive,
        timeSpentMinutes: Math.max(Number(existing.timeSpentMinutes || 0), Number(participant.timeSpentMinutes || 0)),
      });
    });

    const participants = [...participantMap.values()]
      .sort((a, b) => new Date(a.joinedAt || 0).getTime() - new Date(b.joinedAt || 0).getTime());

    const effectiveParticipantCount = Math.max(
      Number(room.participantCount || 0),
      Number(room?.stats?.peakParticipants || 0),
      participants.length
    );

    const participantWatchMinutes = participants.reduce((sum, participant) => {
      return sum + Math.max(0, Number(participant.timeSpentMinutes || 0));
    }, 0);

    res.json({
      success: true,
      data: {
        room: {
          roomCode: room.roomCode,
          name: room.name,
          type: room.type,
          description: room.description || '',
          hostId: room.hostId,
          status: room.status,
          participantCount: effectiveParticipantCount,
          startedAt: asIso(room.startedAt),
          endedAt: asIso(room.endedAt),
          createdAt: asIso(room.createdAt),
          settings: {
            privacy: room?.settings?.privacy || 'public',
            allowGuests: Boolean(room?.settings?.allowGuests),
            requireApproval: Boolean(room?.settings?.requireApproval),
          },
          stats: {
            totalRoomMinutes,
            totalWatchTimeMinutes: Math.max(Number(room?.stats?.totalWatchTime || 0), participantWatchMinutes),
            moments: Number(room?.stats?.momentCount || 0),
            messages: Number(room?.stats?.messageCount || 0),
          },
        },
        participants,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/me/achievements
 * Milestone achievements computed from profile stats and social data.
 */
router.get('/me/achievements', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const user = await User.findOne({ clerkId: req.userId })
      .select('stats')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const [friendCount, momentCount] = await Promise.all([
      Friendship.countDocuments({
        status: 'accepted',
        $or: [{ requesterId: req.userId }, { addresseeId: req.userId }],
      }),
      Moment.countDocuments({ 'participants.userId': req.userId }),
    ]);

    const metrics = {
      roomsCreated: toNumber(user?.stats?.roomsCreated),
      watchHours: Math.floor(toNumber(user?.stats?.watchTimeMinutes) / 60),
      momentsCaptured: Math.max(toNumber(user?.stats?.momentCreated), toNumber(momentCount)),
      friends: Math.max(toNumber(user?.stats?.friendsCount), toNumber(friendCount)),
      cupsWon: toNumber(user?.stats?.cupsWon),
    };

    const defs = [
      { id: 'first-room', title: 'First Steps', description: 'Create your first room', metric: 'roomsCreated', target: 1, tier: 'bronze' },
      { id: 'room-10', title: 'Room Architect', description: 'Create 10 rooms', metric: 'roomsCreated', target: 10, tier: 'silver' },
      { id: 'room-25', title: 'Room Commander', description: 'Create 25 rooms', metric: 'roomsCreated', target: 25, tier: 'gold' },
      { id: 'room-50', title: 'Room Legend', description: 'Create 50 rooms', metric: 'roomsCreated', target: 50, tier: 'platinum' },
      { id: 'room-100', title: 'Room Titan', description: 'Create 100 rooms', metric: 'roomsCreated', target: 100, tier: 'diamond' },
      { id: 'watch-10', title: 'Watch Streak', description: 'Watch 10 hours', metric: 'watchHours', target: 10, tier: 'silver' },
      { id: 'watch-25', title: 'Cinephile', description: 'Watch 25 hours', metric: 'watchHours', target: 25, tier: 'gold' },
      { id: 'watch-50', title: 'Marathon Master', description: 'Watch 50 hours', metric: 'watchHours', target: 50, tier: 'platinum' },
      { id: 'watch-100', title: 'Endless Viewer', description: 'Watch 100 hours', metric: 'watchHours', target: 100, tier: 'diamond' },
      { id: 'moments-10', title: 'Moment Hunter', description: 'Capture 10 moments', metric: 'momentsCaptured', target: 10, tier: 'gold' },
      { id: 'friends-5', title: 'Social Spark', description: 'Get 5 friends', metric: 'friends', target: 5, tier: 'silver' },
      { id: 'friends-20', title: 'Community Core', description: 'Get 20 friends', metric: 'friends', target: 20, tier: 'platinum' },
      { id: 'cups-1', title: 'Cup Winner', description: 'Win your first cup', metric: 'cupsWon', target: 1, tier: 'gold' },
    ];

    const achievements = defs.map((def) => {
      const current = toNumber(metrics[def.metric]);
      const unlocked = current >= def.target;
      const progress = clampPercent((current / Math.max(def.target, 1)) * 100);

      return {
        ...def,
        current,
        unlocked,
        progress,
      };
    });

    const unlockedCount = achievements.filter((item) => item.unlocked).length;

    res.json({
      success: true,
      data: {
        metrics,
        summary: {
          unlocked: unlockedCount,
          total: achievements.length,
          completionPercent: clampPercent((unlockedCount / Math.max(achievements.length, 1)) * 100),
        },
        achievements,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/me/favorites
 * Saved favorites for profile hub.
 */
router.get('/me/favorites', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const user = await User.findOne({ clerkId: req.userId })
      .select('favorites')
      .lean();

    res.json({
      success: true,
      data: {
        favorites: {
          rooms: user?.favorites?.rooms || [],
          moments: user?.favorites?.moments || [],
          activities: user?.favorites?.activities || [],
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/me/favorites/:bucket
 * Add a favorite item to rooms|moments|activities bucket.
 */
router.post('/me/favorites/:bucket', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const bucket = String(req.params.bucket || '').trim().toLowerCase();
    if (!validFavoriteBucket(bucket)) {
      return res.status(400).json({ success: false, message: 'Invalid favorites bucket' });
    }

    const item = sanitizeFavoriteItem(bucket, req.body?.item || {});
    if (!item) {
      return res.status(400).json({ success: false, message: 'Invalid favorite item payload' });
    }

    const user = await User.findOne({ clerkId: req.userId }).select('favorites');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const nextFavorites = user.favorites || { rooms: [], moments: [], activities: [] };
    const existing = nextFavorites[bucket] || [];

    const itemKey = bucket === 'rooms'
      ? item.roomCode
      : bucket === 'moments'
        ? item.momentId
        : item.activityId;

    const deduped = existing.filter((entry) => {
      if (bucket === 'rooms') return entry.roomCode !== itemKey;
      if (bucket === 'moments') return entry.momentId !== itemKey;
      return entry.activityId !== itemKey;
    });

    nextFavorites[bucket] = [item, ...deduped].slice(0, 80);
    user.favorites = nextFavorites;
    await user.save();

    res.status(201).json({
      success: true,
      data: {
        favorites: nextFavorites,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/users/me/favorites/:bucket/:itemKey
 * Remove a favorite item.
 */
router.delete('/me/favorites/:bucket/:itemKey', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const bucket = String(req.params.bucket || '').trim().toLowerCase();
    const itemKey = String(req.params.itemKey || '').trim();

    if (!validFavoriteBucket(bucket)) {
      return res.status(400).json({ success: false, message: 'Invalid favorites bucket' });
    }
    if (!itemKey) {
      return res.status(400).json({ success: false, message: 'itemKey is required' });
    }

    const user = await User.findOne({ clerkId: req.userId }).select('favorites');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const nextFavorites = user.favorites || { rooms: [], moments: [], activities: [] };

    if (bucket === 'rooms') {
      nextFavorites.rooms = (nextFavorites.rooms || []).filter((entry) => String(entry.roomCode || '') !== itemKey.toUpperCase());
    } else if (bucket === 'moments') {
      nextFavorites.moments = (nextFavorites.moments || []).filter((entry) => String(entry.momentId || '') !== itemKey);
    } else {
      nextFavorites.activities = (nextFavorites.activities || []).filter((entry) => String(entry.activityId || '') !== itemKey);
    }

    user.favorites = nextFavorites;
    await user.save();

    res.json({
      success: true,
      data: {
        favorites: nextFavorites,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:username
 * Get user by username
 */
router.get('/:username', async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('username displayName avatar bio stats lastActive isOnline')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;