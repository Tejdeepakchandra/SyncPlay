const express = require('express');
const multer = require('multer');
const roomService = require('../services/roomService');
const mediaCleanupService = require('../services/mediaCleanupService');
const Room = require('../models/mongodb/Room');
const User = require('../models/mongodb/User');
const Friendship = require('../models/mongodb/Friendship');
const cloudinary = require('../utils/cloudinary');
const { validateRoomCreation } = require('../middleware/validation');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const mediaType = file?.mimetype || '';
    if (!mediaType.startsWith('video/') && !mediaType.startsWith('audio/')) {
      return cb(new Error('Only audio or video uploads are supported'));
    }
    cb(null, true);
  },
});

function canControlMedia(room, userId) {
  const participant = room?.participants?.find((p) => p.userId?.toString() === userId?.toString());
  if (!participant) return false;
  if (participant.restrictions?.mediaControlDisabledByHost) return false;
  if (participant.role === 'host' || participant.role === 'cohost' || participant.role === 'co-host') {
    return true;
  }
  return participant.permissions?.canControl !== false;
}

const GENRE_KEYWORDS = {
  action: ['action', 'avengers', 'marvel', 'hero', 'combat', 'war'],
  thriller: ['thriller', 'mystery', 'crime', 'detective', 'suspense'],
  horror: ['horror', 'ghost', 'haunted', 'zombie', 'slasher'],
  comedy: ['comedy', 'funny', 'sitcom', 'humor', 'laugh'],
  romance: ['romance', 'love', 'romcom', 'valentine'],
  scifi: ['sci-fi', 'scifi', 'space', 'future', 'cyber', 'alien'],
  anime: ['anime', 'otaku', 'manga'],
  lofi: ['lo-fi', 'lofi', 'chill beats', 'study beats'],
  edm: ['edm', 'house', 'techno', 'trance', 'rave'],
  hiphop: ['hip hop', 'hiphop', 'rap', 'trap'],
  pop: ['pop', 'chart', 'mainstream'],
  rock: ['rock', 'metal', 'punk'],
  jazz: ['jazz', 'soul', 'blues'],
  classical: ['classical', 'orchestra', 'mozart', 'beethoven'],
  kpop: ['k-pop', 'kpop', 'korean pop'],
};

const LANGUAGE_KEYWORDS = {
  english: ['english', 'eng'],
  hindi: ['hindi', 'bollywood', 'hindustani'],
  tamil: ['tamil', 'kollywood'],
  telugu: ['telugu', 'tollywood'],
  korean: ['korean', 'kdrama', 'k-pop', 'kpop'],
  japanese: ['japanese', 'anime', 'jpop'],
  spanish: ['spanish', 'latino', 'reggaeton'],
};

const parseCsvSet = (value) => {
  if (!value) return new Set();
  return new Set(
    String(value)
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
};

const extractYouTubeId = (url = '') => {
  const value = String(url || '');
  const directMatch = value.match(/[?&]v=([a-zA-Z0-9_-]{6,})/);
  if (directMatch?.[1]) return directMatch[1];
  const shortMatch = value.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/);
  if (shortMatch?.[1]) return shortMatch[1];
  return null;
};

const deriveGenresAndLanguages = (room) => {
  const haystack = `${room?.name || ''} ${room?.media?.current?.title || ''}`.toLowerCase();
  const genres = new Set();
  const languages = new Set();

  Object.entries(GENRE_KEYWORDS).forEach(([genre, words]) => {
    if (words.some((word) => haystack.includes(word))) genres.add(genre);
  });

  Object.entries(LANGUAGE_KEYWORDS).forEach(([language, words]) => {
    if (words.some((word) => haystack.includes(word))) languages.add(language);
  });

  return {
    genres: [...genres],
    languages: [...languages],
  };
};

const deriveRoomCover = (room) => {
  const media = room?.media?.current || {};
  const thumbnail = media?.thumbnail;
  if (thumbnail) {
    return { coverUrl: thumbnail, coverType: 'thumbnail' };
  }

  const ytId = extractYouTubeId(media?.url || media?.metadata?.videoUrl || '');
  if (ytId) {
    return {
      coverUrl: `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`,
      coverType: 'youtube',
    };
  }

  const cloudinaryPublicId = media?.metadata?.cloudinary?.publicId;
  if (cloudinaryPublicId && media?.url && String(media.url).includes('res.cloudinary.com')) {
    try {
      const [, cloudName] = String(media.url).match(/res\.cloudinary\.com\/([^/]+)/) || [];
      if (cloudName) {
        return {
          coverUrl: `https://res.cloudinary.com/${cloudName}/video/upload/so_2,w_960,h_540,c_fill,q_auto,f_jpg/${cloudinaryPublicId}.jpg`,
          coverType: 'cloudinary-video-frame',
        };
      }
    } catch {
      // Ignore parsing errors and fallback.
    }
  }

  return { coverUrl: '', coverType: 'none' };
};

const scoreRoom = ({ room, friendHostIds, preferredGenres, preferredLanguages, includePersonalized }) => {
  const recencyMinutes = Math.max(0, (Date.now() - new Date(room.updatedAt || room.createdAt).getTime()) / 60000);
  const freshnessScore = Math.max(0, 12 - Math.min(12, recencyMinutes / 5));

  const genres = room.meta?.genres || [];
  const languages = room.meta?.languages || [];
  const matchedGenres = genres.filter((g) => preferredGenres.has(g));
  const matchedLanguages = languages.filter((l) => preferredLanguages.has(l));

  const friendHostBoost = friendHostIds.has(room.host?.id) ? 25 : 0;
  const genreBoost = matchedGenres.length * 8;
  const languageBoost = matchedLanguages.length * 6;
  const coverBoost = room.cover?.coverUrl ? 2 : 0;

  const base = Number(room.participantCount || 0) * 3 + freshnessScore + coverBoost;
  const personalizedBoost = includePersonalized ? friendHostBoost + genreBoost + languageBoost : 0;

  return {
    score: base + personalizedBoost,
    matchedGenres,
    matchedLanguages,
    friendHostBoost,
  };
};

/**
 * Create new room
 * POST /api/rooms
 */
router.post('/', validateRoomCreation, async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    
    const hostId = req.userId; // From auth middleware
    
    if (!hostId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const room = await roomService.createRoom(req.body, hostId);

    const invitedUserIds = (room.invitedUsers || [])
      .map((inv) => inv?.userId)
      .filter(Boolean);

    if (invitedUserIds.length > 0) {
      const inviterUser = await User.findOne({ clerkId: hostId }).select('displayName username').lean();
      const roomPath = room.type === 'music' ? `/music/room/${room.roomCode}` : `/room/${room.roomCode}`;
      await notificationService.createManyNotifications({
        io: req.app.get('io'),
        userIds: invitedUserIds,
        actorId: hostId,
        type: 'room_invite',
        title: `${inviterUser?.displayName || inviterUser?.username || 'A friend'} invited you`,
        body: `Join \"${room.name}\" (${room.type})`,
        metadata: {
          room_code: room.roomCode,
          room_name: room.name,
          room_type: room.type,
          room_path: roomPath,
          path: roomPath,
        },
      });

      // Email offline invited users (async)
      if (emailService.isConfigured()) {
        (async () => {
          try {
            const invitedUsers = await User.find({ clerkId: { $in: invitedUserIds } })
              .select('clerkId email displayName isOnline')
              .lean();

            const inviterName = inviterUser?.displayName || inviterUser?.username || 'A friend';

            for (const user of invitedUsers) {
              if (user.isOnline) continue;
              if (!user.email || user.email.endsWith('@syncplay.local')) continue;

              emailService.sendRoomInviteEmail({
                to: user.email,
                inviterName,
                roomName: room.name,
                roomCode: room.roomCode,
                roomType: room.type,
              }).catch(() => {});
            }
          } catch (_err) {
            // Email failures shouldn't break room creation
          }
        })();
      }
    }
    
    const io = req.app.get('io');
    if (io) {
      io.emit('discovery:rooms-updated', {
        type: room.type,
        roomCode: room.roomCode,
        roomName: room.name,
        reason: 'room-created',
        at: new Date().toISOString(),
      });
    }
    
    res.status(201).json({
      success: true,
      data: {
        roomCode: room.roomCode,
        name: room.name,
        type: room.type,
        hostId: room.hostId
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Discover rooms
 * GET /api/rooms?type=movie|music&status=active|lobby&limit=24
 */
router.get('/', async (req, res, next) => {
  try {
    const type = String(req.query.type || '').trim().toLowerCase();
    const requestedStatuses = String(req.query.status || 'active,lobby')
      .split(',')
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
    const allowedStatuses = ['lobby', 'active', 'paused', 'ended'];
    const statusList = requestedStatuses.filter((status) => allowedStatuses.includes(status));
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 50);
    const personalized = String(req.query.personalized || '').trim().toLowerCase();
    const includePersonalized = personalized === '1' || personalized === 'true';

    const filter = {
      status: { $in: statusList.length > 0 ? statusList : ['active', 'lobby'] },
      'settings.privacy': { $ne: 'private' },
    };

    if (type && ['movie', 'music', 'custom'].includes(type)) {
      filter.type = type;
    }

    const rooms = await Room.find(filter)
      .select('roomCode name type status participantCount participants media.current settings createdAt updatedAt')
      .sort({ participantCount: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    let friendHostIds = new Set();
    let preferredGenres = parseCsvSet(req.query.preferredGenres);
    let preferredLanguages = parseCsvSet(req.query.preferredLanguages);

    if (includePersonalized && !req.isGuest && req.userId) {
      const [userDoc, links] = await Promise.all([
        User.findOne({ clerkId: req.userId }).select('preferences.discovery').lean(),
        Friendship.find({
          status: 'accepted',
          $or: [{ requesterId: req.userId }, { addresseeId: req.userId }],
        })
          .select('requesterId addresseeId')
          .lean(),
      ]);

      friendHostIds = new Set(
        links.map((f) => (f.requesterId === req.userId ? f.addresseeId : f.requesterId)).filter(Boolean)
      );

      if (preferredGenres.size === 0) {
        const mergedGenres = [
          ...(userDoc?.preferences?.discovery?.movieGenres || []),
          ...(userDoc?.preferences?.discovery?.musicGenres || []),
        ];
        preferredGenres = new Set(mergedGenres.map((g) => String(g).toLowerCase()));
      }

      if (preferredLanguages.size === 0) {
        preferredLanguages = new Set((userDoc?.preferences?.discovery?.languages || []).map((l) => String(l).toLowerCase()));
      }
    }

    const data = rooms.map((room) => {
      const hostParticipant = Array.isArray(room.participants)
        ? room.participants.find((p) => p?.role === 'host')
        : null;

      const meta = deriveGenresAndLanguages(room);
      const cover = deriveRoomCover(room);

      const payload = {
        roomCode: room.roomCode,
        name: room.name,
        type: room.type,
        status: room.status,
        participantCount: Number(room.participantCount || 0),
        privacy: room?.settings?.privacy || 'public',
        host: {
          id: hostParticipant?.userId || room?.hostId || null,
          name: hostParticipant?.displayName || hostParticipant?.username || 'Host',
          avatarEmoji: hostParticipant?.avatar_emoji || '🧑',
        },
        media: {
          title: room?.media?.current?.title || '',
          source: room?.media?.current?.source || '',
          thumbnail: room?.media?.current?.thumbnail || '',
        },
        cover,
        meta,
        updatedAt: room.updatedAt,
        createdAt: room.createdAt,
      };

      const ranking = scoreRoom({
        room: payload,
        friendHostIds,
        preferredGenres,
        preferredLanguages,
        includePersonalized,
      });

      return {
        ...payload,
        ranking,
      };
    });

    data.sort((a, b) => Number(b?.ranking?.score || 0) - Number(a?.ranking?.score || 0));

    res.json({
      success: true,
      data: {
        rooms: data.slice(0, limit),
        count: data.length,
        personalized: includePersonalized,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get room by code
 * GET /api/rooms/:roomCode
 */
router.get('/:roomCode', async (req, res, next) => {
  try {
    const room = await roomService.getRoomByCode(req.params.roomCode);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Don't send sensitive data
    const safeRoom = {
      roomCode: room.roomCode,
      name: room.name,
      type: room.type,
      hostId: room.hostId,
      status: room.status,
      participantCount: room.participantCount,
      settings: room.settings,
      createdAt: room.createdAt
    };
    
    res.json({
      success: true,
      data: safeRoom
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Join room
 * POST /api/rooms/:roomCode/join
 */
router.post('/:roomCode/join', async (req, res, next) => {
  try {
    const userId = req.userId;
    const asGuest = req.body.asGuest || false;
    
    const result = await roomService.joinRoom(
      req.params.roomCode, 
      userId, 
      asGuest
    );
    
    res.json({
      success: true,
      data: {
        room: {
          roomCode: result.room.roomCode,
          name: result.room.name,
          type: result.room.type,
          hostId: result.room.hostId
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Leave room
 * POST /api/rooms/:roomCode/leave
 */
router.post('/:roomCode/leave', async (req, res, next) => {
  try {
    const userId = req.userId;
    
    const result = await roomService.leaveRoom(req.params.roomCode, userId);
    
    res.json({
      success: true,
      data: {
        participants: result.participants
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get room participants
 * GET /api/rooms/:roomCode/participants
 */
router.get('/:roomCode/participants', async (req, res, next) => {
  try {
    const participants = await roomService.getRoomParticipants(req.params.roomCode);
    
    res.json({
      success: true,
      data: {
        participants,
        count: participants.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update room settings (host only)
 * PUT /api/rooms/:roomCode/settings
 */
router.put('/:roomCode/settings', async (req, res, next) => {
  try {
    const room = await roomService.updateRoomSettings(
      req.params.roomCode,
      req.userId,
      req.body
    );
    
    res.json({
      success: true,
      data: {
        settings: room.settings
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * End room (host only)
 * POST /api/rooms/:roomCode/end
 */
router.post('/:roomCode/end', async (req, res, next) => {
  try {
    const room = await roomService.endRoom(req.params.roomCode, req.userId);
    const io = req.app.get('io');
    if (io) {
      io.emit('discovery:rooms-updated', {
        type: room?.type || null,
        roomCode: req.params.roomCode,
        roomName: room?.name || null,
        reason: 'room-ended',
        at: new Date().toISOString(),
      });
    }
    
    res.json({
      success: true,
      data: {
        status: room.status,
        endedAt: room.endedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Upload room media and set as current upload source
 * POST /api/rooms/:roomCode/media/upload
 */
router.post('/:roomCode/media/upload', upload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file uploaded' });
    }

    if (!cloudinary.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Cloudinary is not configured on server',
      });
    }

    const roomCode = req.params.roomCode;
    const room = await Room.findOne({ roomCode });
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    if (room.status === 'ended') {
      return res.status(400).json({ success: false, message: 'Room has ended' });
    }

    if (!canControlMedia(room, req.userId)) {
      return res.status(403).json({ success: false, message: 'Permission denied' });
    }

    const isAudio = req.file.mimetype?.startsWith('audio/');
    const title = String(
      req.body?.title || req.file.originalname || (isAudio ? 'Uploaded Audio' : 'Uploaded Video')
    ).slice(0, 160);

    const previousPublicId = room?.media?.current?.metadata?.cloudinary?.publicId || null;
    const previousResourceType = room?.media?.current?.metadata?.cloudinary?.resourceType || 'video';

    const uploadResult = await cloudinary.uploadVideoBuffer(req.file.buffer, {
      folder: `syncplay/rooms/${room.roomCode}`,
      resource_type: isAudio ? 'video' : 'video',
      public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      overwrite: false,
      use_filename: false,
    });

    const mediaUrl = uploadResult?.secure_url;
    const mediaPublicId = uploadResult?.public_id;
    if (!mediaUrl || !mediaPublicId) {
      throw new Error('Cloudinary upload failed');
    }

    const now = new Date();

    room.media = room.media || {};
    room.media.current = {
      source: 'upload',
      url: mediaUrl,
      title,
      duration: null,
      currentTime: 0,
      startTime: now,
      pausedAt: now,
      metadata: {
        type: isAudio ? 'local' : 'upload',
        videoUrl: mediaUrl,
        audioUrl: isAudio ? mediaUrl : null,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
            roomName: room?.name || null,
        cloudinary: {
          publicId: mediaPublicId,
          resourceType: 'video',
          bytes: uploadResult?.bytes || req.file.size,
          format: uploadResult?.format || null,
        },
      },
    };
    room.status = 'active';
    room.syncState = {
      ...(room.syncState || {}),
      isPlaying: false,
      baseTimestamp: 0,
      currentTime: 0,
      startAt: null,
      playbackRate: 1,
      lastUpdated: now,
      updatedBy: req.userId,
    };

    // Track this upload for cleanup when room ends
    if (!room.uploadedAssets) room.uploadedAssets = [];
    const alreadyTracked = room.uploadedAssets.some(a => a.publicId === mediaPublicId);
    if (!alreadyTracked) {
      room.uploadedAssets.push({
        publicId: mediaPublicId,
        resourceType: 'video',
        url: mediaUrl,
        uploadedBy: req.userId,
        uploadedAt: now,
      });
    }

    await room.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('discovery:rooms-updated', {
        type: room.type,
        roomCode: room.roomCode,
        roomName: room.name,
        reason: 'media-updated',
        at: new Date().toISOString(),
      });
    }

    if (previousPublicId && previousPublicId !== mediaPublicId) {
      await mediaCleanupService.enqueue(previousPublicId, previousResourceType, 'media-replaced');
    }

    res.json({
      success: true,
      data: {
        media: {
          type: isAudio ? 'local' : 'upload',
          videoUrl: mediaUrl,
          audioUrl: isAudio ? mediaUrl : undefined,
          url: mediaUrl,
          title,
          duration: null,
          publicId: mediaPublicId,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Invite users to a room and notify them in realtime.
 * POST /api/rooms/:roomCode/invite
 */
router.post('/:roomCode/invite', async (req, res, next) => {
  try {
    if (req.isGuest || !req.userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const roomCode = String(req.params.roomCode || '').trim().toUpperCase();
    if (!roomCode) {
      return res.status(400).json({ success: false, message: 'roomCode is required' });
    }

    const room = await Room.findOne({ roomCode });
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found' });
    }

    const inviterParticipant = room.participants.find((p) => p.userId === req.userId);
    if (!inviterParticipant) {
      return res.status(403).json({ success: false, message: 'You are not in this room' });
    }

    const canInvite =
      room.hostId === req.userId ||
      inviterParticipant.role === 'co-host' ||
      inviterParticipant.role === 'cohost' ||
      inviterParticipant.permissions?.canInvite;

    if (!canInvite) {
      return res.status(403).json({ success: false, message: 'You do not have invite permissions' });
    }

    const rawIds = Array.isArray(req.body?.userIds)
      ? req.body.userIds
      : req.body?.targetUserId
        ? [req.body.targetUserId]
        : [];

    const targetUserIds = [...new Set(rawIds.map((id) => String(id || '').trim()).filter(Boolean))]
      .filter((id) => id !== req.userId);

    if (targetUserIds.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one target user is required' });
    }

    const inviterUser = await User.findOne({ clerkId: req.userId }).select('username displayName').lean();
    const roomPath = room.type === 'music' ? `/music/room/${room.roomCode}` : `/room/${room.roomCode}`;

    const newlyInvited = [];
    room.invitedUsers = room.invitedUsers || [];

    for (const userId of targetUserIds) {
      const alreadyInvited = room.invitedUsers.some((inv) => inv.userId === userId);
      if (!alreadyInvited) {
        room.invitedUsers.push({
          userId,
          email: null,
          name: null,
          invitedAt: new Date(),
        });
        newlyInvited.push(userId);
      }
    }

    if (newlyInvited.length > 0) {
      await room.save();
    }

    const io = req.app.get('io');
    await notificationService.createManyNotifications({
      io,
      userIds: newlyInvited,
      actorId: req.userId,
      type: room.type === 'music' ? 'room_invite' : 'room_invite',
      title: `${inviterUser?.displayName || inviterUser?.username || 'A friend'} invited you`,
      body: `Join \"${room.name}\" (${room.type})`,
      metadata: {
        room_code: room.roomCode,
        room_name: room.name,
        room_type: room.type,
        room_path: roomPath,
        path: roomPath,
      },
    });

    // Send email invites to offline users (async, don't block response)
    if (newlyInvited.length > 0 && emailService.isConfigured()) {
      (async () => {
        try {
          const invitedUsers = await User.find({ clerkId: { $in: newlyInvited } })
            .select('clerkId email displayName username isOnline')
            .lean();

          const inviterDisplayName = inviterUser?.displayName || inviterUser?.username || 'A friend';

          for (const invitedUser of invitedUsers) {
            // Only email offline users — online users already get real-time notification
            if (invitedUser.isOnline) continue;
            if (!invitedUser.email || invitedUser.email.endsWith('@syncplay.local')) continue;

            emailService.sendRoomInviteEmail({
              to: invitedUser.email,
              inviterName: inviterDisplayName,
              roomName: room.name,
              roomCode: room.roomCode,
              roomType: room.type,
            }).catch((err) => {
              console.error(`[INVITE-EMAIL] Failed for ${invitedUser.email}:`, err.message);
            });
          }
        } catch (emailErr) {
          console.error('[INVITE-EMAIL] Batch error:', emailErr.message);
        }
      })();
    }

    res.json({
      success: true,
      data: {
        roomCode: room.roomCode,
        invitedCount: newlyInvited.length,
        invitedUserIds: newlyInvited,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;