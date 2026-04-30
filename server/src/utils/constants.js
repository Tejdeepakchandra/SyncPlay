

// Room types
const ROOM_TYPES = {
  MOVIE: 'movie',
  MUSIC: 'music',
  CUSTOM: 'custom'
};

// Moment capture limits per room (per type)
const MOMENT_LIMITS = {
  bookmark: 4,
  reaction_spike: 3,
  comment_cluster: 2
};

// Moment clip settings
const MOMENT_CLIP = {
  DURATION: 15,           // 15 seconds total clip length
  OFFSET_BEFORE: 5,       // 5 seconds before trigger
  OFFSET_AFTER: 10,       // 10 seconds after trigger
  OVERLAP_WINDOW: 15,     // Merge clips within 15s of each other
  DEDUPE_WINDOW: 10,      // Dedup same-type triggers within 10s
  MAX_PER_ROOM: 9,        // Max total moments per room session (4+3+2)
};

// Room status
const ROOM_STATUS = {
  LOBBY: 'lobby',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended'
};

// Participant roles
const PARTICIPANT_ROLES = {
  HOST: 'host',
  COHOST: 'cohost',
  PARTICIPANT: 'participant',
  GUEST: 'guest'
};

// Privacy levels
const PRIVACY_LEVELS = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  INVITE_ONLY: 'invite-only'
};

// Sync actions
const SYNC_ACTIONS = {
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  RATE_CHANGE: 'rate_change'
};

// Rate limits (requests per window) — HTTP API endpoints
const RATE_LIMITS = {
  JOIN_ROOM: { limit: 15, window: 60 },        // 15 per minute
  REACTION: { limit: 5, window: 5 },            // 5 per 5 seconds
  SEEK: { limit: 10, window: 3 },               // 10 per 3 seconds (real-time sync)
  CHAT: { limit: 30, window: 10 },              // 30 per 10 seconds
  CREATE_ROOM: { limit: 10, window: 3600 },     // 10 per hour
  moments: { limit: 50, window: 60 },            // 50 per minute (API endpoints)
  BOOKMARK: { limit: 2, window: 5 },             // 2 per 5 seconds
  DEFAULT: { limit: 60, window: 60 }             // Default 60 per minute
};

// Socket rate limits — generous for sync events (real-time system needs headroom)
// These limits are per-user, enforced via Redis sorted sets
const SOCKET_RATE_LIMITS = {
  // Sync events — HIGH limits (core real-time functionality)
  'sync:play':            { limit: 80, window: 10 },   // Rapid play/pause toggling
  'sync:pause':           { limit: 80, window: 10 },
  'sync:seek':            { limit: 150, window: 10 },   // Scrubbing through timeline
  'sync:rate-change':     { limit: 15, window: 60 },
  'sync:check-position':  { limit: 150, window: 10 },   // Drift correction polling
  'sync:clock-sync':      { limit: 40, window: 60 },    // NTP-style clock sync
  'sync:request-state':   { limit: 40, window: 10 },    // State recovery on reconnect
  'sync:media-change':    { limit: 25, window: 10 },    // Media switching

  // Room events
  'room:join':            { limit: 15, window: 60 },
  'room:leave':           { limit: 15, window: 60 },

  // WebRTC signaling — needs high limits for mesh topology
  'webrtc-mesh:join':     { limit: 25, window: 60 },
  'webrtc-mesh:offer':    { limit: 80, window: 60 },
  'webrtc-mesh:answer':   { limit: 80, window: 60 },
  'webrtc-mesh:ice-candidate': { limit: 300, window: 60 },  // ICE can be chatty

  // Audio/voice chat
  'audio:state-change':   { limit: 80, window: 10 },
  'audio:activity-level':  { limit: 400, window: 10 },  // Voice activity detection

  // Chat
  'chat:message':         { limit: 30, window: 10 },     // 3 messages/sec max

  // Moments
  'moment:reaction':      { limit: 8, window: 5 },
  'moment:comment':       { limit: 5, window: 5 },
  'moment:bookmark':      { limit: 2, window: 5 },

  DEFAULT:                { limit: 80, window: 60 }
};

// Redis key prefixes
const REDIS_KEYS = {
  ROOM: 'room:',
  ROOM_USERS: 'room:users:',
  ROOM_METADATA: 'room:meta:',
  SOCKET_ROOM: 'socket:room:',
  SYNC_STATE: 'sync:',
  PRESENCE: 'presence:',
  RATE_LIMIT: 'ratelimit:',
  SOCKET_RATE_LIMIT: 'socket:ratelimit:',
  EVENT_PROCESSED: 'processed:',
  MOMENT_WATCHING: 'moment:watching:',       // user watching a moment
  MOMENT_CAPTURE_STATE: 'moment:capture:',   // capture in progress
  MOMENT_ROOM_COUNTS: 'moment:counts:',      // per-type counts cache
};

// Cache TTLs (seconds)
const CACHE_TTL = {
  ROOM: 300,           // 5 minutes
  SYNC_STATE: 3600,    // 1 hour
  PRESENCE: 70,        // 70 seconds (heartbeat + buffer)
  USER: 3600,          // 1 hour
  EVENT_DEDUP: 10      // 10 seconds for deduplication
};

// Room code generation
const ROOM_CODE = {
  LENGTH: 6,
  CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
};

module.exports = {
  ROOM_TYPES,
  ROOM_STATUS,
  PARTICIPANT_ROLES,
  PRIVACY_LEVELS,
  SYNC_ACTIONS,
  RATE_LIMITS,
  SOCKET_RATE_LIMITS,
  REDIS_KEYS,
  CACHE_TTL,
  ROOM_CODE,
  MOMENT_LIMITS,
  MOMENT_CLIP,
};