

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
    smooth: 0.4,      // 150-400ms - adjust playback rate
    gradual: 1.5,     // 400ms-1.5s - gradual seek
    hardSeek: 2.5     // >1.5s - immediate seek
  },

  
   // Adaptive buffer based on latency (ms)
   
  adaptiveBuffer: (latencyMs) => {
    if (latencyMs < 150) return 800;    // 800ms buffer
    if (latencyMs < 400) return 1200;   // 1.2s buffer
    return 2000;                         // 2s buffer for slow connections
  }
};

module.exports = SYNC_CONTRACT;