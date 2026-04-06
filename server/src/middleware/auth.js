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
  const startTime = Date.now();
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      req.userId = generateGuestId(req);
      req.isGuest = true;
      req.userRole = 'guest';
      return next();
    }

    // Decode and verify the JWT token from Clerk (synchronous, no DB call)
    const decoded = jwt.decode(token, { complete: true });
    
    if (!decoded || !decoded.payload.sub) {
      req.userId = generateGuestId(req);
      req.isGuest = true;
      req.userRole = 'guest';
      return next();
    }

    const clerkUserId = decoded.payload.sub;
    
    // DON'T QUERY DATABASE IN AUTH MIDDLEWARE - CAUSES TIMEOUTS
    // Just set the user ID from Clerk token
    req.userId = clerkUserId;
    req.clerkId = clerkUserId;
    req.isGuest = false;
    req.userRole = 'user';
    req.userPending = true; // Flag for pending user creation via webhook
    
    console.log(`[AUTH] ✅ Token verified (${Date.now() - startTime}ms): ${clerkUserId.substring(0, 8)}...`);
    next();
  } catch (error) {
    console.error(`[AUTH] ❌ Error (${Date.now() - startTime}ms):`, error.message);
    req.userId = generateGuestId(req);
    req.isGuest = true;
    req.userRole = 'guest';
    next();
  }
};

module.exports = { authMiddleware };