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
    console.log('🔄 POST /auth/sync called');
    console.log('   clerkId:', req.userId);
    console.log('   body:', { email: req.body.email, username: req.body.username });
    
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

    console.log('   Upserting with:', { clerkId, email, username: safeUsername });

    const user = await User.findOneAndUpdate(
      { clerkId },
      {
        $set: {
          email: email?.toLowerCase(),
          username: safeUsername,
          displayName: displayName || safeUsername || 'User',
          avatar: imageUrl || 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
          lastActive: new Date(),
          isOnline: true,
        },
        $setOnInsert: {
          clerkId,
          email: email?.toLowerCase() || `user-${clerkId}@syncplay.local`,
          username: safeUsername,
          displayName: displayName || safeUsername || 'User',
          avatar: imageUrl || 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
          preferences: {
            theme: 'dark',
            notifications: { email: true, push: true, storyRemainders: true },
            autoStory: false,
          },
          stats: {
            roomsCreated: 0,
            roomsJoined: 0,
            watchTimeMinutes: 0,
            friendsCount: 0,
            momentCreated: 0,
            storiesCreated: 0,
          },
          friends: [],
          createdAt: new Date(),
        },
      },
      { upsert: true, returnDocument: 'after' } // Use returnDocument instead of deprecated new
    );

    console.log('✅ User synced:', user._id);

    res.json({
      success: true,
      user: {
        id: user._id,
        clerkId: user.clerkId,
        username: user.username,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('❌ Auth sync error:', error.message);
    console.error('   Full error:', error);
    
    // Handle duplicate key errors (race condition: two tabs sync simultaneously)
    if (error.code === 11000) {
      console.log('   Handling duplicate key - returning existing user');
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
    
    res.status(500).json({ success: false, message: 'Failed to sync user', error: error.message });
    res.status(500).json({ success: false, message: 'Failed to sync user' });
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
