const e = require('express');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({

    clerkId: {
        type : String,
        unique: true,
        required: true,
        sparse: true,
        index: true
    },

    username: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        trim: true,
        minlength: 3,
        maxlength: 30,
    },
    displayName: {
        type: String,
        required: true,
        maxlength: 50,
    },
    email: {
        type: String,
        unique: true,
        required: true,
        lowercase: true,
        sparse: true,
    },

    avatar: {
        type: String,
        default: 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
    },
    bio: {
        type: String,
        maxlength: 200,
        default: '',
    },
    preferences: {
        theme: {
            type: String,
            enum : ['light', 'dark'],
            default: 'dark'
        },
        notifications: {
            email: {type: Boolean, default: true},
            push: {type: Boolean, default: true},
            storyRemainders: {type: Boolean, default: true},
        },
        autoStory: {
            type: Boolean,
            default: false
        }
    },

    stats:{
        roomsCreated: { type: Number, default: 0 },
        roomsJoined: { type: Number, default: 0 },
        watchTimeMinutes: { type: Number, default: 0 },
        friendsCount: { type: Number, default: 0 },
        momentCreated: { type: Number, default: 0 },
        storiesCreated: { type: Number, default: 0 },
    },

    friends: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending'
        },

        createdAt: {
            type: Date,
            default: Date.now
        }
    }],

    lastActive: {
        type: Date,
        default: Date.now
    },

    isOnline: {
        type: Boolean,
        default: false
    },

    currentRoom:{
        type: String,                 //  type: mongoose.Schema.Types.ObjectId,ref: 'Room'
        default: null
    }
},
 { timestamps: true }
)


userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({'friends.userId': 1});
userSchema.index({ lastActive: -1 });

userSchema.virtual('friendCount').get(function() {
    return this.friends.filter(friend => friend.status === 'accepted').length;
});

module.exports = mongoose.model('User', userSchema);