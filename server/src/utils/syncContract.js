

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
    ignore: 0.4,         // Below this: no correction needed (YT has ~250ms jitter)
    smooth: 0.8,         // Start rate-adjust corrections
    gradual: 1.5,        // Micro-seek correction for moderate drift
    hardSeek: 3.0        // Hard seek for large drift
  },

  
   // Adaptive buffer based on latency (ms)
   
  adaptiveBuffer: (latencyMs) => {
    // Buffer must exceed typical broadcast round-trip so all clients
    // receive the state before startAt arrives, enabling simultaneous playback.
    // YouTube typically needs ~400-800ms to pre-buffer after a seek command.
    if (latencyMs < 120) return 600;     // Low latency: reasonable buffer
    if (latencyMs < 260) return 850;     // Medium: allow for network jitter
    return 1200;                         // High latency: generous buffer
  }
};

module.exports = SYNC_CONTRACT;