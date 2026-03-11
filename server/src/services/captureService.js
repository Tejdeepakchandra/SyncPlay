const Moment = require('../models/mongodb/Moment');
const redisClient = require('../config/redis');
const cloudinary = require('../utils/cloudinary');
const videoProcessor = require('../utils/videoProcessor');
const { v4: uuidv4 } = require('uuid');

class CaptureService {
  constructor() {
    this.CAPTURE_KEY = 'capture:';
    this.CAPTURE_LOCK_KEY = 'capture:lock:';
    this.CAPTURE_TTL = 3600; // 1 hour
    this.LOCK_TTL = 30; // 30 seconds
  }

  /**
   * Initialize capture for a moment
   */
  async initializeCapture(momentId, participants) {
    try {
      const captureId = uuidv4();
      const now = Date.now();
      
      // Store capture metadata in Redis only
      await redisClient.set(
        `${this.CAPTURE_KEY}${captureId}`,
        JSON.stringify({
          captureId,
          momentId,
          participants,
          startTime: now,
          status: 'initialized',
          uploads: []
        }),
        { EX: this.CAPTURE_TTL }
      );
      
      return captureId;
      
    } catch (error) {
      console.error('Initialize capture error:', error);
      throw error;
    }
  }

  /**
   * Handle participant upload
   */
  async handleParticipantUpload(captureId, userId, videoData) {
    try {
      // Get capture from Redis
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      if (!captureData) throw new Error('Capture not found');
      
      const capture = JSON.parse(captureData);
      
      // Add upload
      capture.uploads.push({
        userId,
        videoData,
        timestamp: Date.now()
      });
      
      // Update in Redis
      await redisClient.set(
        `${this.CAPTURE_KEY}${captureId}`,
        JSON.stringify(capture),
        { EX: this.CAPTURE_TTL }
      );
      
      // Check if we have enough uploads (at least 50% of participants)
      const requiredUploads = Math.ceil(capture.participants.length * 0.5);
      const ready = capture.uploads.length >= requiredUploads;
      
      return { 
        success: true, 
        uploadsReceived: capture.uploads.length,
        ready
      };
      
    } catch (error) {
      console.error('Handle participant upload error:', error);
      throw error;
    }
  }

  /**
   * Process capture (combine all uploads) with locking
   */
  async processCapture(captureId) {
    const lockKey = `${this.CAPTURE_LOCK_KEY}${captureId}`;
    
    try {
      // Try to acquire lock
      const lock = await redisClient.set(lockKey, 'processing', {
        NX: true,
        EX: this.LOCK_TTL
      });
      
      if (!lock) {
        throw new Error('Capture already being processed by another server');
      }
      
      // Get capture from Redis
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      if (!captureData) throw new Error('Capture not found');
      
      const capture = JSON.parse(captureData);
      
      // Update status
      capture.status = 'processing';
      await redisClient.set(
        `${this.CAPTURE_KEY}${captureId}`,
        JSON.stringify(capture),
        { EX: this.CAPTURE_TTL }
      );
      
      // Get the moment
      const moment = await Moment.findById(capture.momentId);
      if (!moment) throw new Error('Moment not found');
      
      // Select best quality uploads
      const bestUploads = this.selectBestUploads(capture.uploads);
      
      // Process videos (combine, add overlays)
      const processedVideo = await videoProcessor.combineVideos({
        mainVideo: bestUploads[0]?.videoData,
        participantVideos: bestUploads.slice(1),
        reactions: moment.reactions,
        comments: moment.comments,
        duration: moment.duration,
        timestamp: moment.timestamp
      });
      
      // Upload to cloud
      const cloudinaryResult = await cloudinary.uploadVideo(
        processedVideo,
        {
          folder: `moments/${moment.roomCode}`,
          public_id: `moment-${moment._id}`,
          resource_type: 'video'
        }
      );
      
      // Update moment with final video
      moment.capturedVideo = {
        url: cloudinaryResult.secure_url,
        thumbnailUrl: cloudinaryResult.thumbnail_url,
        webmUrl: processedVideo.webmUrl,
        mp4Url: processedVideo.mp4Url,
        duration: processedVideo.duration,
        size: cloudinaryResult.bytes,
        format: 'mp4',
        width: cloudinaryResult.width,
        height: cloudinaryResult.height
      };
      
      moment.status = 'ready';
      await moment.save();
      
      // Clean up Redis
      await redisClient.del(`${this.CAPTURE_KEY}${captureId}`);
      await redisClient.del(lockKey);
      
      return moment;
      
    } catch (error) {
      console.error('Process capture error:', error);
      
      // Release lock on error
      await redisClient.del(lockKey);
      
      // Update moment status
      await Moment.findByIdAndUpdate(capture?.momentId, {
        status: 'failed',
        errorMessage: error.message
      });
      
      throw error;
    }
  }

  /**
   * Select best uploads (highest quality)
   */
  selectBestUploads(uploads) {
    return uploads.sort((a, b) => {
      const aQuality = (a.videoData.width || 0) * (a.videoData.height || 0);
      const bQuality = (b.videoData.width || 0) * (b.videoData.height || 0);
      return bQuality - aQuality;
    });
  }

  /**
   * Get capture status
   */
  async getCaptureStatus(captureId) {
    try {
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      return captureData ? JSON.parse(captureData) : null;
    } catch (error) {
      console.error('Get capture status error:', error);
      return null;
    }
  }

  /**
   * Cancel capture
   */
  async cancelCapture(captureId, reason) {
    try {
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      if (captureData) {
        const capture = JSON.parse(captureData);
        await Moment.findByIdAndUpdate(capture.momentId, {
          status: 'failed',
          errorMessage: reason
        });
      }
      
      await redisClient.del(`${this.CAPTURE_KEY}${captureId}`);
      await redisClient.del(`${this.CAPTURE_LOCK_KEY}${captureId}`);
      
      return { success: true };
      
    } catch (error) {
      console.error('Cancel capture error:', error);
      throw error;
    }
  }
}

module.exports = new CaptureService();