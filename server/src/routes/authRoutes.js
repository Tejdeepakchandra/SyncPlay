const express = require('express');
const router = express.Router();
const User = require('../models/mongodb/User');

/**
 * POST /api/auth/sync
 * Called by the client after Clerk sign-in to create or update the user in MongoDB.
 * req.userId is set by the auth middleware (Clerk user ID).
 */
router.post('/sync', async (req, res) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const { email, username, displayName, imageUrl } = req.body;
    const clerkId = req.userId;

    if (!clerkId) {
      return res.status(400).json({ success: false, message: 'Missing clerkId' });
    }

    const safeUsername = (username || email?.split('@')[0] || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .substring(0, 30) || 'user';

    // ✅ FIX: Use find first to avoid email conflict during update
    // MongoDB throws ConflictingUpdateOperators when updating unique-indexed fields with $set + $setOnInsert
    const existingUser = await User.findOne({ clerkId });

    let user;
    if (existingUser) {
      // User exists: only update non-conflicting fields
      user = await User.findOneAndUpdate(
        { clerkId },
        {
          $set: {
            displayName: displayName || existingUser.displayName || 'User',
            avatar: imageUrl || existingUser.avatar,
            lastActive: new Date(),
            isOnline: true,
          },
        },
        { returnDocument: 'after' }
      );
    } else {
      // New user: create with all fields (no $setOnInsert conflict)
      user = await User.create({
        clerkId,
        email: email?.toLowerCase() || `user-${clerkId}@syncplay.local`,
        username: safeUsername,
        displayName: displayName || safeUsername || 'User',
        avatar: imageUrl || 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
        avatar_emoji: '🧑',
        preferences: {
          theme: 'midnight-cinema',
          notifications: {
            email: true,
            push: true,
            storyRemainders: true,
            roomInvites: true,
            friendRequests: true,
            messages: true,
            marketing: false,
          },
          privacy: {
            showOnline: true,
            showActivity: true,
            allowInvites: true,
          },
          autoStory: false,
        },
        stats: {
          roomsCreated: 0,
          roomsJoined: 0,
          watchTimeMinutes: 0,
          watchedStreakDays: 0,
          friendsCount: 0,
          momentCreated: 0,
          storiesCreated: 0,
        },
        friends: [],
        createdAt: new Date(),
      });
    }

    return res.json({
      success: true,
      user: {
        id: user._id,
        clerkId: user.clerkId,
        username: user.username,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('❌ /api/auth/sync error:', error.message);
    
    // Handle duplicate key errors (race condition: two tabs sync simultaneously)
    if (error.code === 11000 || error.code === 40) {
      const existing = await User.findOne({ clerkId: req.userId });
      if (existing) {
        return res.json({
          success: true,
          user: {
            id: existing._id,
            clerkId: existing.clerkId,
            username: existing.username,
            displayName: existing.displayName,
          },
        });
      }
    }
    
    return res.status(500).json({ success: false, message: 'Failed to sync user', error: error.message });
  }
});

/**
 * GET /api/auth/me
 * Returns the current user's profile from MongoDB.
 */
router.get('/me', async (req, res) => {
  try {
    if (req.isGuest) {
      return res.json({
        success: true,
        user: null,
        isGuest: true,
        guestId: req.userId,
      });
    }

    const user = await User.findOne({ clerkId: req.userId }).select('-__v');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
});

module.exports = router;
