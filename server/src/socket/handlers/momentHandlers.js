const momentService = require('../../services/momentService');
const captureService = require('../../services/captureService');
const { socketRateLimiter } = require('../middleware/rateLimiter');
const Room = require('../../models/mongodb/Room');

module.exports = (socket, io) => {

  // ─── Helper: Find host socket in a room ───
  const getHostSocket = async (roomCode) => {
    const room = await Room.findOne({ roomCode }).select('hostId').lean();
    if (!room) return null;

    const roomSockets = await io.in(roomCode).fetchSockets();
    return roomSockets.find(s => s.userId === room.hostId) || null;
  };

  // ─── Helper: Emit capture request to host only ───
  const requestHostCapture = async (roomCode, momentData) => {
    const hostSocket = await getHostSocket(roomCode);
    if (!hostSocket) {
      return false;
    }

    // Check for concurrent capture in this room
    const activeCheck = await captureService.hasActiveCapture(roomCode);
    if (activeCheck.active) {
      return false;
    }

    // Initialize capture state
    await captureService.initializeCapture(
      momentData.momentId.toString(),
      roomCode,
      hostSocket.userId,
      momentData.captureJobId
    );

    // Send capture request ONLY to the host
    hostSocket.emit('moment:capture-request', {
      momentId: momentData.momentId,
      captureJobId: momentData.captureJobId,
      roomCode,
      timestamp: momentData.timestamp,
      clipRange: momentData.clipRange,
      duration: momentData.duration,
      intensity: momentData.intensity,
    });

    return true;
  };

  // ─── Helper: Handle detected moment (broadcast + optional capture) ───
  const handleDetectedMoment = async (roomCode, result) => {
    if (!result.detected || !result.moment) return;

    // Check if limit was reached
    if (result.limitReached) {
      // Notify only the host to delete an existing moment
      const hostSocket = await getHostSocket(roomCode);
      if (hostSocket) {
        hostSocket.emit('moment:limit-reached', {
          momentType: result.momentType,
          currentCount: result.currentCount,
          maxAllowed: result.maxAllowed,
          message: `${result.momentType} limit reached (${result.currentCount}/${result.maxAllowed}). Delete an existing moment to add a new one.`
        });
      }
      return;
    }

    // Broadcast moment detected to all in room
    io.to(roomCode).emit('moment:detected', {
      momentId: result.moment._id,
      type: result.moment.type,
      timestamp: result.moment.timestamp,
      clipRange: result.moment.clipRange,
      intensity: result.moment.intensity,
    });

    // If high intensity, request capture from host
    if (result.captureJobId) {
      const captureRequested = await requestHostCapture(roomCode, {
        momentId: result.moment._id,
        captureJobId: result.captureJobId,
        timestamp: result.moment.timestamp,
        clipRange: result.moment.clipRange,
        duration: result.moment.duration,
        intensity: result.moment.intensity,
      });

      if (captureRequested) {
        io.to(roomCode).emit('moment:capture-start', {
          momentId: result.moment._id,
          captureJobId: result.captureJobId,
          timestamp: result.moment.timestamp,
          duration: result.moment.duration,
          intensity: result.moment.intensity,
        });
      }
    }
  };

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
        if (socket.roomCode !== roomCode) {
          return callback?.({ success: false, error: 'Not in this room' });
        }
        
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
        
        // Handle detected moment (broadcast + capture)
        await handleDetectedMoment(roomCode, result);
        
        callback?.({
          success: true,
          detected: result.detected,
          count: result.count,
          intensity: result.intensity,
          limitReached: result.limitReached || false,
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
        
        await handleDetectedMoment(roomCode, result);
        
        callback?.({
          success: true,
          detected: result.detected,
          count: result.count,
          intensity: result.intensity,
          limitReached: result.limitReached || false,
        });
        
      } catch (error) {
        console.error('Moment comment error:', error);
        callback?.({ success: false, error: error.message });
      }
    });
  });

  /**
   * Add bookmark (manual moment) — with overlap merge + limits
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
      
      const result = await momentService.addBookmark(
        roomCode,
        socket.userId,
        videoTimestamp,
        note,
        socket.isGuest ? 'Guest' : socket.username
      );
      
      const moment = result.moment;

      if (result.merged) {
        // Merged with existing — notify all users of updated moment
        io.to(roomCode).emit('moment:updated', {
          momentId: moment._id,
          type: 'bookmark',
          timestamp: moment.timestamp,
          clipRange: moment.clipRange,
          duration: moment.duration,
          merged: true,
          message: 'Bookmark merged with nearby moment'
        });
      } else {
        // New moment — broadcast
        io.to(roomCode).emit('moment:detected', {
          momentId: moment._id,
          type: 'bookmark',
          timestamp: moment.timestamp,
          clipRange: moment.clipRange,
          intensity: moment.intensity,
          userId: socket.userId
        });

        // Request capture from host for new bookmarks
        const captureJobId = moment.captureJobId;
        if (captureJobId) {
          const captureRequested = await requestHostCapture(roomCode, {
            momentId: moment._id,
            captureJobId,
            timestamp: moment.timestamp,
            clipRange: moment.clipRange,
            duration: moment.duration,
            intensity: moment.intensity,
          });

          if (captureRequested) {
            io.to(roomCode).emit('moment:capture-start', {
              momentId: moment._id,
              captureJobId,
              timestamp: moment.timestamp,
              duration: moment.duration,
              intensity: moment.intensity,
            });
          }
        }
      }
      
      callback?.({ success: true, moment, merged: result.merged });
      
    } catch (error) {
      console.error('Moment bookmark error:', error);
      
      if (error.limitReached) {
        callback?.({ 
          success: false, 
          error: 'Bookmark limit reached',
          limitReached: true,
          ...error.details 
        });
      } else {
        callback?.({ success: false, error: error.message });
      }
    }
  });

  /**
   * Host confirms capture started (recording in progress)
   */
  socket.on('moment:capture-started', async ({ captureJobId }, callback) => {
    try {
      await captureService.markCaptureStarted(captureJobId);
      callback?.({ success: true });
    } catch (error) {
      console.error('Capture started error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Host completes capture — provides Cloudinary video data
   */
  socket.on('moment:capture-complete', async ({
    momentId,
    captureJobId,
    videoData
  }, callback) => {
    try {
      if (!videoData?.url && !videoData?.secure_url) {
        return callback?.({ success: false, error: 'Missing video URL' });
      }

      // Host-only enforcement: verify this socket is the room host
      if (socket.roomCode) {
        const room = await Room.findOne({ roomCode: socket.roomCode }).select('hostId').lean();
        if (room && room.hostId !== socket.userId) {
          return callback?.({ success: false, error: 'Only the host can submit captured moments' });
        }
      }

      const moment = await captureService.completeCapture(captureJobId, videoData);
      
      // Broadcast ready event to all in room
      io.to(moment.roomCode).emit('moment:ready', {
        momentId: moment._id,
        type: moment.type,
        timestamp: moment.timestamp,
        clipRange: moment.clipRange,
        thumbnail: moment.capturedVideo?.thumbnailUrl,
        videoUrl: moment.capturedVideo?.url,
        duration: moment.capturedVideo?.duration,
      });
      
      callback?.({ success: true, moment });
      
    } catch (error) {
      console.error('Capture complete error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Host reports capture failed — retry or fail
   */
  socket.on('moment:capture-failed', async ({
    captureJobId,
    reason
  }, callback) => {
    try {
      const result = await captureService.handleCaptureFailed(captureJobId, reason || 'Unknown error');
      
      if (result.retry) {
        // Re-send capture request to host
        const captureState = await captureService.getCaptureStatus(captureJobId);
        if (captureState) {
          socket.emit('moment:capture-request', {
            momentId: captureState.momentId,
            captureJobId,
            roomCode: captureState.roomCode,
            retry: true,
            retryCount: result.retryCount,
          });
        }
      } else {
        // Notify room that capture failed  
        if (socket.roomCode) {
          io.to(socket.roomCode).emit('moment:capture-error', {
            captureJobId,
            reason: result.reason,
          });
        }
      }
      
      callback?.({ success: true, retry: result.retry });
      
    } catch (error) {
      console.error('Capture failed handler error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Legacy upload path — kept for backward compatibility.
   * New flow uses moment:capture-complete instead.
   */
  socket.on('moment:upload', async ({
    momentId,
    captureJobId,
    videoData
  }, callback) => {
    try {
      await momentService.validateCaptureUpload(momentId, captureJobId, socket.userId);
      
      const moment = await momentService.processUploadedMoment(
        momentId,
        captureJobId,
        videoData
      );
      
      io.to(moment.roomCode).emit('moment:ready', {
        momentId: moment._id,
        thumbnail: moment.capturedVideo?.thumbnailUrl,
        videoUrl: moment.capturedVideo?.url,
      });
      
      callback?.({ success: true, moment });
      
    } catch (error) {
      console.error('Moment upload error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Delete a moment (host or creator)
   */
  socket.on('moment:delete', async ({ roomCode, momentId }, callback) => {
    try {
      const result = await momentService.deleteMoment(momentId, socket.userId);
      
      // Broadcast deletion to room
      io.to(roomCode || socket.roomCode).emit('moment:deleted', {
        momentId,
        deletedBy: socket.userId,
      });

      // If has Cloudinary public ID, queue for cleanup
      if (result.deletedPublicId) {
        const mediaCleanupService = require('../../services/mediaCleanupService');
        await mediaCleanupService.enqueue(result.deletedPublicId, 'video', 'moment-deleted');
      }
      
      callback?.({ success: true });
      
    } catch (error) {
      console.error('Moment delete error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * User starts watching a moment (independent playback, skip sync)
   */
  socket.on('moment:watch-start', async ({ roomCode, momentId }, callback) => {
    try {
      await momentService.setUserWatchingMoment(socket.userId, roomCode, momentId);
      
      // Increment view count
      await momentService.getMomentById(momentId);
      
      callback?.({ success: true });
      
    } catch (error) {
      console.error('Watch start error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * User finishes watching a moment — resync with group
   */
  socket.on('moment:watch-end', async ({ roomCode }, callback) => {
    try {
      await momentService.clearUserWatchingMoment(socket.userId, roomCode);
      
      // Get current sync state for resync
      const syncService = require('../../services/syncService');
      const syncState = await syncService.getSyncState(roomCode);
      
      callback?.({ 
        success: true, 
        resync: true,
        syncState: syncState || null,
      });
      
    } catch (error) {
      console.error('Watch end error:', error);
      callback?.({ success: false, error: error.message });
    }
  });

  /**
   * Get moments for room
   */
  socket.on('moment:get-room-moments', async ({ roomCode }, callback) => {
    try {
      const moments = await momentService.getRoomMoments(roomCode);
      const counts = await momentService.getRoomMomentCounts(roomCode);
      callback?.({ success: true, moments, counts });
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

  /**
   * Get moment counts for limit display
   */
  socket.on('moment:get-counts', async ({ roomCode }, callback) => {
    try {
      const counts = await momentService.getRoomMomentCounts(roomCode);
      callback?.({ success: true, counts });
    } catch (error) {
      console.error('Get moment counts error:', error);
      callback?.({ success: false, error: error.message });
    }
  });
};