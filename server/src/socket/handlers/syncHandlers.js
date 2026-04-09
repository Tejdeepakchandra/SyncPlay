const syncService = require('../../services/syncService');
const roomService = require('../../services/roomService');
const analyticsService = require('../../services/analyticsService');
const Room = require('../../models/mongodb/Room');
const { socketRateLimiter } = require('../middleware/rateLimiter');

// Lightweight runtime state for legacy sync:broadcast compatibility.
const roomRuntimeSyncState = new Map();


 // Check if user has permission
 
async function checkPermission(roomCode, userId, permission) {
  const room = await Room.findOne({ roomCode });
  if (!room) return false;
  
  const participant = room.participants.find(p => p.userId.toString() === userId.toString());
  if (!participant) return false;
  
  // Host and co-host have all permissions
  if (participant.role === 'host' || participant.role === 'cohost') return true;
  
  return participant.permissions[permission] || false;
}


 // Check room status
 
async function checkRoomActive(roomCode) {
  const room = await Room.findOne({ roomCode });
  return room?.status === 'active';
}

 // Validate timestamp against duration
 
function validateTimestamp(timestamp, duration) {
  if (duration && (timestamp < 0 || timestamp > duration)) {
    return false;
  }
  return true;
}

module.exports = (socket, io) => {
  
  
   // NTP-style clock sync with multiple samples, taking best offset because of asymmetric network delay.
   
  socket.on('sync:clock-sync', async ({ samples }, callback) => {
    try {
      const results = [];
      
      for (const sample of samples) {
        const offset = ((sample.t2 - sample.t1) + (sample.t3 - sample.t4)) / 2;
        const delay = (sample.t4 - sample.t1) - (sample.t3 - sample.t2);
        results.push({ offset, delay });
      }
      
      // Best sample = lowest delay
      const bestSample = results.reduce((best, current) => 
        current.delay < best.delay ? current : best
      );
      
      callback({
        success: true,
        offset: bestSample.offset,
        delay: bestSample.delay,
        serverTime: Date.now()
      });

    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  // Legacy client compatibility layer used by MovieRoom/MusicRoom hooks.
  // Keeps media propagation and basic play/pause/seek broadcasts functional.
  socket.on('sync:broadcast', async ({ roomCode, event, media, timestamp, time }, callback = () => {}) => {
    try {
      if (!roomCode || !event) {
        callback({ success: false, error: 'Missing roomCode or event' });
        return;
      }

      const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
      if (!canControl) {
        callback({ success: false, error: 'Permission denied' });
        return;
      }

      const prev = roomRuntimeSyncState.get(roomCode) || {
        media: null,
        isPlaying: false,
        position: 0,
        updatedAt: Date.now(),
      };

      const next = { ...prev, updatedAt: Date.now() };

      if (event === 'media_change') {
        next.media = media || null;
        next.position = 0;
        next.isPlaying = false;
        socket.to(roomCode).emit('sync:media-change', {
          media: next.media,
          userId: socket.userId,
          timestamp: Date.now(),
        });
      } else if (event === 'play') {
        next.isPlaying = true;
        socket.to(roomCode).emit('sync:play', {
          userId: socket.userId,
          timestamp: timestamp || Date.now(),
        });
      } else if (event === 'pause') {
        next.isPlaying = false;
        socket.to(roomCode).emit('sync:pause', {
          userId: socket.userId,
          timestamp: timestamp || Date.now(),
        });
      } else if (event === 'seek') {
        if (typeof time === 'number') {
          next.position = time;
        }
        socket.to(roomCode).emit('sync:seek', {
          userId: socket.userId,
          timestamp: timestamp || Date.now(),
          time: typeof time === 'number' ? time : 0,
        });
      }

      roomRuntimeSyncState.set(roomCode, next);
      callback({ success: true });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('sync:request-state', ({ roomCode }, callback = () => {}) => {
    try {
      if (!roomCode) {
        callback({ success: false, error: 'Missing roomCode' });
        return;
      }

      const state = roomRuntimeSyncState.get(roomCode) || {
        media: null,
        isPlaying: false,
        position: 0,
        updatedAt: Date.now(),
      };

      socket.emit('sync:update', {
        timestamp: Date.now(),
        currentPlayback: {
          media: state.media,
          isPlaying: state.isPlaying,
          time: state.position,
        },
      });

      callback({ success: true, state });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  
   // Get full sync state
   
  socket.on('sync:get-state', async ({ roomCode }, callback) => {
    try {
      const state = await syncService.getSyncState(roomCode);
      callback({ success: true, state });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  
   // Play event
   
  socket.on('sync:play', async ({ roomCode, timestamp, latency, duration, clientVersion }, callback) => {
    // Apply rate limiting
    socketRateLimiter('sync:play')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        // PERMISSION CHECK
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          return callback({ success: false, error: 'Permission denied' });
        }

        // ROOM STATUS CHECK
        const isActive = await checkRoomActive(roomCode);
        if (!isActive) {
          return callback({ success: false, error: 'Room not active' });
        }

        // TIMESTAMP VALIDATION
        if (!validateTimestamp(timestamp, duration)) {
          return callback({ success: false, error: 'Invalid timestamp' });
        }

        // VERSION VALIDATION — FIXED
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          return callback({ 
            success: false, 
            error: 'Stale client',
            currentState 
          });
        }

        const result = await syncService.handlePlay(
          roomCode, 
          socket.userId, 
          timestamp,
          latency
        );

        if (result.success && result.state) {
          // Broadcast FULL state to others
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            userId: socket.userId
          });

          // Analytics
          const room = await Room.findOne({ roomCode }).select('_id');
          if (room) {
            await analyticsService.incrementSyncAction(room._id.toString(), 'play');
          }
        }

        callback(result);

      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });
  });

  
   // Pause event
   
  socket.on('sync:pause', async ({ roomCode, timestamp, duration, clientVersion }, callback) => {
    socketRateLimiter('sync:pause')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          return callback({ success: false, error: 'Permission denied' });
        }

        const isActive = await checkRoomActive(roomCode);
        if (!isActive) {
          return callback({ success: false, error: 'Room not active' });
        }

        if (!validateTimestamp(timestamp, duration)) {
          return callback({ success: false, error: 'Invalid timestamp' });
        }

        // VERSION VALIDATION — FIXED
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          return callback({ success: false, error: 'Stale client', currentState });
        }

        const result = await syncService.handlePause(roomCode, socket.userId, timestamp);

        if (result.success && result.state) {
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            userId: socket.userId
          });

          const room = await Room.findOne({ roomCode }).select('_id');
          if (room) {
            await analyticsService.incrementSyncAction(room._id.toString(), 'pause');
          }
        }

        callback(result);

      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });
  });

  
   // Seek event
   
  socket.on('sync:seek', async ({ roomCode, newTime, duration, clientVersion }, callback) => {
    socketRateLimiter('sync:seek')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          return callback({ success: false, error: 'Permission denied' });
        }

        const isActive = await checkRoomActive(roomCode);
        if (!isActive) {
          return callback({ success: false, error: 'Room not active' });
        }

        if (!validateTimestamp(newTime, duration)) {
          return callback({ success: false, error: 'Invalid seek position' });
        }

        // VERSION VALIDATION — FIXED
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          return callback({ success: false, error: 'Stale client', currentState });
        }

        const result = await syncService.handleSeek(roomCode, socket.userId, newTime, duration);

        if (result.success && result.state) {
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            userId: socket.userId
          });

          const room = await Room.findOne({ roomCode }).select('_id');
          if (room) {
            await analyticsService.incrementSyncAction(room._id.toString(), 'seek');
          }
        }

        callback(result);

      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });
  });

  
  // Rate change event
  
  socket.on('sync:rate-change', async ({ roomCode, rate, clientVersion }, callback) => {
    socketRateLimiter('sync:rate-change')(socket, async (err) => {
      if (err) return callback({ success: false, error: err.message });
      
      try {
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          return callback({ success: false, error: 'Permission denied' });
        }

        const isActive = await checkRoomActive(roomCode);
        if (!isActive) {
          return callback({ success: false, error: 'Room not active' });
        }

        if (rate < 0.5 || rate > 2.0) {
          return callback({ success: false, error: 'Invalid playback rate' });
        }

        // VERSION VALIDATION — FIXED
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          return callback({ success: false, error: 'Stale client', currentState });
        }

        const result = await syncService.handleRateChange(roomCode, socket.userId, rate);

        if (result.success && result.state) {
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            userId: socket.userId
          });
        }

        callback(result);

      } catch (error) {
        callback({ success: false, error: error.message });
      }
    });
  });

  
   // Position check (for drift correction) — FIXED DRIFT CALCULATION
   
  socket.on('sync:check-position', async ({ 
    roomCode, 
    clientPosition,  // video.currentTime in seconds
    clientNow,       // Date.now() from client
    clientOffset     // Calculated offset from clock sync
  }, callback) => {
    try {
      const state = await syncService.getSyncState(roomCode);
      const driftData = syncService.calculateClientDrift(
        state, 
        clientPosition, 
        clientNow, 
        clientOffset
      );
      
      callback({
        success: true,
        ...driftData,
        syncState: {
          version: state.version,
          isPlaying: state.isPlaying,
          playbackRate: state.playbackRate,
          baseTimestamp: state.baseTimestamp,
          startAt: state.startAt
        }
      });

    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};