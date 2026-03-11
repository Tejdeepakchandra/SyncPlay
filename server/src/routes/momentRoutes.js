const express = require('express');
const momentService = require('../services/momentService');
const captureService = require('../services/captureService');
const { authMiddleware } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

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
    
    // Add to user's saved moments (if user is logged in)
    if (!req.isGuest) {
      // Implement user's saved moments collection
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
  rateLimiter('upload'),
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