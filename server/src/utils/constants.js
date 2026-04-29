

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

// Rate limits (requests per window)
const RATE_LIMITS = {
  JOIN_ROOM: { limit: 10, window: 60 },      // 10 per minute
  REACTION: { limit: 3, window: 5 },          // 3 per 5 seconds
  SEEK: { limit: 5, window: 3 },               // 5 per 3 seconds
  CHAT: { limit: 20, window: 10 },             // 20 per 10 seconds
  CREATE_ROOM: { limit: 5, window: 3600 },     // 5 per hour
  moments: { limit: 30, window: 60 },          // 30 per minute (API endpoints)
  BOOKMARK: { limit: 1, window: 5 },           // 1 per 5 seconds
  DEFAULT: { limit: 30, window: 60 }           // Default 30 per minute
};

// Socket rate limits — generous for sync events to prevent dropped actions
const SOCKET_RATE_LIMITS = {
  'sync:play': { limit: 60, window: 10 },
  'sync:pause': { limit: 60, window: 10 },
  'sync:seek': { limit: 120, window: 10 },
  'sync:rate-change': { limit: 10, window: 60 },
  'sync:check-position': { limit: 120, window: 10 },
  'sync:clock-sync': { limit: 30, window: 60 },
  'sync:request-state': { limit: 30, window: 10 },
  'sync:media-change': { limit: 20, window: 10 },
  'room:join': { limit: 10, window: 60 },
  'room:leave': { limit: 10, window: 60 },
  'webrtc-mesh:join': { limit: 20, window: 60 },
  'webrtc-mesh:offer': { limit: 60, window: 60 },
  'webrtc-mesh:answer': { limit: 60, window: 60 },
  'webrtc-mesh:ice-candidate': { limit: 200, window: 60 },
  'audio:state-change': { limit: 60, window: 10 },
  'audio:activity-level': { limit: 300, window: 10 },
  'moment:reaction': { limit: 5, window: 5 },
  'moment:comment': { limit: 3, window: 5 },
  'moment:bookmark': { limit: 1, window: 5 },
  DEFAULT: { limit: 60, window: 60 }
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