const mongoose = require('mongoose');

/**
 * Moment Model
 * Stores key moments, reactions, bookmarks
 * Used for highlights and recap generation
 */
const momentSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: String,
  
  // Moment data
  timestamp: {
    type: Number, // Seconds in video
    required: true
  },
  type: {
    type: String,
    enum: [
      'reaction',      // Quick emoji reaction
      'comment',       // Text comment
      'bookmark',      // User bookmark
      'reaction_spike', // Multiple reactions in short time
      'comment_cluster', // Multiple comments
      'ai_highlight',   // Auto-detected highlight
      'group_photo'     // Captured group moment
    ],
    required: true
  },
  
  // Content based on type
  content: {
    reaction: String,     // Emoji for reactions
    text: String,         // For comments
    intensity: Number,    // 0-1 for spikes/highlights
    count: Number         // Number of reactions in spike
  },
  
  // Participants involved (for spikes/clusters)
  participants: [{
    userId: mongoose.Schema.Types.ObjectId,
    username: String
  }],
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // For highlights
  isHighlight: {
    type: Boolean,
    default: false
  },
  highlightScore: {
    type: Number,
    min: 0,
    max: 1,
    default: 0
  },
  
  // Expiry (moments expire after 7 days)
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    index: { expires: 0 } // TTL index
  }
}, {
  timestamps: true
});

// Indexes
momentSchema.index({ roomId: 1, timestamp: 1 });
momentSchema.index({ isHighlight: 1 });
momentSchema.index({ 'participants.userId': 1 });

module.exports = mongoose.model('Moment', momentSchema);