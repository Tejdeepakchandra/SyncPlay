const redisClient = require('../config/redis');
const Room = require('../models/mongodb/Room');
const analyticsService = require('./analyticsService');
const { createRedisKey, generateEventId } = require('../utils/helpers');
const { REDIS_KEYS, CACHE_TTL, SYNC_ACTIONS } = require('../utils/constants');
const SYNC_CONTRACT = require('../utils/syncContract');

class SyncService {
  constructor() {
    this.eventQueues = new Map(); // For single-server, will move to Redis later
  }

  
   //Get authoritative sync state
   
  async getSyncState(roomCode) {
    const redisKey = createRedisKey(REDIS_KEYS.SYNC_STATE, roomCode);
    const cached = await redisClient.get(redisKey);
    
    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to MongoDB
    const room = await Room.findOne({ roomCode }).select('syncState');
    if (room?.syncState) {
      // Cache in Redis
      await redisClient.set(redisKey, JSON.stringify(room.syncState), {
        EX: CACHE_TTL.SYNC_STATE
      });
      return room.syncState;
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
        
        // If playing, reset startAt with appropriate buffer
        if (newState.isPlaying) {
          const buffer = SYNC_CONTRACT.adaptiveBuffer(data.latency || 100);
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
    await redisClient.set(redisKey, JSON.stringify(newState), {
      EX: CACHE_TTL.SYNC_STATE
    });

    // Store for deduplication (using the SAME eventId)
    await redisClient.set(
      createRedisKey(REDIS_KEYS.EVENT_PROCESSED, eventId),
      '1',
      { EX: CACHE_TTL.EVENT_DEDUP }
    );

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
      // Generate SINGLE eventId at entry
      const eventId = generateEventId();
      
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
      const processed = await redisClient.get(
        createRedisKey(REDIS_KEYS.EVENT_PROCESSED, event.eventId)
      );
      
      if (processed) {
        event.resolve({ success: true, state: null, duplicate: true });
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
calculateClientDrift(syncState, clientPosition, clientNow, clientOffset = 0) {
  if (!syncState.isPlaying || !syncState.startAt) {
    return {
      drift: 0,
      correction: null,
      expectedPosition: syncState.baseTimestamp
    };
  }

  // Client's estimate of server time
  const estimatedServerTime = clientNow + clientOffset;
  
  // Expected position based on server authority
  const elapsed = (estimatedServerTime - syncState.startAt) / 1000;
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
      reason: 'smooth_correction'
    };
  }

  return { drift, correction, expectedPosition };
}

  
   // Handle play event
   
  async handlePlay(roomCode, userId, timestamp, latency = 100) {
    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.PLAY,
      data: { timestamp, latency, playbackRate: 1.0 },
      userId
    });
  }

  
   // Handle pause event
   
  async handlePause(roomCode, userId, timestamp) {
    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.PAUSE,
      data: { timestamp },
      userId
    });
  }

  
   // Handle seek event
   
  async handleSeek(roomCode, userId, newTime, duration) {
    // Validate timestamp
    if (duration && (newTime < 0 || newTime > duration)) {
      throw new Error('Invalid seek position');
    }

    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.SEEK,
      data: { newTime, latency: 100 },
      userId
    });
  }

  
   // Handle rate change
   
  async handleRateChange(roomCode, userId, rate) {
    return this.queueEvent(roomCode, {
      type: SYNC_ACTIONS.RATE_CHANGE,
      data: { rate },
      userId
    });
  }
}

module.exports = new SyncService();