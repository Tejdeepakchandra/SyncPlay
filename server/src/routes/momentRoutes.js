const express = require('express');
const momentService = require('../services/momentService');
const captureService = require('../services/captureService');
const videoProcessor = require('../utils/videoProcessor');
const { authMiddleware } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * GET /api/moments/upload-signature
 * Generate a Cloudinary upload signature for direct client upload.
 * Host client calls this before uploading captured moment video.
 */
router.get('/upload-signature', rateLimiter('moments'), async (req, res, next) => {
  try {
    const roomCode = req.query.roomCode || 'unknown';
    const folder = `moments/${roomCode}`;
    const signatureData = videoProcessor.generateUploadSignature(folder);
    
    res.json({
      success: true,
      data: signatureData
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/moments/room/:roomCode/counts
 * Get moment counts by type for limit display
 */
router.get('/room/:roomCode/counts', rateLimiter('moments'), async (req, res, next) => {
  try {
    const counts = await momentService.getRoomMomentCounts(req.params.roomCode);
    
    res.json({
      success: true,
      data: counts
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/moments/room/:roomCode
 * Get all moments for a room
 */
router.get('/room/:roomCode', rateLimiter('moments'), async (req, res, next) => {
  try {
    const moments = await momentService.getRoomMoments(
      req.params.roomCode,
      parseInt(req.query.limit) || 50
    );
    
    res.json({
      success: true,
      data: moments
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/moments/profile/moments
 * Get all moments for the logged-in user's profile archive.
 * MUST be defined BEFORE /:momentId to avoid route conflict.
 */
router.get('/profile/moments', rateLimiter('moments'), async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.json({ success: true, data: { clips: [], highlights: [] } });
    }

    const User = require('../models/mongodb/User');
    const Moment = require('../models/mongodb/Moment');


    // 1. Get individual clips — moments captured in rooms the user participated in
    const individualClips = await Moment.find({
      status: 'ready',
      'capturedVideo.url': { $exists: true, $ne: null },
      $or: [
        { 'capturedBy.userId': req.userId },
        { 'participants.userId': req.userId },
      ]
    })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();


    // If zero results, also try by roomCode from rooms the user was in
    let allClips = individualClips;
    if (allClips.length === 0) {
      // Fallback: find ALL ready clips (user might not be in participants array)
      const Room = require('../models/mongodb/Room');
      const userRooms = await Room.find({
        $or: [
          { hostId: req.userId },
          { 'participantHistory.userId': req.userId },
        ]
      }).select('roomCode').lean();

      const roomCodes = userRooms.map(r => r.roomCode);

      if (roomCodes.length > 0) {
        allClips = await Moment.find({
          status: 'ready',
          'capturedVideo.url': { $exists: true, $ne: null },
          roomCode: { $in: roomCodes },
        })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
      }
    }

    const clips = allClips.map(m => ({
      _id: m._id,
      type: 'clip',
      momentType: m.type,
      roomCode: m.roomCode,
      timestamp: m.timestamp,
      videoUrl: m.capturedVideo?.url,
      thumbnailUrl: m.capturedVideo?.thumbnailUrl,
      duration: m.capturedVideo?.duration,
      label: m.type === 'bookmark' ? 'Bookmarked Moment'
        : m.type === 'reaction_spike' ? 'Reaction Highlight'
        : m.type === 'comment_cluster' ? 'Chat Highlight'
        : 'Captured Moment',
      createdAt: m.createdAt,
    }));

    // 2. Get merged session highlights from user's favorites.activities
    const user = await User.findOne({ clerkId: req.userId })
      .select('favorites.activities')
      .lean();

    const highlights = (user?.favorites?.activities || [])
      .filter(a => a.type === 'session_highlights' && a.videoUrl)
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      .slice(0, 50)
      .map(h => ({
        ...h,
        type: 'highlight',
      }));


    res.json({
      success: true,
      data: {
        clips,
        highlights,
        total: clips.length + highlights.length,
      }
    });
  } catch (error) {
    console.error('[MOMENTS-API] Error:', error.message);
    next(error);
  }
});

/**
 * GET /api/moments/:momentId
 * Get moment by ID
 */
router.get('/:momentId', rateLimiter('moments'), async (req, res, next) => {
  try {
    const moment = await momentService.getMomentById(req.params.momentId);
    
    res.json({
      success: true,
      data: moment
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/moments/:momentId/share
 * Generate share URLs for moment
 */
router.post('/:momentId/share', rateLimiter('moments'), async (req, res, next) => {
  try {
    const moment = await momentService.getMomentById(req.params.momentId);
    
    // Generate share URLs
    const baseUrl = process.env.APP_URL || 'https://syncplay.app';
    const shareUrl = `${baseUrl}/moment/${moment._id}`;
    
    const shareUrls = {
      direct: shareUrl,
      instagram: `instagram-stories://share?source_application=syncplay&media=${encodeURIComponent(moment.capturedVideo?.url)}`,
      whatsapp: `https://wa.me/?text=${encodeURIComponent(`Check out this moment from SyncPlay! ${shareUrl}`)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent('Epic moment from SyncPlay!')}&url=${encodeURIComponent(shareUrl)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    };
    
    // Update moment with share URLs
    moment.shareUrls = shareUrls;
    moment.stats.shareCount += 1;
    await moment.save();
    
    res.json({
      success: true,
      data: shareUrls
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/moments/:momentId/save
 * Save moment to user's collection
 */
router.post('/:momentId/save', rateLimiter('moments'), async (req, res, next) => {
  try {
    const moment = await momentService.getMomentById(req.params.momentId);
    
    // Increment save count
    moment.stats.saveCount += 1;
    await moment.save();
    
    // Add to user's saved moments
    if (!req.isGuest && req.userId) {
      const User = require('../models/mongodb/User');
      await User.findOneAndUpdate(
        { clerkId: req.userId },
        {
          $addToSet: {
            'favorites.moments': {
              momentId: moment._id.toString(),
              title: `${moment.type === 'reaction_spike' ? 'Reaction Spike' : moment.type === 'comment_cluster' ? 'Hot Discussion' : 'Bookmarked Moment'}`,
              roomCode: moment.roomCode,
              addedAt: new Date()
            }
          }
        }
      );
    }
    
    res.json({
      success: true,
      data: { saved: true }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/moments/:momentId
 * Delete moment
 */
router.delete('/:momentId', rateLimiter('moments'), async (req, res, next) => {
  try {
    const result = await momentService.deleteMoment(req.params.momentId, req.userId);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/moments/upload
 * Upload captured moment video
 */
router.post(
  '/upload', 
  rateLimiter('moments'),
  upload.single('video'),
  async (req, res, next) => {
    try {
      const { momentId, captureJobId, metadata } = req.body;
      const videoFile = req.file;
      
      if (!videoFile) {
        return res.status(400).json({
          success: false,
          error: 'No video file provided'
        });
      }
      
      // Process video data
      const videoData = {
        path: videoFile.path,
        size: videoFile.size,
        mimetype: videoFile.mimetype,
        metadata: JSON.parse(metadata || '{}')
      };
      
      const moment = await momentService.processUploadedMoment(
        momentId,
        captureJobId,
        videoData
      );
      
      res.json({
        success: true,
        data: moment
      });
      
    } catch (error) {
      next(error);
    }
  }
);


module.exports = router;