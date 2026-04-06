const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  // Room reference
  roomCode: {
    type: String,
    required: true,
    index: true,
  },

  // User info
  userId: {
    type: String,  // Clerk user ID
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  displayName: {
    type: String,
    required: true,
  },
  avatar: {
    type: String,
    default: '😊',
  },

  // Message content
  text: {
    type: String,
    required: true,
    maxlength: 500,
    trim: true,
  },

  // Message metadata
  type: {
    type: String,
    enum: ['message', 'system', 'reaction'],
    default: 'message',
  },

  // For moment detection
  triggeredMoment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Moment',
    default: null,
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Compound index for room + time queries
chatMessageSchema.index({ roomCode: 1, createdAt: -1 });

// Auto-delete messages after 30 days (optional - for privacy)
chatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
