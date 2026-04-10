

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
    ignore: 0.15,     // <150ms - do nothing
    smooth: 0.4,
    gradual: 1.3,
    hardSeek: 2.0
  },

  
   // Adaptive buffer based on latency (ms)
   
  adaptiveBuffer: (latencyMs) => {
    if (latencyMs < 150) return 250;
    if (latencyMs < 350) return 400;
    return 700;
  }
};

module.exports = SYNC_CONTRACT;