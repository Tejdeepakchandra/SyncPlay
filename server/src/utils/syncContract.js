

const SYNC_CONTRACT = {
  /**
   * Core sync state - Source of Truth
   */
  syncState: {
    version: 'number',           // Monotonically increasing, per room
    isPlaying: 'boolean',        // True if media should be playing
    baseTimestamp: 'number',      // Media position in seconds at startAt
    startAt: 'number',           // Server timestamp (ms) when playback should start
    playbackRate: 'number',       // 1.0 = normal, >1 faster, <1 slower
    lastUpdated: 'number',        // Server timestamp of last update
    updatedBy: 'string',          // User ID who made the change
    eventId: 'string'             // Unique event ID for deduplication
  },

  /**
   * How clients calculate current position
   * 
   * if (isPlaying) {
   *   const now = Date.now();
   *   const elapsed = (now - startAt) / 1000;
   *   currentTime = baseTimestamp + (elapsed * playbackRate);
   * } else {
   *   currentTime = baseTimestamp;
   * }
   */

  
   // Drift correction thresholds (seconds)
   
  driftThresholds: {
    ignore: 0.08,
    smooth: 0.14,
    gradual: 0.32,
    hardSeek: 0.65
  },

  
   // Adaptive buffer based on latency (ms)
   
  adaptiveBuffer: (latencyMs) => {
    if (latencyMs < 120) return 80;
    if (latencyMs < 260) return 130;
    return 220;
  }
};

module.exports = SYNC_CONTRACT;