const momentService = require('../../services/momentService');
const captureService = require('../../services/captureService');
const { socketRateLimiter } = require('../middleware/rateLimiter');
const Room = require('../../models/mongodb/Room');

module.exports = (socket, io) => {
  
  /**
   * Add reaction (could trigger moment)
   */
  socket.on('moment:reaction', async ({ 
    roomCode, 
    reaction, 
    videoTimestamp 
  }, callback) => {
    socketRateLimiter('moment:reaction')(socket, async (err) => {
      if (err) return callback?.({ success: false, error: err.message });
      
      try {
        // Verify user is in this room
        if (socket.roomCode !== roomCode) {
          return callback?.({ success: false, error: 'Not in this room' });
        }
        
        // Check if room exists
        const room = await Room.findOne({ roomCode });
        if (!room) {
          return callback?.({ success: false, error: 'Room not found' });
        }
        
        // Process reaction for moment detection
        const result = await momentService.addReaction(
          roomCode,
          socket.userId,
          reaction,
          videoTimestamp,
          socket.isGuest ? 'Guest' : socket.username
        );
        
        // Broadcast reaction to room for real-time UI
        socket.to(roomCode).emit('moment:reaction-broadcast', {
          userId: socket.userId,
          reaction,
          videoTimestamp,
          isGuest: socket.isGuest
        });
        
        // If moment was detected, broadcast it from HANDLER
        if (result.detected && result.moment) {
          io.to(roomCode).emit('moment:detected', {
            momentId: result.moment._id,
            type: result.moment.type,
            timestamp: result.moment.timestamp,
            intensity: result.moment.intensity
          });
          
          // If high intensity, trigger capture from HANDLER
          if (result.captureJobId) {
            io.to(roomCode).emit('moment:capture-start', {
              momentId: result.moment._id,
              captureJobId: result.captureJobId,
              timestamp: result.moment.timestamp,
              duration: result.moment.duration,
              intensity: result.moment.intensity
            });
          }
        }
        
        callback?.({
          success: true,
          detected: result.detected,
          count: result.count,
          intensity: result.intensity
        });
        
      } catch (error) {
        console.error('Moment reaction error:', error);
        callback?.({ success: false, error: error.message });
      }
    });
  });

  /**
   * Add comment (could trigger moment)
   */
  socket.on('moment:comment', async ({ 
    roomCode, 
    text, 
    videoTimestamp 
  }, callback) => {
    socketRateLimiter('moment:comment')(socket, async (err) => {
      if (err) return callback?.({ success: false, error: err.message });
      
      try {
        if (socket.roomCode !== roomCode) {
          return callback?.({ success: false, error: 'Not in this room' });
        }
        
        const room = await Room.findOne({ roomCode });
        if (!room) {
          return callback?.({ success: false, error: 'Room not found' });
        }
        
        const result = await momentService.addComment(
          roomCode,
          socket.userId,
          text,
          videoTimestamp,
          socket.isGuest ? 'Guest' : socket.username
        );
        
        socket.to(roomCode).emit('moment:comment-broadcast', {
          userId: socket.userId,
          text,
          videoTimestamp,
          isGuest: socket.isGuest
        });
        
        if (result.detected && result.moment) {
          io.to(roomCode).emit('moment:detected', {
            momentId: result.moment._id,
            type: result.moment.type,
            timestamp: result.moment.timestamp,
            intensity: result.moment.intensity
          });
        }
        
        callback?.({
          success: true,
          detected: result.detected,
          count: result.count,
          intensity: result.intensity
        });
        
      } catch (error) {
        console.error('Moment comment error:', error);
        callback?.({ success: false, error: error.message });
      }
    });
  });

  /**
   * Add bookmark (manual moment)
   */
  socket.on('moment:bookmark', async ({ 
    roomCode, 
    videoTimestamp, 
    note 
  }, callback) => {
    try {
      if (socket.roomCode !== roomCode) {
        return callback?.({ success: false, error: 'Not in this room' });
      }
      
      const room = await Room.findOne({ roomCode });
      if (!room) {
        return callback?.({ success: false, error: 'Room not found' });
      }
      
      const moment = await momentService.addBookmark(
        roomCode,
        socket.userId,
        videoTimestamp,
        note,
        socket.isGuest ? 'Guest' : socket.username
      );
      
      // Broadcast to all
      io.to(roomCode).emit('moment:detected', {
        momentId: moment._id,
        type: 'bookmark',
        timestamp: moment.timestamp,
        intensity: moment.intensity,
        userId: socket.userId
      });
      
      callback?.({ success: true, moment });
      
    } catch (error) {
      console.error('Moment bookmark error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Upload captured moment — with validation
   */
  socket.on('moment:upload', async ({
    momentId,
    captureJobId,
    videoData
  }, callback) => {
    try {
      // Validate user can upload for this moment
      await momentService.validateCaptureUpload(momentId, captureJobId, socket.userId);
      
      const moment = await momentService.processUploadedMoment(
        momentId,
        captureJobId,
        videoData
      );
      
      // Only emit ready event after successful processing
      io.to(moment.roomCode).emit('moment:ready', {
        momentId: moment._id,
        thumbnail: moment.capturedVideo?.thumbnailUrl
      });
      
      callback?.({ success: true, moment });
      
    } catch (error) {
      console.error('Moment upload error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Get moments for room
   */
  socket.on('moment:get-room-moments', async ({ roomCode }, callback) => {
    try {
      const moments = await momentService.getRoomMoments(roomCode);
      callback?.({ success: true, moments });
    } catch (error) {
      console.error('Get room moments error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Get moment by ID
   */
  socket.on('moment:get', async ({ momentId }, callback) => {
    try {
      const moment = await momentService.getMomentById(momentId);
      callback?.({ success: true, moment });
    } catch (error) {
      console.error('Get moment error:', error);
      callback?.({ success: false, error: error.message });
    }
  });
};