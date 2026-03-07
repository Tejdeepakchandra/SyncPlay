

// Room types
const ROOM_TYPES = {
  MOVIE: 'movie',
  MUSIC: 'music',
  CUSTOM: 'custom'
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
  DEFAULT: { limit: 30, window: 60 }           // Default 30 per minute
};

// Socket rate limits
const SOCKET_RATE_LIMITS = {
  'sync:play': { limit: 10, window: 60 },
  'sync:pause': { limit: 10, window: 60 },
  'sync:seek': { limit: 20, window: 60 },
  'sync:rate-change': { limit: 5, window: 60 },
  'room:join': { limit: 5, window: 60 },
  'room:leave': { limit: 10, window: 60 },
  DEFAULT: { limit: 30, window: 60 }
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
  EVENT_PROCESSED: 'processed:'
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
  ROOM_CODE
};