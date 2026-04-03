const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/mongodb/User');

const router = express.Router();

/**
 * GET /api/users/me
 * Get current authenticated user
 */
router.get('/me', async (req, res, next) => {
  console.log('🎯 ROUTE HANDLER /users/me CALLED');
  try {
    console.log('📍 GET /users/me handler executing');
    console.log('   userId:', req.userId);
    console.log('   isGuest:', req.isGuest);
    console.log('   clerkId:', req.clerkId);
    
    if (req.isGuest) {
      console.log('   👤 Returning guest user');
      return res.json({
        success: true,
        data: {
          isGuest: true,
          userId: req.userId
        }
      });
    }

    let user = await User.findById(req.userId)
      .select('-friends -__v')
      .lean();

    if (!user) {
      console.log('   ⚠️ User not found, attempting to fetch from Clerk and create');
      
      // Fallback: Try to create user from Clerk data if webhook missed it
      try {
        const { Clerk } = require('@clerk/clerk-sdk-node');
        const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });
        
        const clerkUser = await clerk.users.getUser(req.clerkId);
        console.log('   📝 Creating user from Clerk data');
        
        const newUser = new User({
          clerkId: req.clerkId,
          username: clerkUser.username || clerkUser.emailAddresses?.[0]?.emailAddress?.split('@')[0] || `user_${req.clerkId.slice(-6)}`,
          displayName: clerkUser.firstName 
            ? `${clerkUser.firstName} ${clerkUser.lastName || ''}`.trim()
            : clerkUser.username || 'User',
          email: clerkUser.emailAddresses?.[0]?.emailAddress,
          avatar: clerkUser.imageUrl || 'https://res.cloudinary.com/demo/image/upload/v1/avatar/default-avatar.png',
          lastActive: new Date(),
          isOnline: true
        });
        
        user = await newUser.save();
        console.log('   ✅ User created from Clerk data:', user._id);
      } catch (clerkerr) {
        console.error('   ❌ Failed to create user from Clerk:', clerkerr.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to initialize user account'
        });
      }
    }

    console.log('   ✅ User found:', user.clerkId, user.email);
    res.json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('   ⚠️ Error in /users/me:', error.message);
    next(error);
  }
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