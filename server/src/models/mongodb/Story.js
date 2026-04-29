const mongoose = require('mongoose');

/**
 * Story Model
 * Instagram-style stories for rooms
 * Auto-expire after room ends + 1 hour
 */
const storySchema = new mongoose.Schema({
  userId: {
    type: String,  // Clerk user ID
    required: true,
    index: true
  },
  username: String,
  displayName: String,
  avatar: String,
  
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: false,
    default: null,
    index: true
  },
  roomName: String,
  roomCode: String,
  roomType: {
    type: String,
    default: null,
  },
  ctaLabel: {
    type: String,
    default: null,
  },
  ctaPath: {
    type: String,
    default: null,
  },
  
  // Story content
  type: {
    type: String,
    enum: ['photo', 'video', 'text', 'live', 'recap', 'moment'],
    required: true
  },
  mediaUrl: String,      // Cloudinary URL
  thumbnailUrl: String,
  textContent: {
    type: String,
    maxlength: 300,
    default: null,
  },
  backgroundColor: {
    type: String,
    default: null,
  },
  storyDuration: {
    type: Number,
    default: 5,
  },
  caption: {
    type: String,
    maxlength: 200
  },
  
  // For live stories
  liveData: {
    currentTimestamp: Number,
    participantCount: Number,
    isActive: Boolean
  },
  
  // For recap stories
  recapData: {
    moments: [{
      timestamp: Number,
      type: String,
      preview: String
    }],
    duration: Number,
    participantCount: Number
  },
  
  // Participants tagged
  participants: [{
    userId: String,  // Clerk user ID
    username: String,
    avatar: String
  }],
  
  // Engagement
  views: [{
    userId: String,  // Clerk user ID
    viewedAt: {
      type: Date,
      default: Date.now
    }
  }],
  viewCount: {
    type: Number,
    default: 0
  },
  reactions: [{
    userId: String,  // Clerk user ID
    username: String,
    displayName: String,
    reaction: String,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  replies: [{
    userId: String,
    username: String,
    displayName: String,
    text: {
      type: String,
      maxlength: 250,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  
  // Expiry
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index
  }
}, {
  timestamps: true
});

// Indexes
storySchema.index({ userId: 1, createdAt: -1 });
storySchema.index({ roomId: 1 });
storySchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Story', storySchema);