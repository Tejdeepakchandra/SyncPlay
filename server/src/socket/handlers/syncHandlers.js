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

  // Host moderation can explicitly disable media controls per participant.
  if (permission === 'canControl' && participant.restrictions?.mediaControlDisabledByHost) {
    return false;
  }

  // Media controls are enabled by default for everyone in-room unless restricted.
  if (permission === 'canControl') {
    return true;
  }
  
  // Host and co-host have all permissions
  if (participant.role === 'host' || participant.role === 'cohost' || participant.role === 'co-host') return true;

  return participant.permissions?.[permission] || false;
}


 // Check room status
 
async function checkRoomActive(roomCode) {
  const room = await Room.findOne({ roomCode });
  if (!room) return false;
  return room.status !== 'ended';
}

 // Validate timestamp against duration
 
function validateTimestamp(timestamp, duration) {
  if (duration && (timestamp < 0 || timestamp > duration)) {
    return false;
  }
  return true;
}

function computeCurrentTimeFromState(syncState) {
  if (!syncState) return 0;
  if (!syncState.isPlaying || !syncState.startAt) {
    return Number(syncState.baseTimestamp) || 0;
  }
  const now = Date.now();
  const elapsed = Math.max(0, (now - syncState.startAt) / 1000);
  const base = Number(syncState.baseTimestamp) || 0;
  const rate = Number(syncState.playbackRate) || 1;
  return base + elapsed * rate;
}

function getMediaSignature(media) {
  if (!media) return 'none';
  return `${media.type || 'none'}:${media.videoId || media.videoUrl || media.id || media.url || ''}`;
}

function mapRuntimeMediaToRoomMedia(media) {
  if (!media || media.type === 'none') return null;

  const source = media.type === 'screen' ? 'screen' : media.type;
  return {
    source,
    url: media.videoUrl || media.url || null,
    title: media.title || null,
    thumbnail: media.thumbnail || null,
    duration: Number.isFinite(media.duration) ? media.duration : null,
    metadata: {
      ...media,
      type: media.type || source,
      videoId: media.videoId || null,
    },
  };
}

module.exports = (socket, io) => {
  const buildCurrentPlayback = async (roomCode, syncStateOverride = null) => {
    const syncState = syncStateOverride || await syncService.getSyncState(roomCode);
    const runtime = roomRuntimeSyncState.get(roomCode) || {};
    const runtimeTime = Number.isFinite(runtime.position) ? runtime.position : null;
    const runtimeIsPlaying = typeof runtime.isPlaying === 'boolean' ? runtime.isPlaying : null;
    const isPlaying = runtimeIsPlaying ?? !!syncState.isPlaying;

    return {
      media: runtime.media || null,
      isPlaying,
      // While playing, always derive current time from authoritative timeline.
      time: isPlaying ? computeCurrentTimeFromState(syncState) : (runtimeTime ?? computeCurrentTimeFromState(syncState)),
      playbackRate: syncState.playbackRate || 1,
      version: syncState.version || 0,
      startAt: syncState.startAt || null,
      updatedAt: syncState.lastUpdated || Date.now(),
    };
  };
  
  
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

  // Legacy sync path disabled in development cutover; advanced events are authoritative.
  socket.on('sync:broadcast', async ({ roomCode, event, media, timestamp, time }, callback = () => {}) => {
    callback({
      success: false,
      error: 'Legacy sync:broadcast is disabled. Use sync:media-change / sync:play / sync:pause / sync:seek.',
    });
  });

  socket.on('sync:media-change', async ({ roomCode, media }, callback = () => {}) => {
    try {
      if (!roomCode || !media) {
        callback({ success: false, error: 'Missing roomCode or media' });
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

      const now = Date.now();
      const prevSig = getMediaSignature(prev.media);
      const nextSig = getMediaSignature(media);
      const isDuplicateRapid = prevSig === nextSig && now - (prev.updatedAt || 0) < 500;
      if (isDuplicateRapid) {
        const currentPlayback = await buildCurrentPlayback(roomCode);
        callback({ success: true, duplicate: true, currentPlayback });
        return;
      }

      roomRuntimeSyncState.set(roomCode, {
        ...prev,
        media,
        isPlaying: false,
        position: 0,
        updatedAt: now,
      });

      let roomDoc = null;
      if (typeof Room.findOneAndUpdate === 'function') {
        roomDoc = await Room.findOneAndUpdate(
          { roomCode },
          {
            $set: {
              'media.current': mapRuntimeMediaToRoomMedia(media),
              status: 'active',
              'syncState.isPlaying': false,
              'syncState.baseTimestamp': 0,
              'syncState.currentTime': 0,
              'syncState.startAt': null,
              'syncState.lastUpdated': new Date(now),
              'syncState.updatedBy': socket.userId,
            },
          },
          { new: false }
        );
      } else {
        roomDoc = await Room.findOne({ roomCode }).select('_id');
      }

      if (roomDoc && typeof analyticsService.logRoomEvent === 'function') {
        await analyticsService.logRoomEvent(
          roomDoc._id.toString(),
          'sync_media_change',
          socket.userId,
          { mediaType: media?.type || 'none' }
        );
      }

      socket.to(roomCode).emit('sync:media-change', {
        media,
        userId: socket.userId,
        timestamp: now,
      });

      const currentPlayback = await buildCurrentPlayback(roomCode);
      socket.to(roomCode).emit('sync:update', {
        timestamp: now,
        currentPlayback,
      });

      callback({ success: true, currentPlayback });
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

      buildCurrentPlayback(roomCode).then((currentPlayback) => {
        socket.emit('sync:update', {
          timestamp: Date.now(),
          currentPlayback,
        });

        callback({ success: true, state: currentPlayback });
      }).catch((error) => {
        callback({ success: false, error: error.message });
      });
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
      if (err) {
        syncService.recordControlTelemetry(roomCode, 'play', 'rate_limited');
        return callback({ success: false, error: err.message });
      }
      
      try {
        // PERMISSION CHECK
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          syncService.recordControlTelemetry(roomCode, 'play', 'permission_denied');
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
          syncService.recordControlTelemetry(roomCode, 'play', 'stale');
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
          syncService.recordControlTelemetry(roomCode, 'play', 'accepted');
          const prev = roomRuntimeSyncState.get(roomCode) || {
            media: null,
            isPlaying: false,
            position: 0,
            updatedAt: Date.now(),
          };
          roomRuntimeSyncState.set(roomCode, {
            ...prev,
            isPlaying: true,
            position: computeCurrentTimeFromState(result.state),
            updatedAt: Date.now(),
          });

          // Broadcast FULL state to others
          const runtimeMedia = (roomRuntimeSyncState.get(roomCode) || {}).media || null;
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            media: runtimeMedia,
            userId: socket.userId
          });

          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          socket.to(roomCode).emit('sync:update', {
            timestamp: Date.now(),
            currentPlayback,
          });

          // Analytics
          const room = await Room.findOne({ roomCode }).select('_id');
          if (room) {
            await analyticsService.incrementSyncAction(room._id.toString(), 'play');
            if (typeof analyticsService.logRoomEvent === 'function') {
              await analyticsService.logRoomEvent(room._id.toString(), 'sync_play', socket.userId, {
                timestamp,
                latency,
                version: result.state.version,
              });
            }
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
      if (err) {
        syncService.recordControlTelemetry(roomCode, 'pause', 'rate_limited');
        return callback({ success: false, error: err.message });
      }
      
      try {
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          syncService.recordControlTelemetry(roomCode, 'pause', 'permission_denied');
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
          syncService.recordControlTelemetry(roomCode, 'pause', 'stale');
          return callback({ success: false, error: 'Stale client', currentState });
        }

        const result = await syncService.handlePause(roomCode, socket.userId, timestamp);

        if (result.success && result.state) {
          syncService.recordControlTelemetry(roomCode, 'pause', 'accepted');
          const prev = roomRuntimeSyncState.get(roomCode) || {
            media: null,
            isPlaying: false,
            position: 0,
            updatedAt: Date.now(),
          };
          roomRuntimeSyncState.set(roomCode, {
            ...prev,
            isPlaying: false,
            position: computeCurrentTimeFromState(result.state),
            updatedAt: Date.now(),
          });

          const runtimeMedia = (roomRuntimeSyncState.get(roomCode) || {}).media || null;
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            media: runtimeMedia,
            userId: socket.userId
          });

          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          socket.to(roomCode).emit('sync:update', {
            timestamp: Date.now(),
            currentPlayback,
          });

          const room = await Room.findOne({ roomCode }).select('_id');
          if (room) {
            await analyticsService.incrementSyncAction(room._id.toString(), 'pause');
            if (typeof analyticsService.logRoomEvent === 'function') {
              await analyticsService.logRoomEvent(room._id.toString(), 'sync_pause', socket.userId, {
                timestamp,
                version: result.state.version,
              });
            }
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
      if (err) {
        syncService.recordControlTelemetry(roomCode, 'seek', 'rate_limited');
        return callback({ success: false, error: err.message });
      }
      
      try {
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          syncService.recordControlTelemetry(roomCode, 'seek', 'permission_denied');
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
          syncService.recordControlTelemetry(roomCode, 'seek', 'stale');
          return callback({ success: false, error: 'Stale client', currentState });
        }

        const result = await syncService.handleSeek(roomCode, socket.userId, newTime, duration);

        if (result.success && result.state) {
          syncService.recordControlTelemetry(roomCode, 'seek', 'accepted');
          const prev = roomRuntimeSyncState.get(roomCode) || {
            media: null,
            isPlaying: false,
            position: 0,
            updatedAt: Date.now(),
          };
          roomRuntimeSyncState.set(roomCode, {
            ...prev,
            position: computeCurrentTimeFromState(result.state),
            updatedAt: Date.now(),
          });

          const runtimeMedia = (roomRuntimeSyncState.get(roomCode) || {}).media || null;
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            media: runtimeMedia,
            userId: socket.userId
          });

          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          socket.to(roomCode).emit('sync:update', {
            timestamp: Date.now(),
            currentPlayback,
          });

          const room = await Room.findOne({ roomCode }).select('_id');
          if (room) {
            await analyticsService.incrementSyncAction(room._id.toString(), 'seek');
            if (typeof analyticsService.logRoomEvent === 'function') {
              await analyticsService.logRoomEvent(room._id.toString(), 'sync_seek', socket.userId, {
                newTime,
                version: result.state.version,
              });
            }
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
      if (err) {
        syncService.recordControlTelemetry(roomCode, 'rate_change', 'rate_limited');
        return callback({ success: false, error: err.message });
      }
      
      try {
        const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canControl) {
          syncService.recordControlTelemetry(roomCode, 'rate_change', 'permission_denied');
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
          syncService.recordControlTelemetry(roomCode, 'rate_change', 'stale');
          return callback({ success: false, error: 'Stale client', currentState });
        }

        const result = await syncService.handleRateChange(roomCode, socket.userId, rate);

        if (result.success && result.state) {
          syncService.recordControlTelemetry(roomCode, 'rate_change', 'accepted');
          const prev = roomRuntimeSyncState.get(roomCode) || {
            media: null,
            isPlaying: false,
            position: 0,
            updatedAt: Date.now(),
          };
          roomRuntimeSyncState.set(roomCode, {
            ...prev,
            position: computeCurrentTimeFromState(result.state),
            updatedAt: Date.now(),
          });

          const runtimeMedia = (roomRuntimeSyncState.get(roomCode) || {}).media || null;
          socket.to(roomCode).emit('sync:state-update', {
            state: result.state,
            media: runtimeMedia,
            userId: socket.userId
          });

          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          socket.to(roomCode).emit('sync:update', {
            timestamp: Date.now(),
            currentPlayback,
          });

          const room = await Room.findOne({ roomCode }).select('_id');
          if (room && typeof analyticsService.logRoomEvent === 'function') {
            await analyticsService.logRoomEvent(room._id.toString(), 'sync_rate_change', socket.userId, {
              rate,
              version: result.state.version,
            });
          }
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
        clientOffset,
        roomCode
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

  socket.on('sync:get-telemetry', async ({ roomCode }, callback = () => {}) => {
    try {
      if (!roomCode) {
        callback({ success: false, error: 'Missing roomCode' });
        return;
      }

      const telemetry = syncService.getDriftTelemetry(roomCode);
      const controlTelemetry = syncService.getControlTelemetry(roomCode);
      callback({ success: true, telemetry, controlTelemetry });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });

  socket.on('sync:reset-telemetry', async ({ roomCode }, callback = () => {}) => {
    try {
      if (!roomCode) {
        callback({ success: false, error: 'Missing roomCode' });
        return;
      }

      const room = await Room.findOne({ roomCode });
      const participant = room?.participants?.find((p) => p.userId.toString() === socket.userId.toString());
      const isModerator = room?.hostId?.toString() === socket.userId.toString() ||
        participant?.role === 'host' ||
        participant?.role === 'co-host' || participant?.role === 'cohost';
      if (!isModerator) {
        callback({ success: false, error: 'Permission denied' });
        return;
      }

      const reset = syncService.resetDriftTelemetry(roomCode);
      const controlReset = syncService.resetControlTelemetry(roomCode);
      callback({ success: true, reset, controlReset });
    } catch (error) {
      callback({ success: false, error: error.message });
    }
  });
};