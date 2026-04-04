const { Clerk } = require('@clerk/clerk-sdk-node');
const jwt = require('jsonwebtoken');
const User = require('../models/mongodb/User');

const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Generate consistent guest ID for non-authenticated users
 */
const generateGuestId = (req) => {
  const ip = req.ip || req.connection.remoteAddress;
  const ua = req.headers['user-agent'] || 'unknown';
  const hash = require('crypto').createHash('md5').update(ip + ua).digest('hex');
  return `guest-${hash.substring(0, 8)}`;
};

/**
 * Authentication middleware for REST routes
 * Uses Clerk JWT token for authenticated users
 * Falls back to guest mode for unauthenticated requests
 */
const authMiddleware = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      req.userId = generateGuestId(req);
      req.isGuest = true;
      req.userRole = 'guest';
      return next();
    }

    // Decode and verify the JWT token from Clerk
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || !decoded.payload.sub) {
      req.userId = generateGuestId(req);
      req.isGuest = true;
      req.userRole = 'guest';
      return next();
    }

    const clerkUserId = decoded.payload.sub;
    
    // Try to find user in database with timeout
    let user;
    try {
      user = await Promise.race([
        User.findOne({ clerkId: clerkUserId }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Database query timeout')), 5000)
        )
      ]);
    } catch (dbErr) {
      user = null;
    }
    
    if (user) {
      req.userId = user._id.toString();
      req.clerkId = clerkUserId;
      req.isGuest = false;
      req.userRole = 'user';
      
      // Update last active (async, don't await)
      User.findByIdAndUpdate(user._id, { lastActive: new Date(), isOnline: true }).catch(() => {});
    } else {
      // User has valid Clerk token but NOT in our DB yet
      // This is normal after OAuth signin - webhook will create user soon
      req.userId = clerkUserId;
      req.clerkId = clerkUserId;
      req.isGuest = false;
      req.userRole = 'user';
      req.userPending = true; // Flag for pending user creation
    }
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    req.userId = generateGuestId(req);
    req.isGuest = true;
    req.userRole = 'guest';
    next();
  }
};

module.exports = { authMiddleware };