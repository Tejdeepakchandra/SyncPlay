const express = require('express');
const multer = require('multer');
const roomService = require('../services/roomService');
const mediaCleanupService = require('../services/mediaCleanupService');
const Room = require('../models/mongodb/Room');
const cloudinary = require('../utils/cloudinary');
const { validateRoomCreation } = require('../middleware/validation');
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

/**
 * Create new room
 * POST /api/rooms
 */
router.post('/', validateRoomCreation, async (req, res, next) => {
  const startTime = Date.now();
  console.log(`[ROOMS] 🚀 POST /rooms START - userId: ${req.userId}`);
  
  try {
    console.log(`[ROOMS] 📥 Request body:`, { 
      name: req.body.name, 
      type: req.body.type 
    });
    
    const hostId = req.userId; // From auth middleware
    
    if (!hostId) {
      console.log(`[ROOMS] ❌ No userId in request`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    console.log(`[ROOMS] 🔄 Calling roomService.createRoom...`);
    const room = await roomService.createRoom(req.body, hostId);
    
    console.log(`[ROOMS] ✅ Room created: ${room.roomCode} in ${Date.now() - startTime}ms`);
    
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
    console.log(`[ROOMS] ❌ Error after ${Date.now() - startTime}ms:`, error.message);
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
        uploadedBy: req.userId,
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

    await room.save();

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

module.exports = router;