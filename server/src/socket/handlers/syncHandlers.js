const syncService = require('../../services/syncService');
const roomService = require('../../services/roomService');
const analyticsService = require('../../services/analyticsService');
const Room = require('../../models/mongodb/Room');
const { socketRateLimiter } = require('../middleware/rateLimiter');

const recentMediaChangeByRoom = new Map();
const pendingSeekByRoom = new Map();

// Short-lived room cache (2s) to avoid repeated MongoDB queries per event
const roomDocCache = new Map();
const ROOM_CACHE_TTL_MS = 2000;

function normalizeRoomCode(roomCode) {
  return String(roomCode || '').trim().toUpperCase();
}

async function getCachedRoomDoc(roomCode) {
  const nrc = normalizeRoomCode(roomCode);
  if (!nrc) return null;
  const cached = roomDocCache.get(nrc);
  if (cached && Date.now() - cached.at < ROOM_CACHE_TTL_MS) return cached.doc;
  const doc = await Room.findOne({ roomCode: nrc }).select('participants status hostId coHosts').lean();
  roomDocCache.set(nrc, { doc, at: Date.now() });
  return doc;
}

async function checkPermission(roomCode, userId, permission) {
  const room = await getCachedRoomDoc(roomCode);
  if (!room) return false;
  const participant = room.participants.find(p => p.userId.toString() === userId.toString());
  if (!participant) return false;
  if (permission === 'canControl' && participant.restrictions?.mediaControlDisabledByHost) return false;
  if (permission === 'canControl') return true;
  if (participant.role === 'host' || participant.role === 'cohost' || participant.role === 'co-host') return true;
  return participant.permissions?.[permission] || false;
}

async function checkRoomActive(roomCode) {
  const room = await getCachedRoomDoc(roomCode);
  if (!room) return false;
  return room.status !== 'ended';
}

function validateTimestamp(timestamp, duration) {
  if (!Number.isFinite(timestamp)) return false;
  if (duration && (timestamp < 0 || timestamp > duration)) return false;
  return true;
}

function computeCurrentTimeFromState(syncState) {
  if (!syncState) return 0;
  if (!syncState.isPlaying || !syncState.startAt) return Number(syncState.baseTimestamp) || 0;
  const now = Date.now();
  const elapsed = Math.max(0, (now - syncState.startAt) / 1000);
  return (Number(syncState.baseTimestamp) || 0) + elapsed * (Number(syncState.playbackRate) || 1);
}

function getMediaSignature(media) {
  if (!media) return 'none';
  return `${media.type || 'none'}:${media.videoId || media.videoUrl || media.id || media.url || ''}`;
}

function extractYoutubeVideoId(rawUrl) {
  if (!rawUrl) return null;
  const url = String(rawUrl);
  const watchMatch = url.match(/[?&]v=([^&]+)/);
  const shortMatch = url.match(/youtu\.be\/([^?&/]+)/);
  const embedMatch = url.match(/\/embed\/([^?&/]+)/);
  return watchMatch?.[1] || shortMatch?.[1] || embedMatch?.[1] || null;
}

function mapRuntimeMediaToRoomMedia(media) {
  if (!media || media.type === 'none') return null;
  const source = media.type === 'screen' ? 'screen' : (media.type === 'local' ? 'upload' : media.type);
  const rawUrl = media.videoUrl || media.url || null;
  const derivedVideoId = (media.type === 'youtube' || source === 'youtube')
    ? (media.videoId || extractYoutubeVideoId(rawUrl))
    : (media.videoId || null);
  return {
    source, url: rawUrl, title: media.title || null, thumbnail: media.thumbnail || null,
    duration: Number.isFinite(media.duration) ? media.duration : null,
    metadata: { ...media, type: media.type || source, videoId: derivedVideoId },
  };
}

function mapRoomMediaToRuntimeMedia(mediaCurrent) {
  if (!mediaCurrent) return null;
  const source = mediaCurrent.metadata?.type || mediaCurrent.source || 'none';
  if (source === 'none') return null;
  return {
    type: source, videoId: mediaCurrent.metadata?.videoId || null,
    videoUrl: mediaCurrent.url || null, url: mediaCurrent.url || null,
    title: mediaCurrent.title || mediaCurrent.metadata?.title || null,
    thumbnail: mediaCurrent.thumbnail || mediaCurrent.metadata?.thumbnail || null,
    duration: Number.isFinite(mediaCurrent.duration) ? mediaCurrent.duration : undefined,
  };
}

module.exports = (socket, io) => {
  // Use io.to() to broadcast to ALL sockets in the room (including sender).
  // The client-side version guards + nativeBridgeMuted prevent the sender
  // from double-processing its own broadcasts.
  const emitToRoom = (roomCode, event, payload) => {
    const room = io.sockets.adapter.rooms.get(roomCode);
    const socketsInRoom = room ? room.size : 0;
    console.log(`[SYNC:BROADCAST] event=${event} room=${roomCode} socketsInRoom=${socketsInRoom}`);
    io.to(roomCode).emit(event, payload);
  };

  const buildCurrentPlayback = async (roomCode, syncStateOverride = null, mediaOverride = undefined) => {
    const syncState = syncStateOverride || await syncService.getSyncState(roomCode);
    const roomQuery = Room.findOne({ roomCode });
    let roomDoc = null;
    if (roomQuery && typeof roomQuery.select === 'function') {
      const selected = roomQuery.select('media.current');
      roomDoc = selected && typeof selected.lean === 'function' ? await selected.lean() : await selected;
    } else {
      roomDoc = await roomQuery;
    }
    const runtimeMedia = mediaOverride === undefined ? mapRoomMediaToRuntimeMedia(roomDoc?.media?.current) : mediaOverride;
    return {
      media: runtimeMedia,
      isPlaying: !!syncState.isPlaying,
      time: computeCurrentTimeFromState(syncState),
      playbackRate: syncState.playbackRate || 1,
      version: syncState.version || 0,
      startAt: syncState.startAt || null,
      updatedAt: syncState.lastUpdated || Date.now(),
    };
  };

  const enqueueSeekCoalesced = ({ roomCode, userId, newTime, duration, clientEventId }) => {
    return new Promise((resolve, reject) => {
      const existing = pendingSeekByRoom.get(roomCode) || { timer: null, latest: null, waiters: [] };
      existing.latest = { userId, newTime, duration, clientEventId };
      existing.waiters.push({ resolve, reject });
      if (!existing.timer) {
        existing.timer = setTimeout(async () => {
          const batch = pendingSeekByRoom.get(roomCode);
          pendingSeekByRoom.delete(roomCode);
          if (!batch?.latest) { batch?.waiters?.forEach((w) => w.resolve({ success: false, error: 'empty' })); return; }
          try {
            const result = await syncService.handleSeek(roomCode, batch.latest.userId, batch.latest.newTime, batch.latest.duration, batch.latest.clientEventId);
            batch.waiters.forEach((w) => w.resolve(result));
          } catch (error) { batch.waiters.forEach((w) => w.reject(error)); }
        }, 20);
      }
      pendingSeekByRoom.set(roomCode, existing);
    });
  };

  socket.on('sync:clock-sync', async ({ samples }, callback) => {
    try {
      const results = [];
      for (const sample of samples) {
        const offset = ((sample.t2 - sample.t1) + (sample.t3 - sample.t4)) / 2;
        const delay = (sample.t4 - sample.t1) - (sample.t3 - sample.t2);
        results.push({ offset, delay });
      }
      const bestSample = results.reduce((best, current) => current.delay < best.delay ? current : best);
      callback({ success: true, offset: bestSample.offset, delay: bestSample.delay, serverTime: Date.now() });
    } catch (error) { callback({ success: false, error: error.message }); }
  });

  socket.on('sync:broadcast', async ({ roomCode }, callback = () => {}) => {
    callback({ success: false, error: 'Legacy sync:broadcast disabled. Use sync:play/pause/seek.' });
  });

  socket.on('sync:media-change', async ({ roomCode, media }, callback = () => {}) => {
    try {
      roomCode = normalizeRoomCode(roomCode);
      if (!roomCode || !media) return callback({ success: false, error: 'Missing roomCode or media' });
      const canControl = await checkPermission(roomCode, socket.userId, 'canControl');
      if (!canControl) return callback({ success: false, error: 'Permission denied' });
      const now = Date.now();

      // Deduplicate rapid media changes
      const recent = recentMediaChangeByRoom.get(roomCode);
      const nextSig = getMediaSignature(media);
      if (recent && recent.signature === nextSig && now - recent.timestamp < 500) {
        const currentPlayback = await buildCurrentPlayback(roomCode, null, media);
        return callback({ success: true, duplicate: true, currentPlayback });
      }
      recentMediaChangeByRoom.set(roomCode, { signature: nextSig, timestamp: now });

      // Reset sync state to paused at time 0 for the new media
      const resetState = {
        isPlaying: false,
        baseTimestamp: 0,
        currentTime: 0,
        startAt: null,
        lastUpdated: now,
        updatedBy: socket.userId,
        version: (syncService.stateCache.get(roomCode)?.version || 0) + 1,
        playbackRate: 1.0,
        eventId: null,
      };

      // Update in-memory cache immediately
      syncService.stateCache.set(roomCode, resetState);

      // Persist to Redis (fire-and-forget)
      const { createRedisKey } = require('../../utils/helpers');
      const { REDIS_KEYS, CACHE_TTL } = require('../../utils/constants');
      const redisClient = require('../../config/redis');
      redisClient.set(
        createRedisKey(REDIS_KEYS.SYNC_STATE, roomCode),
        JSON.stringify(resetState),
        { EX: CACHE_TTL.SYNC_STATE }
      ).catch(() => {});

      // Persist to MongoDB (fire-and-forget)
      Room.findOneAndUpdate({ roomCode }, {
        $set: {
          'media.current': mapRuntimeMediaToRoomMedia(media), status: 'active',
          'syncState': resetState,
        },
      }).catch(err => console.error('[SYNC] Media change DB update failed:', err.message));

      // Invalidate the room doc cache so permission checks get fresh data
      roomDocCache.delete(roomCode);

      // Build currentPlayback from known data (don't re-query DB)
      const runtimeMedia = mapRoomMediaToRuntimeMedia(mapRuntimeMediaToRoomMedia(media)) || media;
      const currentPlayback = {
        media: runtimeMedia,
        isPlaying: false,
        time: 0,
        playbackRate: 1,
        version: resetState.version,
        startAt: null,
        updatedAt: now,
      };

      console.log(`[SYNC:MEDIA-CHANGE] user=${socket.userId} room=${roomCode} media=${nextSig} version=${resetState.version}`);
      emitToRoom(roomCode, 'sync:media-change', { media, userId: socket.userId, timestamp: now });
      emitToRoom(roomCode, 'sync:update', { timestamp: now, currentPlayback });
      callback({ success: true, currentPlayback });

      // Analytics (fire-and-forget)
      getCachedRoomDoc(roomCode).then(room => {
        if (room?._id && typeof analyticsService.logRoomEvent === 'function') {
          analyticsService.logRoomEvent(room._id.toString(), 'sync_media_change', socket.userId, { mediaType: media?.type || 'none' }).catch(() => {});
        }
      }).catch(() => {});
    } catch (error) { callback({ success: false, error: error.message }); }
  });

  socket.on('sync:request-state', ({ roomCode }, callback = () => {}) => {
    try {
      roomCode = normalizeRoomCode(roomCode);
      if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
      buildCurrentPlayback(roomCode).then((currentPlayback) => {
        socket.emit('sync:update', { timestamp: Date.now(), currentPlayback });
        callback({ success: true, state: currentPlayback });
      }).catch((error) => callback({ success: false, error: error.message }));
    } catch (error) { callback({ success: false, error: error.message }); }
  });

  socket.on('sync:get-state', async ({ roomCode }, callback) => {
    try {
      roomCode = normalizeRoomCode(roomCode);
      if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
      const state = await syncService.getSyncState(roomCode);
      callback({ success: true, state });
    } catch (error) { callback({ success: false, error: error.message }); }
  });

  // ═══ PLAY ═══
  socket.on('sync:play', async ({ roomCode, timestamp, latency, duration, clientVersion, clientEventId }, callback) => {
    socketRateLimiter('sync:play')(socket, async (err) => {
      if (err) { syncService.recordControlTelemetry(roomCode, 'play', 'rate_limited'); return callback({ success: false, error: err.message }); }
      try {
        roomCode = normalizeRoomCode(roomCode);
        if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
        console.log(`[SYNC:PLAY] ← user=${socket.userId} room=${roomCode} time=${timestamp} ver=${clientVersion}`);
        const canCtrl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canCtrl) { syncService.recordControlTelemetry(roomCode, 'play', 'permission_denied'); return callback({ success: false, error: 'Permission denied' }); }
        const isActive = await checkRoomActive(roomCode);
        if (!isActive) return callback({ success: false, error: 'Room not active' });
        if (!validateTimestamp(timestamp, duration)) return callback({ success: false, error: 'Invalid timestamp' });
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          syncService.recordControlTelemetry(roomCode, 'play', 'stale');
          return callback({ success: false, error: 'Stale client', currentState });
        }
        const result = await syncService.handlePlay(roomCode, socket.userId, timestamp, latency || 100, clientEventId || null);
        if (result.success && result.state) {
          console.log(`[SYNC:PLAY] ✅ Accepted room=${roomCode} version=${result.state.version} startAt=${result.state.startAt}`);
          syncService.recordControlTelemetry(roomCode, 'play', 'accepted');
          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          emitToRoom(roomCode, 'sync:state-update', { state: result.state, media: currentPlayback.media, userId: socket.userId, action: 'play' });
          emitToRoom(roomCode, 'sync:update', { timestamp: Date.now(), action: 'play', currentPlayback });
        }
        callback(result);
        // Analytics — fire-and-forget after response
        if (result.success) {
          getCachedRoomDoc(roomCode).then(room => {
            if (room?._id) analyticsService.incrementSyncAction(room._id.toString(), 'play').catch(() => {});
          }).catch(() => {});
        }
      } catch (error) { callback({ success: false, error: error.message }); }
    });
  });

  // ═══ PAUSE ═══
  socket.on('sync:pause', async ({ roomCode, timestamp, duration, clientVersion, clientEventId }, callback) => {
    socketRateLimiter('sync:pause')(socket, async (err) => {
      if (err) { syncService.recordControlTelemetry(roomCode, 'pause', 'rate_limited'); return callback({ success: false, error: err.message }); }
      try {
        roomCode = normalizeRoomCode(roomCode);
        if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
        console.log(`[SYNC:PAUSE] ← user=${socket.userId} room=${roomCode} time=${timestamp} ver=${clientVersion}`);
        const canCtrl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canCtrl) { syncService.recordControlTelemetry(roomCode, 'pause', 'permission_denied'); return callback({ success: false, error: 'Permission denied' }); }
        const isActive = await checkRoomActive(roomCode);
        if (!isActive) return callback({ success: false, error: 'Room not active' });
        if (!validateTimestamp(timestamp, duration)) return callback({ success: false, error: 'Invalid timestamp' });
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          syncService.recordControlTelemetry(roomCode, 'pause', 'stale');
          return callback({ success: false, error: 'Stale client', currentState });
        }
        const result = await syncService.handlePause(roomCode, socket.userId, timestamp, clientEventId || null);
        if (result.success && result.state) {
          console.log(`[SYNC:PAUSE] ✅ Accepted room=${roomCode} version=${result.state.version}`);
          syncService.recordControlTelemetry(roomCode, 'pause', 'accepted');
          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          emitToRoom(roomCode, 'sync:state-update', { state: result.state, media: currentPlayback.media, userId: socket.userId });
          emitToRoom(roomCode, 'sync:update', { timestamp: Date.now(), action: 'pause', currentPlayback });
        }
        callback(result);
        if (result.success) {
          getCachedRoomDoc(roomCode).then(room => {
            if (room?._id) analyticsService.incrementSyncAction(room._id.toString(), 'pause').catch(() => {});
          }).catch(() => {});
        }
      } catch (error) { callback({ success: false, error: error.message }); }
    });
  });

  // ═══ SEEK ═══
  socket.on('sync:seek', async ({ roomCode, newTime, duration, clientVersion, clientEventId }, callback) => {
    socketRateLimiter('sync:seek')(socket, async (err) => {
      if (err) { syncService.recordControlTelemetry(roomCode, 'seek', 'rate_limited'); return callback({ success: false, error: err.message }); }
      try {
        roomCode = normalizeRoomCode(roomCode);
        if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
        const canCtrl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canCtrl) { syncService.recordControlTelemetry(roomCode, 'seek', 'permission_denied'); return callback({ success: false, error: 'Permission denied' }); }
        const isActive = await checkRoomActive(roomCode);
        if (!isActive) return callback({ success: false, error: 'Room not active' });
        if (!validateTimestamp(newTime, duration)) return callback({ success: false, error: 'Invalid seek position' });
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) {
          syncService.recordControlTelemetry(roomCode, 'seek', 'stale');
          return callback({ success: false, error: 'Stale client', currentState });
        }
        const result = await enqueueSeekCoalesced({ roomCode, userId: socket.userId, newTime, duration, clientEventId });
        if (result.success && result.state) {
          syncService.recordControlTelemetry(roomCode, 'seek', 'accepted');
          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          emitToRoom(roomCode, 'sync:state-update', { state: result.state, media: currentPlayback.media, userId: socket.userId });
          emitToRoom(roomCode, 'sync:update', { timestamp: Date.now(), action: 'seek', currentPlayback });
        }
        callback(result);
        if (result.success) {
          getCachedRoomDoc(roomCode).then(room => {
            if (room?._id) analyticsService.incrementSyncAction(room._id.toString(), 'seek').catch(() => {});
          }).catch(() => {});
        }
      } catch (error) { callback({ success: false, error: error.message }); }
    });
  });

  // ═══ RATE CHANGE ═══
  socket.on('sync:rate-change', async ({ roomCode, rate, clientVersion, clientEventId }, callback) => {
    socketRateLimiter('sync:rate-change')(socket, async (err) => {
      if (err) { syncService.recordControlTelemetry(roomCode, 'rate_change', 'rate_limited'); return callback({ success: false, error: err.message }); }
      try {
        roomCode = normalizeRoomCode(roomCode);
        if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
        const canCtrl = await checkPermission(roomCode, socket.userId, 'canControl');
        if (!canCtrl) return callback({ success: false, error: 'Permission denied' });
        const isActive = await checkRoomActive(roomCode);
        if (!isActive) return callback({ success: false, error: 'Room not active' });
        if (rate < 0.5 || rate > 2.0) return callback({ success: false, error: 'Invalid playback rate' });
        const currentState = await syncService.getSyncState(roomCode);
        if (clientVersion && clientVersion < currentState.version) return callback({ success: false, error: 'Stale client', currentState });
        const result = await syncService.handleRateChange(roomCode, socket.userId, rate, clientEventId || null);
        if (result.success && result.state) {
          const currentPlayback = await buildCurrentPlayback(roomCode, result.state);
          emitToRoom(roomCode, 'sync:state-update', { state: result.state, media: currentPlayback.media, userId: socket.userId });
          emitToRoom(roomCode, 'sync:update', { timestamp: Date.now(), currentPlayback });
        }
        callback(result);
      } catch (error) { callback({ success: false, error: error.message }); }
    });
  });

  // ═══ POSITION CHECK (drift correction) ═══
  socket.on('sync:check-position', async ({ roomCode, clientPosition, clientNow, clientOffset }, callback) => {
    try {
      roomCode = normalizeRoomCode(roomCode);
      if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
      const state = await syncService.getSyncState(roomCode);
      const driftData = syncService.calculateClientDrift(state, clientPosition, clientNow, clientOffset, roomCode);
      callback({
        success: true, ...driftData,
        syncState: { version: state.version, isPlaying: state.isPlaying, playbackRate: state.playbackRate, baseTimestamp: state.baseTimestamp, startAt: state.startAt },
      });
    } catch (error) { callback({ success: false, error: error.message }); }
  });

  socket.on('sync:get-telemetry', async ({ roomCode }, callback = () => {}) => {
    try {
      roomCode = normalizeRoomCode(roomCode);
      if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
      callback({ success: true, telemetry: syncService.getDriftTelemetry(roomCode), controlTelemetry: syncService.getControlTelemetry(roomCode) });
    } catch (error) { callback({ success: false, error: error.message }); }
  });

  socket.on('sync:reset-telemetry', async ({ roomCode }, callback = () => {}) => {
    try {
      roomCode = normalizeRoomCode(roomCode);
      if (!roomCode) return callback({ success: false, error: 'Missing roomCode' });
      const room = await Room.findOne({ roomCode });
      const participant = room?.participants?.find((p) => p.userId.toString() === socket.userId.toString());
      const isMod = room?.hostId?.toString() === socket.userId.toString() || participant?.role === 'host' || participant?.role === 'co-host' || participant?.role === 'cohost';
      if (!isMod) return callback({ success: false, error: 'Permission denied' });
      callback({ success: true, reset: syncService.resetDriftTelemetry(roomCode), controlReset: syncService.resetControlTelemetry(roomCode) });
    } catch (error) { callback({ success: false, error: error.message }); }
  });
};