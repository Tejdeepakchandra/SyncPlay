/**
 * App Constants
 * Single source of truth for all constants
 */

// Room types
export const ROOM_TYPES = {
  MOVIE: 'movie',
  MUSIC: 'music',
  CUSTOM: 'custom'
};

// Room status
export const ROOM_STATUS = {
  LOBBY: 'lobby',
  ACTIVE: 'active',
  PAUSED: 'paused',
  ENDED: 'ended'
};

// Participant roles
export const PARTICIPANT_ROLES = {
  HOST: 'host',
  COHOST: 'cohost',
  PARTICIPANT: 'participant',
  GUEST: 'guest'
};

// Privacy levels
export const PRIVACY_LEVELS = {
  PUBLIC: 'public',
  PRIVATE: 'private',
  INVITE_ONLY: 'invite-only'
};

// Moment types
export const MOMENT_TYPES = {
  REACTION: 'reaction',
  COMMENT: 'comment',
  BOOKMARK: 'bookmark',
  REACTION_SPIKE: 'reaction_spike',
  COMMENT_CLUSTER: 'comment_cluster',
  AI_HIGHLIGHT: 'ai_highlight',
  GROUP_PHOTO: 'group_photo'
};

// Story types
export const STORY_TYPES = {
  LIVE: 'live',
  RECAP: 'recap',
  MOMENT: 'moment'
};

// Sync actions
export const SYNC_ACTIONS = {
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  RATE_CHANGE: 'rate_change'
};

// Rate limits (requests per window)
export const RATE_LIMITS = {
  JOIN_ROOM: { limit: 10, window: 60 },      // 10 per minute
  REACTION: { limit: 3, window: 5 },          // 3 per 5 seconds
  SEEK: { limit: 5, window: 3 },               // 5 per 3 seconds
  CHAT: { limit: 20, window: 10 },             // 20 per 10 seconds
  CREATE_ROOM: { limit: 5, window: 3600 }      // 5 per hour
};

// Redis key prefixes
export const REDIS_KEYS = {
  ROOM: 'room:',
  ROOM_USERS: 'room:users:',
  SOCKET_ROOM: 'socket:room:',
  SYNC_STATE: 'sync:',
  PRESENCE: 'presence:',
  RATE_LIMIT: 'ratelimit:',
  EVENT_PROCESSED: 'processed:'
};

// Cache TTLs (seconds)
export const CACHE_TTL = {
  ROOM: 300,           // 5 minutes
  SYNC_STATE: 3600,    // 1 hour
  PRESENCE: 70,        // 70 seconds (heartbeat + buffer)
  USER: 3600,          // 1 hour
  EVENT_DEDUP: 10      // 10 seconds for deduplication
};

// Drift correction thresholds (seconds)
export const DRIFT_THRESHOLDS = {
  IGNORE: 0.15,
  SMOOTH: 0.4,
  GRADUAL: 1.5,
  HARD_SEEK: 1.5
};

// Media sources
export const MEDIA_SOURCES = {
  YOUTUBE: 'youtube',
  VIMEO: 'vimeo',
  UPLOAD: 'upload',
  LIBRARY: 'library',
  SCREEN: 'screen'
};

// Default room settings
export const DEFAULT_ROOM_SETTINGS = {
  maxParticipants: 20,
  privacy: PRIVACY_LEVELS.PUBLIC,
  requireApproval: false,
  allowGuests: true,
  allowChat: true,
  allowReactions: true,
  allowScreenShare: true,
  allowQueue: true,
  slowMode: false
};

// Room code generation
export const ROOM_CODE = {
  LENGTH: 6,
  CHARS: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
};