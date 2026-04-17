const mongoose = require('mongoose');


const participantSchema = new mongoose.Schema({
  userId: {
    type: String,  // Clerk user ID (string)
    required: true
  },
  username: {
    type: String,
    required: true
  },
  displayName: String,
  avatar: String,  // Avatar URL/image
  avatar_emoji: {  // Avatar emoji character for UI display
    type: String,
    default: '🧑'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  role: {
    type: String,
    enum: ['host', 'cohost', 'co-host', 'participant', 'guest'],
    default: 'participant'
  },
  permissions: {
    canControl: { type: Boolean, default: false },
    canAddToQueue: { type: Boolean, default: true },
    canChat: { type: Boolean, default: true },
    canReact: { type: Boolean, default: true },
    canInvite: { type: Boolean, default: false },
    canKick: { type: Boolean, default: false },
    canPromote: { type: Boolean, default: false }
  },
  streamSettings: {
    videoEnabled: { type: Boolean, default: true },
    audioEnabled: { type: Boolean, default: true },
    screenShare: { type: Boolean, default: false }
  },
  restrictions: {
    micDisabledByHost: { type: Boolean, default: false },
    videoDisabledByHost: { type: Boolean, default: false },
    chatDisabledByHost: { type: Boolean, default: false },
    mediaControlDisabledByHost: { type: Boolean, default: false },
    restrictedAt: Date,
    restrictedBy: String // Host ID who applied restriction
  },
  lastActive: {
    type: Date,
    default: Date.now
  }
});



const mediaSchema = new mongoose.Schema({
  source: {
    type: String,
    enum: ['youtube', 'vimeo','spotify', 'upload', 'library', 'screen'],
    required: true
  },
  url: String,
  title: String,
  thumbnail: String,
  duration: Number, 
  currentTime: {   
    type: Number,
    default: 0
  },
  startTime: Date,  
  pausedAt: Date,    
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});


const queueItemSchema = new mongoose.Schema({
  media: mediaSchema,
  addedBy: {
    userId: String,  // Clerk user ID
    username: String
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  votes: [{
    userId: String,  // Clerk user ID
    vote: { type: Number, enum: [1, -1] } 
  }],
  status: {
    type: String,
    enum: ['queued', 'playing', 'played', 'skipped'],
    default: 'queued'
  }
});


const roomSchema = new mongoose.Schema({
  // Identification
  roomCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['movie', 'music', 'custom'],
    required: true
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  
  // Ownership
  hostId: {
    type: String,  // Clerk user ID
    required: true,
    index: true
  },
  originalHostId: {
    type: String,
    required: true,
    index: true
  },
  coHosts: [{
    type: String  // Clerk user IDs
  }],
  
  // Participants
  participants: [participantSchema],
  participantCount: {
    type: Number,
    default: 0
  },
  maxParticipants: {
    type: Number,
    default: 20,
    min: 2,
    max: 100
  },

  // Access Control for Private Rooms
  invitedUsers: [{
    userId: String,          // Clerk user ID (can be null for email invites)
    email: String,           // For inviting by email
    name: String,            // Optional name
    invitedAt: { type: Date, default: Date.now },
    joinedAt: Date
  }],

  joinRequests: [{
    userId: String,          // Clerk user ID or guest ID
    username: String,        // Name user entered
    email: String,           // Optional email
    requestedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' }
  }],

  waitingUsers: [{
    userId: String,          // Guest ID or authenticated user ID
    username: String,        // Name they entered/chose
    displayName: String,
    avatar: String,
    joinRequestedAt: { type: Date, default: Date.now },
    role: { type: String, default: 'guest' }
  }],
  
  // Settings
  settings: {
    chatEnabled: {
      type: Boolean,
      default: true
    },
    reactionsEnabled: {
      type: Boolean,
      default: true
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowScreenShare: {
      type: Boolean,
      default: true
    },
    slowMode: {
      type: Boolean,
      default: false
    },
    privacy: {
      type: String,
      enum: ['public', 'private', 'invite-only'],
      default: 'public'
    },
    password: {
      type: String,
      select: false 
    },
    requireApproval: {
      type: Boolean,
      default: false
    },
    allowGuests: {
      type: Boolean,
      default: true
    },
    allowQueue: {
      type: Boolean,
      default: true
    }
  },
  

  media: {
    current: mediaSchema,
    queue: [queueItemSchema],
    history: [{
      media: mediaSchema,
      playedAt: Date,
      playedBy: String
    }]
  },
  
  // Sync State (Live in Redis, but persisted for recovery)
  syncState: {
    version: { type: Number, default: 0 },
    isPlaying: { type: Boolean, default: false },
    baseTimestamp: { type: Number, default: 0 },
    currentTime: { type: Number, default: 0 },
    startAt: Date,
    playbackRate: { type: Number, default: 1.0 },
    lastUpdated: Date,
    updatedBy: String,
    eventId: String,
  },
  

  status: {
    type: String,
    enum: ['lobby', 'active', 'paused', 'ended'],
    default: 'lobby'
  },
  

  startedAt: Date,
  endedAt: Date,
  
  // Stats (for analytics)
  stats: {
    totalWatchTime: { type: Number, default: 0 },
    peakParticipants: { type: Number, default: 0 },
    messageCount: { type: Number, default: 0 },
    reactionCount: { type: Number, default: 0 },
    momentCount: { type: Number, default: 0 }
  },
  
  // Stories (for future)
  story: {
    enabled: { type: Boolean, default: false },
    createdAt: Date,
    expiresAt: Date,
    viewCount: { type: Number, default: 0 }
  },
  
  // Version for optimistic concurrency
  version: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});


// INDEXES for Performance

roomSchema.index({ status: 1 });
roomSchema.index({ 'participants.userId': 1 });
roomSchema.index({ createdAt: -1 });
roomSchema.index({ 'stats.peakParticipants': -1 });


// MIDDLEWARE

// Update participant count before save
roomSchema.pre('save', async function() {
  if (this.participants) {
    this.participantCount = this.participants.length;

    // Keep coHosts array aligned with participant role assignments.
    this.coHosts = this.participants
      .filter((p) => p.role === 'co-host' || p.role === 'cohost')
      .map((p) => p.userId);
  }
});

// Update timestamps based on status
roomSchema.pre('save', async function() {
  if (this.isModified('status')) {
    if (this.status === 'active' && !this.startedAt) {
      this.startedAt = new Date();
    }
    if (this.status === 'ended' && !this.endedAt) {
      this.endedAt = new Date();
    }
  }
});


// METHODS


/**
 * Check if user is host
 */
roomSchema.methods.isHost = function(userId) {
  return this.hostId.toString() === userId.toString();
};

/**
 * Check if user is co-host
 */
roomSchema.methods.isCoHost = function(userId) {
  return this.coHosts.some(id => id.toString() === userId.toString());
};

/**
 * Check if user has permission
 */
roomSchema.methods.hasPermission = function(userId, permission) {
  const participant = this.participants.find(
    p => p.userId === userId  // Both are strings now, no .toString() needed
  );
  
  if (!participant) return false;
  if (participant.role === 'host') return true;
  if (participant.role === 'cohost' || participant.role === 'co-host') return true;
  
  return participant.permissions[permission] || false;
};

/**
 * Get participant by userId
 */
roomSchema.methods.getParticipant = function(userId) {
  return this.participants.find(
    p => p.userId === userId  // Both are strings now, no .toString() needed
  );
};

/**
 * Update participant last active
 */
roomSchema.methods.updateParticipantActivity = function(userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.lastActive = new Date();
  }
};


// STATICS


/**
 * Find active rooms with participants
 */
roomSchema.statics.findActive = function() {
  return this.find({ status: { $in: ['lobby', 'active'] } })
    .sort({ 'stats.peakParticipants': -1 })
    .limit(50);
};

/**
 * Generate unique room code
 */
roomSchema.statics.generateRoomCode = async function(roomType = 'custom') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const typePrefixMap = {
    movie: 'V',
    music: 'M',
    custom: 'C',
  };
  const prefix = typePrefixMap[String(roomType || '').toLowerCase()] || 'C';
  let code;
  let exists;
  
  do {
    code = prefix;
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    exists = await this.exists({ roomCode: code });
  } while (exists);
  
  return code;
};

module.exports = mongoose.model('Room', roomSchema);