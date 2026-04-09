const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/mongodb/User');

const router = express.Router();

/**
 * GET /api/users/me
 * Get current authenticated user
 */
router.get('/me', async (req, res) => {
  // Just return auth info from middleware - NO database query
  // This endpoint should be nearly instant
  
  if (req.isGuest) {
    return res.json({
      success: true,
      data: {
        isGuest: true,
        userId: req.userId
      }
    });
  }

  // For authenticated users, return minimal data from token
  // Don't query DB - let it happen in background via webhook
  res.json({
    success: true,
    data: {
      userId: req.userId,
      clerkId: req.clerkId,
      isAuthenticated: true,
      isPending: req.userPending || false
    }
  });
});

/**
 * PUT /api/users/me
 * Update current user profile
 */
router.put('/me', authMiddleware, async (req, res, next) => {
  try {
    if (req.isGuest) {
      return res.status(401).json({
        success: false,
        message: 'Guest users cannot update profile'
      });
    }

    const { displayName, bio, preferences } = req.body;
    
    const updateData = {};
    if (displayName) updateData.displayName = displayName;
    if (bio !== undefined) updateData.bio = bio;
    if (preferences) updateData.preferences = preferences;

    const user = await User.findByIdAndUpdate(
      req.userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-friends -__v');

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/users/:username
 * Get user by username
 */
router.get('/:username', async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('username displayName avatar bio stats lastActive isOnline')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;