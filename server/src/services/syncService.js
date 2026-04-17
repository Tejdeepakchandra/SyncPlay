const redisClient = require('../config/redis');
const Room = require('../models/mongodb/Room');
const analyticsService = require('./analyticsService');
const { createRedisKey, generateEventId } = require('../utils/helpers');
const { REDIS_KEYS, CACHE_TTL, SYNC_ACTIONS } = require('../utils/constants');
const SYNC_CONTRACT = require('../utils/syncContract');

class SyncService {
  constructor() {
    this.eventQueues = new Map(); // For single-server, will move to Redis later
    this.driftTelemetry = new Map();
    this.controlTelemetry = new Map();
    this.TELEMETRY_WINDOW_MS = 10 * 60 * 1000;
    this.TELEMETRY_MAX_SAMPLES = 5000;
    this.CONTROL_COOLDOWN_MS = {
      play: 220,
      pause: 220,
      seek: 120,
      rate_change: 250,
    };
  }

  recordControlTelemetry(roomCode, action, outcome = 'accepted') {
    if (!roomCode || !action) return;

    const now = Date.now();
    const current = this.controlTelemetry.get(roomCode) || {
      samples: [],
      lastByAction: {},
      lastUpdated: now,
    };

    const previousAt = Number(current.lastByAction[action] || 0);
    const deltaMs = previousAt ? now - previousAt : null;
    const cooldownMs = this.CONTROL_COOLDOWN_MS[action] || 200;
    const cooldownPressure = Number.isFinite(deltaMs) && deltaMs < cooldownMs;

    current.samples.push({
      timestamp: now,
      action,
      outcome,
      deltaMs,
      cooldownPressure,
    });

    if (current.samples.length > this.TELEMETRY_MAX_SAMPLES) {
      current.samples.splice(0, current.samples.length - this.TELEMETRY_MAX_SAMPLES);
    }

    current.samples = current.samples.filter((s) => (now - s.timestamp) <= this.TELEMETRY_WINDOW_MS);
    current.lastByAction[action] = now;
    current.lastUpdated = now;
    this.controlTelemetry.set(roomCode, current);
  }

  getControlTelemetry(roomCode) {
    const now = Date.now();
    const current = this.controlTelemetry.get(roomCode) || {
      samples: [],
      lastByAction: {},
      lastUpdated: now,
    };

    const samples = current.samples.filter((s) => (now - s.timestamp) <= this.TELEMETRY_WINDOW_MS);
    current.samples = samples;
    this.controlTelemetry.set(roomCode, current);

    const byAction = { play: 0, pause: 0, seek: 0, rate_change: 0 };
    const byOutcome = { accepted: 0, stale: 0, rejected: 0, rate_limited: 0, permission_denied: 0 };
    let cooldownPressureCount = 0;

    samples.forEach((s) => {
      if (byAction[s.action] !== undefined) {
        byAction[s.action] += 1;
      } else {
        byAction[s.action] = (byAction[s.action] || 0) + 1;
      }

      if (byOutcome[s.outcome] !== undefined) {
        byOutcome[s.outcome] += 1;
      } else {
        byOutcome[s.outcome] = (byOutcome[s.outcome] || 0) + 1;
      }

      if (s.cooldownPressure) cooldownPressureCount += 1;
    });

    return {
      roomCode,
      sampleCount: samples.length,
      windowMs: this.TELEMETRY_WINDOW_MS,
      byAction,
      byOutcome,
      cooldownPressureCount,
      lastUpdated: current.lastUpdated,
    };
  }

  recordDriftTelemetry(roomCode, driftSeconds, action = 'none') {
    if (!roomCode) return;

    const now = Date.now();
    const driftMs = Math.abs(Number(driftSeconds || 0) * 1000);
    const current = this.driftTelemetry.get(roomCode) || {
      samples: [],
      lastUpdated: now,
    };

    current.samples.push({ driftMs, action, timestamp: now });
    if (current.samples.length > this.TELEMETRY_MAX_SAMPLES) {
      current.samples.splice(0, current.samples.length - this.TELEMETRY_MAX_SAMPLES);
    }

    current.samples = current.samples.filter((s) => (now - s.timestamp) <= this.TELEMETRY_WINDOW_MS);
    current.lastUpdated = now;

    this.driftTelemetry.set(roomCode, current);
  }

  getDriftTelemetry(roomCode) {
    const now = Date.now();
    const current = this.driftTelemetry.get(roomCode) || {
      samples: [],
      lastUpdated: now,
    };

    const freshSamples = current.samples.filter((s) => (now - s.timestamp) <= this.TELEMETRY_WINDOW_MS);
    const sorted = freshSamples.map((s) => s.driftMs).sort((a, b) => a - b);
    const sampleCount = sorted.length;
    const correctionCounts = freshSamples.reduce((acc, sample) => {
      const key = sample.action || 'none';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { none: 0, rateAdjust: 0, gradual: 0, hardSeek: 0 });

    const percentile = (p) => {
      if (!sampleCount) return 0;
      const index = Math.min(sampleCount - 1, Math.ceil((p / 100) * sampleCount) - 1);
      return sorted[index];
    };

    current.samples = freshSamples;
    this.driftTelemetry.set(roomCode, current);

    return {
      roomCode,
      sampleCount,
      windowMs: this.TELEMETRY_WINDOW_MS,
      driftMs: {
        p50: percentile(50),
        p95: percentile(95),
      },
      correctionCounts,
      lastUpdated: current.lastUpdated,
    };
  }

  resetDriftTelemetry(roomCode = null) {
    if (!roomCode) {
      const clearedRooms = this.driftTelemetry.size;
      this.driftTelemetry.clear();
      return { clearedRooms, roomCode: null };
    }

    const existing = this.driftTelemetry.get(roomCode);
    const clearedSamples = existing?.samples?.length || 0;
    this.driftTelemetry.delete(roomCode);
    return { roomCode, clearedSamples };
  }

  resetControlTelemetry(roomCode = null) {
    if (!roomCode) {
      const clearedRooms = this.controlTelemetry.size;
      this.controlTelemetry.clear();
      return { clearedRooms, roomCode: null };
    }

    const existing = this.controlTelemetry.get(roomCode);
    const clearedSamples = existing?.samples?.length || 0;
    this.controlTelemetry.delete(roomCode);
    return { roomCode, clearedSamples };
  }

  
   //Get authoritative sync state
   
  async getSyncState(roomCode) {
    const redisKey = createRedisKey(REDIS_KEYS.SYNC_STATE, roomCode);
    let cached = null;
    try {
      cached = await redisClient.get(redisKey);
    } catch (error) {
      console.error('[SYNC] Redis get failed, falling back to Mongo state:', error.message);
    }
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to MongoDB
    const room = await Room.findOne({ roomCode }).select('syncState');
    if (room?.syncState) {
      const fallbackBase = Number.isFinite(room.syncState.baseTimestamp)
        ? room.syncState.baseTimestamp
        : (Number.isFinite(room.syncState.currentTime) ? room.syncState.currentTime : 0);

      const normalizedSyncState = {
        version: Number.isFinite(room.syncState.version) ? room.syncState.version : 0,
        isPlaying: !!room.syncState.isPlaying,
        baseTimestamp: fallbackBase,
        currentTime: fallbackBase,
        startAt: room.syncState.startAt || null,
        playbackRate: Number.isFinite(room.syncState.playbackRate) ? room.syncState.playbackRate : 1.0,
        lastUpdated: room.syncState.lastUpdated ? new Date(room.syncState.lastUpdated).getTime() : Date.now(),
        updatedBy: room.syncState.updatedBy || null,
        eventId: room.syncState.eventId || null,
      };

      // Cache in Redis
      try {
        await redisClient.set(redisKey, JSON.stringify(normalizedSyncState), {
          EX: CACHE_TTL.SYNC_STATE
        });
      } catch (error) {
        console.error('[SYNC] Redis set failed while warming cache:', error.message);
      }
      return normalizedSyncState;
    }

    // Initial state
    return {
      version: 0,
      isPlaying: false,
      baseTimestamp: 0,
      startAt: null,
      playbackRate: 1.0,
      lastUpdated: Date.now(),
      updatedBy: null,
      eventId: null
    };
  }

  
  // Process sync event with proper timing
  
  async processSyncEvent(roomCode, event) {
    const { type, data, userId, eventId } = event;
    const now = Date.now();

    // Get current state
    const currentState = await this.getSyncState(roomCode);

    // Calculate new state based on event type
    let newState = { ...currentState };
    newState.version += 1;
    newState.lastUpdated = now;
    newState.updatedBy = userId;
    newState.eventId = eventId;

    switch (type) {
      case SYNC_ACTIONS.PLAY: {
        // When playing: set startAt to future for synchronized start
        const latency = data.latency || 100;
        const buffer = SYNC_CONTRACT.adaptiveBuffer(latency);
        
        newState.isPlaying = true;
        newState.baseTimestamp = data.timestamp;
        newState.startAt = now + buffer;
        newState.playbackRate = data.playbackRate || 1.0;
        break;
      }

      case SYNC_ACTIONS.PAUSE: {
        // When pausing: record current position
        newState.isPlaying = false;
        newState.baseTimestamp = data.timestamp;
        newState.startAt = null;
        break;
      }

      case SYNC_ACTIONS.SEEK: {
        // When seeking, set new base timestamp
        newState.baseTimestamp = data.newTime;
        
        // If playing, resume from a short future server time so clients can align together.
        if (newState.isPlaying) {
          const latency = data.latency || 100;
          const buffer = SYNC_CONTRACT.adaptiveBuffer(latency);
          newState.startAt = now + buffer;
        }
        break;
      }

      case SYNC_ACTIONS.RATE_CHANGE: {
        // When changing playback rate
        newState.playbackRate = data.rate;
        if (newState.isPlaying) {
          // Adjust startAt to maintain position
          newState.startAt = now;
        }
        break;
      }
    }

    // Store in Redis
    const redisKey = createRedisKey(REDIS_KEYS.SYNC_STATE, roomCode);
    newState.currentTime = Number.isFinite(newState.baseTimestamp) ? newState.baseTimestamp : 0;
    try {
      await redisClient.set(redisKey, JSON.stringify(newState), {
        EX: CACHE_TTL.SYNC_STATE
      });
    } catch (error) {
      console.error('[SYNC] Redis set failed while persisting state:', error.message);
    }

    // Store for deduplication (using the SAME eventId)
    try {
      await redisClient.set(
        createRedisKey(REDIS_KEYS.EVENT_PROCESSED, eventId),
        '1',
        { EX: CACHE_TTL.EVENT_DEDUP }
      );
    } catch (error) {
      console.error('[SYNC] Redis set failed for dedupe marker:', error.message);
    }

    // Async update to MongoDB
    Room.findOneAndUpdate(
      { roomCode },
      { $set: { syncState: newState } }
    ).catch(err => console.error('MongoDB sync update failed:', err));

    return newState;
  }

  
   // Queue event for sequential processing
   
  async queueEvent(roomCode, event) {
    return new Promise((resolve, reject) => {
      // Use caller eventId for idempotency across retries; fallback to generated ID.
      const eventId = event.clientEventId || generateEventId();
      
      if (!this.eventQueues.has(roomCode)) {
        this.eventQueues.set(roomCode, []);
        setImmediate(() => this.processQueue(roomCode));
      }

      this.eventQueues.get(roomCode).push({
        ...event,
        eventId, // ONE eventId throughout
        resolve,
        reject
      });
    });
  }

  
   // Process queue sequentially
   
  async processQueue(roomCode) {
    const queue = this.eventQueues.get(roomCode);
    if (!queue || queue.length === 0) {
      this.eventQueues.delete(roomCode);
      return;
    }

    const event = queue.shift();
    
    try {
      // Check for duplicate using the eventId
      let processed = null;
      try {
        processed = await redisClient.get(
          createRedisKey(REDIS_KEYS.EVENT_PROCESSED, event.eventId)
        );
      } catch (error) {
        console.error('[SYNC] Redis get failed for dedupe marker:', error.message);
      }
      
      if (processed) {
        this.getSyncState(roomCode)
          .then((state) => event.resolve({ success: true, state, duplicate: true }))
          .catch(() => event.resolve({ success: true, state: null, duplicate: true }));
      } else {
        const state = await this.processSyncEvent(roomCode, event);
        event.resolve({ success: true, state });
      }
    } catch (error) {
      event.reject(error);
    }

    // Continue processing
    if (queue.length > 0) {
      setImmediate(() => this.processQueue(roomCode));
    } else {
      this.eventQueues.delete(roomCode);
    }
  }

 /**
 * Calculate client drift using authoritative server time — FIXED
 * @param {Object} syncState - Current sync state
 * @param {number} clientPosition - video.currentTime in seconds
 * @param {number} clientNow - Date.now() from client
 * @param {number} clientOffset - Clock offset from sync
 */
calculateClientDrift(syncState, clientPosition, clientNow, clientOffset = 0, roomCode = null) {
  if (!syncState.isPlaying || !syncState.startAt) {
    this.recordDriftTelemetry(roomCode, 0, 'none');
    return {
      drift: 0,
      correction: null,
      expectedPosition: syncState.baseTimestamp
    };
  }

  // Client's estimate of server time
  const estimatedServerTime = clientNow + clientOffset;
  
  // Expected position based on server authority
  const elapsed = Math.max(0, (estimatedServerTime - syncState.startAt) / 1000);
  const expectedPosition = syncState.baseTimestamp + (elapsed * syncState.playbackRate);
  
  // Drift = client position vs expected position
  const drift = clientPosition - expectedPosition;
  const absDrift = Math.abs(drift);

  let correction = null;
  

  if (absDrift > SYNC_CONTRACT.driftThresholds.hardSeek) {
    correction = {
      action: 'hardSeek',
      targetPosition: expectedPosition,
      reason: 'large_drift'
    };
  } else if (absDrift > SYNC_CONTRACT.driftThresholds.gradual) {
    correction = {
      action: 'gradual',
      steps: Math.ceil(absDrift * 2),
      targetPosition: expectedPosition,
      reason: 'gradual_correction'
    };
  } else if (absDrift > SYNC_CONTRACT.driftThresholds.smooth) {
    const rate = drift > 0 ? 0.98 : 1.02;
    correction = {
      action: 'rateAdjust',
      rate,
      targetPosition: expectedPosition,
      reason: 'smooth_correction'
    };
  }

  this.recordDriftTelemetry(roomCode, drift, correction?.action || 'none');

  return { drift, correction, expectedPosition };
}

  
   // Handle play event
   
  async handlePlay(roomCode, userId, timestamp, latency = 100, clientEventId = null) {
    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.PLAY,
      data: { timestamp, latency, playbackRate: 1.0 },
      userId,
      clientEventId,
    });
  }

  
   // Handle pause event
   
  async handlePause(roomCode, userId, timestamp, clientEventId = null) {
    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.PAUSE,
      data: { timestamp },
      userId,
      clientEventId,
    });
  }

  
   // Handle seek event
   
  async handleSeek(roomCode, userId, newTime, duration, clientEventId = null) {
    // Validate timestamp
    if (duration && (newTime < 0 || newTime > duration)) {
      throw new Error('Invalid seek position');
    }

    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.SEEK,
      data: { newTime, latency: 100 },
      userId,
      clientEventId,
    });
  }

  
   // Handle rate change
   
  async handleRateChange(roomCode, userId, rate, clientEventId = null) {
    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.RATE_CHANGE,
      data: { rate },
      userId,
      clientEventId,
    });
  }
}

module.exports = new SyncService();