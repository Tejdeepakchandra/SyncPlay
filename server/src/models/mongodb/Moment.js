const mongoose = require('mongoose');

/**
 * Moment Model — Captures key moments in watch parties
 */
const momentSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  roomCode: {
    type: String,
    required: true,
    index: true
  },
  
  // Moment timing
  timestamp: {
    type: Number,
    required: true,
    min: 0
  },
  duration: {
    type: Number,
    default: 15,
    min: 10,
    max: 120
  },
  
  // Clip time range in video seconds (for overlap detection & merge)
  clipRange: {
    startTime: { type: Number },  // e.g., 595 (9:55)
    endTime: { type: Number },    // e.g., 610 (10:10)
  },
  
  // Cloudinary direct upload reference
  cloudinaryPublicId: String,
  
  // Who captured this moment
  capturedBy: {
    userId: String,
    isHost: { type: Boolean, default: true }
  },
  
  // If this moment was merged into another
  mergedInto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Moment'
  },
  
  // Moment type
  type: {
    type: String,
    enum: [
      'reaction_spike',
      'comment_cluster',
      'bookmark',
      'ai_highlight',
      'manual'
    ],
    required: true,
    index: true
  },
  
  // Intensity score (0-1)
  intensity: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.5
  },
  
  // Media source info
  mediaSource: {
    type: {
      type: String,
      enum: ['youtube', 'vimeo', 'local', 'screen', 'unknown'],
      default: 'unknown'
    },
    url: String,
    title: String,
    thumbnail: String,
    duration: Number
  },
  
  // Captured video data
  capturedVideo: {
    url: String,
    thumbnailUrl: String,
    webmUrl: String,
    mp4Url: String,
    duration: Number,
    size: Number,
    format: String,
    width: Number,
    height: Number
  },
  
  // Participants involved
  participants: [{
    userId: {
      type: String,  // Clerk user ID
    },
    username: String,
    displayName: String,
    avatar: String,
    reactionCount: {
      type: Number,
      default: 0
    }
  }],
  
  // Reactions data
  reactions: [{
    userId: String,  // Clerk user ID
    username: String,
    reaction: String,
    timestamp: Date,
    videoTimestamp: Number
  }],
  
  // Comments during this moment
  comments: [{
    userId: String,  // Clerk user ID
    username: String,
    text: String,
    timestamp: Date,
    videoTimestamp: Number
  }],
  
  // Statistics
  stats: {
    reactionCount: { type: Number, default: 0 },
    uniqueReactors: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    viewCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    saveCount: { type: Number, default: 0 }
  },
  
  // Story integration
  storyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Story'
  },
  
  // Sharing URLs
  shareUrls: {
    instagram: String,
    whatsapp: String,
    twitter: String,
    facebook: String,
    direct: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['detected', 'capturing', 'processing', 'ready', 'failed'],
    default: 'detected',
    index: true
  },
  
  // Error message if failed
  errorMessage: String,
  
  // Capture job ID
  captureJobId: String,
  
  // Expiry (moments expire after 30 days)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    index: { expires: 0 }
  }
}, {
  timestamps: true
});

// COMPOSITE INDEXES for fast queries
momentSchema.index({ roomCode: 1, type: 1, timestamp: 1 });
momentSchema.index({ roomId: 1, timestamp: 1 });
momentSchema.index({ type: 1, createdAt: -1 });
momentSchema.index({ 'stats.viewCount': -1 });
momentSchema.index({ createdAt: -1 });

// Virtual for moment age
momentSchema.virtual('age').get(function() {
  return Date.now() - this.createdAt;
});

// Method to check if moment is still valid
momentSchema.methods.isValid = function() {
  return this.expiresAt > new Date();
};

// Static method to find top moments in a room
momentSchema.statics.findTopMoments = function(roomId, limit = 10) {
  return this.find({ 
    roomId,
    status: 'ready',
    'capturedVideo.url': { $exists: true }
  })
  .sort({ intensity: -1, 'stats.viewCount': -1 })
  .limit(limit);
};

module.exports = mongoose.model('Moment', momentSchema);