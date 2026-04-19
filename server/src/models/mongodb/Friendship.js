const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema(
  {
    requesterId: {
      type: String,
      required: true,
      index: true,
    },
    addresseeId: {
      type: String,
      required: true,
      index: true,
    },
    pairKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

friendshipSchema.index({ requesterId: 1, status: 1, createdAt: -1 });
friendshipSchema.index({ addresseeId: 1, status: 1, createdAt: -1 });

friendshipSchema.statics.buildPairKey = function buildPairKey(userA, userB) {
  return [String(userA), String(userB)].sort().join(':');
};

module.exports = mongoose.model('Friendship', friendshipSchema);
