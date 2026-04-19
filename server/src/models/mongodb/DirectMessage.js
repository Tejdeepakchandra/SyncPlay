const mongoose = require('mongoose');

const buildConversationKey = (senderId, recipientId) => {
  const [a, b] = [String(senderId || ''), String(recipientId || '')].sort();
  return `${a}::${b}`;
};

const directMessageSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    recipientId: {
      type: String,
      required: true,
      index: true,
    },
    conversationKey: {
      type: String,
      required: true,
      index: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    readAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

directMessageSchema.pre('validate', function preValidate() {
  this.conversationKey = buildConversationKey(this.senderId, this.recipientId);
});

directMessageSchema.statics.buildConversationKey = buildConversationKey;

directMessageSchema.index({ conversationKey: 1, createdAt: -1 });

directMessageSchema.index({ recipientId: 1, senderId: 1, readAt: 1 });

module.exports = mongoose.model('DirectMessage', directMessageSchema);
