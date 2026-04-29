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
    avatar_emoji: {
        type: String,
        default: '🧑',
        maxlength: 8,
    },
    bio: {
        type: String,
        maxlength: 200,
        default: '',
    },
    preferences: {
        theme: {
            type: String,
            enum : ['midnight-cinema', 'sunset-lounge', 'arctic-frost', 'dark', 'light'],
            default: 'midnight-cinema'
        },
        notifications: {
            email: {type: Boolean, default: true},
            push: {type: Boolean, default: true},
            storyRemainders: {type: Boolean, default: true},
            roomInvites: { type: Boolean, default: true },
            friendRequests: { type: Boolean, default: true },
            messages: { type: Boolean, default: true },
            marketing: { type: Boolean, default: false },
        },
        privacy: {
            showOnline: { type: Boolean, default: true },
            showActivity: { type: Boolean, default: true },
            allowInvites: { type: Boolean, default: true },
        },
        discovery: {
            movieGenres: [{ type: String }],
            musicGenres: [{ type: String }],
            languages: [{ type: String }],
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
        watchedStreakDays: { type: Number, default: 0 },
        friendsCount: { type: Number, default: 0 },
        momentCreated: { type: Number, default: 0 },
        storiesCreated: { type: Number, default: 0 },
        cupsWon: { type: Number, default: 0 },
    },

    favorites: {
        rooms: [{
            roomCode: { type: String, trim: true, uppercase: true },
            name: { type: String, trim: true, maxlength: 120 },
            type: { type: String, enum: ['movie', 'music', 'custom'] },
            addedAt: { type: Date, default: Date.now },
            _id: false,
        }],
        moments: [{
            momentId: { type: String, trim: true },
            title: { type: String, trim: true, maxlength: 120 },
            roomCode: { type: String, trim: true, uppercase: true },
            addedAt: { type: Date, default: Date.now },
            _id: false,
        }],
        activities: [{
            activityId: { type: String, trim: true },
            label: { type: String, trim: true, maxlength: 160 },
            type: { type: String, trim: true, maxlength: 40 },
            videoUrl: String,           // Final merged highlights video URL
            thumbnailUrl: String,       // Thumbnail for activity card
            roomCode: String,           // Original room code
            clipCount: Number,          // How many moments were captured
            duration: Number,           // Total duration in seconds
            addedAt: { type: Date, default: Date.now },
            _id: false,
        }],
    },

    friends: [{
        userId: {
            type: String
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


userSchema.index({'friends.userId': 1});
userSchema.index({ lastActive: -1 });

userSchema.virtual('friendCount').get(function() {
    return this.friends.filter(friend => friend.status === 'accepted').length;
});

module.exports = mongoose.model('User', userSchema);