const Moment = require('../models/mongodb/Moment');
const redisClient = require('../config/redis');
const { generateEventId } = require('../utils/helpers');

/**
 * CaptureService — Coordinates host-only screen capture.
 * 
 * Flow:
 * 1. Server detects moment → initializeCapture() stores state in Redis
 * 2. Server sends 'moment:capture-request' to host socket only
 * 3. Host captures screen (10-15s) → uploads directly to Cloudinary
 * 4. Host sends 'moment:capture-complete' with Cloudinary URL
 * 5. completeCapture() updates Moment doc with video URL
 * 6. Server broadcasts 'moment:ready' to all users
 */
class CaptureService {
  constructor() {
    this.CAPTURE_KEY = 'capture:';
    this.CAPTURE_LOCK_KEY = 'capture:lock:';
    this.CAPTURE_TTL = 120;   // 2 min — capture should complete within this
    this.LOCK_TTL = 30;       // 30 seconds lock
    this.RETRY_MAX = 3;
  }

  /**
   * Initialize a capture job — stores metadata in Redis.
   * Called after moment is detected and intensity is high enough.
   */
  async initializeCapture(momentId, roomCode, hostId, captureJobId = null) {
    try {
      const id = captureJobId || generateEventId();
      const now = Date.now();
      
      // Store capture metadata in Redis
      await redisClient.set(
        `${this.CAPTURE_KEY}${id}`,
        JSON.stringify({
          captureId: id,
          momentId,
          roomCode,
          hostId,
          startTime: now,
          status: 'waiting_for_host',  // host hasn't started recording yet
          retries: 0,
        }),
        { EX: this.CAPTURE_TTL }
      );
      
      return id;
      
    } catch (error) {
      console.error('Initialize capture error:', error);
      throw error;
    }
  }

  /**
   * Mark capture as in-progress (host started recording).
   */
  async markCaptureStarted(captureId) {
    try {
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      if (!captureData) return false;
      
      const capture = JSON.parse(captureData);
      capture.status = 'recording';
      capture.recordingStartedAt = Date.now();
      
      await redisClient.set(
        `${this.CAPTURE_KEY}${captureId}`,
        JSON.stringify(capture),
        { EX: this.CAPTURE_TTL }
      );
      
      return true;
    } catch (error) {
      console.error('Mark capture started error:', error);
      return false;
    }
  }

  /**
   * Complete capture — host uploaded to Cloudinary, update Moment doc.
   */
  async completeCapture(captureId, videoData) {
    const lockKey = `${this.CAPTURE_LOCK_KEY}${captureId}`;
    
    try {
      // Acquire lock to prevent duplicate processing
      const lock = await redisClient.set(lockKey, 'completing', {
        NX: true,
        EX: this.LOCK_TTL
      });
      
      if (!lock) {
        throw new Error('Capture already being processed');
      }
      
      // Get capture metadata from Redis
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      if (!captureData) throw new Error('Capture not found or expired');
      
      const capture = JSON.parse(captureData);
      
      // Update Moment with video data
      const moment = await Moment.findById(capture.momentId);
      if (!moment) throw new Error('Moment not found');
      
      moment.capturedVideo = {
        url: videoData.url || videoData.secure_url,
        thumbnailUrl: videoData.thumbnailUrl || videoData.thumbnail_url,
        webmUrl: videoData.webmUrl,
        mp4Url: videoData.mp4Url,
        duration: videoData.duration,
        size: videoData.size || videoData.bytes,
        format: videoData.format || 'webm',
        width: videoData.width,
        height: videoData.height
      };
      moment.cloudinaryPublicId = videoData.publicId || videoData.public_id;
      moment.status = 'ready';
      await moment.save();
      
      // Clean up Redis
      await redisClient.del(`${this.CAPTURE_KEY}${captureId}`);
      await redisClient.del(lockKey);
      
      return moment;
      
    } catch (error) {
      console.error('Complete capture error:', error);
      
      // Release lock on error
      await redisClient.del(lockKey);
      
      // Try to get momentId for status update
      try {
        const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
        if (captureData) {
          const capture = JSON.parse(captureData);
          await Moment.findByIdAndUpdate(capture.momentId, {
            status: 'failed',
            errorMessage: error.message
          });
        }
      } catch (_) { /* ignore cleanup errors */ }
      
      throw error;
    }
  }

  /**
   * Handle capture failure from host. Retry if under limit, else fail.
   */
  async handleCaptureFailed(captureId, reason) {
    try {
      const captureData = await redisClient.get(`${this.CAPTURE_KEY}${captureId}`);
      if (!captureData) return { retry: false, reason: 'Capture expired' };
      
      const capture = JSON.parse(captureData);
      capture.retries = (capture.retries || 0) + 1;
      
      if (capture.retries < this.RETRY_MAX) {
        // Allow retry
        capture.status = 'waiting_for_host';
        capture.lastError = reason;
        
        await redisClient.set(
          `${this.CAPTURE_KEY}${captureId}`,
          JSON.stringify(capture),
          { EX: this.CAPTURE_TTL }
        );
        
        return { retry: true, retryCount: capture.retries, momentId: capture.momentId };
      }
      
      // Max retries exceeded — fail the moment
      await Moment.findByIdAndUpdate(capture.momentId, {
        status: 'failed',
        errorMessage: `Capture failed after ${capture.retries} attempts: ${reason}`
      });
      
      await redisClient.del(`${this.CAPTURE_KEY}${captureId}`);
      
      return { retry: false, reason: 'Max retries exceeded', momentId: capture.momentId };
      
    } catch (error) {
      console.error('Handle capture failed error:', error);
      return { retry: false, reason: error.message };
    }
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

  /**
   * Check if there's an active capture for a room (prevent concurrent captures)
   */
  async hasActiveCapture(roomCode) {
    // Scan for any capture keys for this room
    // We store roomCode in capture data, so we need to check
    try {
      const pattern = `${this.CAPTURE_KEY}*`;
      let cursor = '0';
      
      do {
        const result = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 20 });
        cursor = result.cursor.toString();
        
        for (const key of result.keys) {
          const data = await redisClient.get(key);
          if (data) {
            const capture = JSON.parse(data);
            if (capture.roomCode === roomCode && 
                ['waiting_for_host', 'recording'].includes(capture.status)) {
              return { active: true, captureId: capture.captureId };
            }
          }
        }
      } while (cursor !== '0');
      
      return { active: false };
    } catch (error) {
      console.error('Check active capture error:', error);
      return { active: false };
    }
  }
}

module.exports = new CaptureService();