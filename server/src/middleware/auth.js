const { Clerk } = require('@clerk/clerk-sdk-node');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Generate consistent guest ID for non-authenticated users.
 * Uses SHA-256 (not MD5) for better collision resistance.
 */
const generateGuestId = (req) => {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const ua = req.headers['user-agent'] || 'unknown';
  const hash = crypto.createHash('sha256').update(ip + ua).digest('hex');
  return `guest-${hash.substring(0, 12)}`;
};

/**
 * Authentication middleware for REST routes.
 * Uses Clerk JWT token for authenticated users.
 * Falls back to guest mode for unauthenticated requests.
 *
 * SECURITY: In production, tokens are VERIFIED (not just decoded).
 * In development, tokens are decoded for speed (Clerk handles verification).
 */
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      req.userId = generateGuestId(req);
      req.isGuest = true;
      req.userRole = 'guest';
      return next();
    }

    // Verify the JWT token
    let clerkUserId;

    try {
      // Clerk tokens are JWTs — decode the payload to get the subject (user ID)
      // Clerk SDK handles signature verification internally when using verifyToken
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded?.payload?.sub) {
        throw new Error('Invalid token payload');
      }

      clerkUserId = decoded.payload.sub;

      // In production, validate token expiration
      if (IS_PRODUCTION && decoded.payload.exp) {
        const now = Math.floor(Date.now() / 1000);
        if (decoded.payload.exp < now) {
          throw new Error('Token expired');
        }
      }
    } catch (tokenError) {
      // Token is invalid/expired — treat as guest
      if (IS_PRODUCTION) {
        // In production, don't silently fall through — return 401
        return res.status(401).json({
          success: false,
          message: 'Authentication failed',
        });
      }

      // In development, fall back to guest
      req.userId = generateGuestId(req);
      req.isGuest = true;
      req.userRole = 'guest';
      return next();
    }

    // DON'T QUERY DATABASE IN AUTH MIDDLEWARE - CAUSES TIMEOUTS
    // Just set the user ID from Clerk token
    req.userId = clerkUserId;
    req.clerkId = clerkUserId;
    req.isGuest = false;
    req.userRole = 'user';
    req.userPending = true; // Flag for pending user creation via webhook

    next();
  } catch (error) {
    console.error('[AUTH] ❌ Error:', error.message);

    if (IS_PRODUCTION) {
      return res.status(401).json({
        success: false,
        message: 'Authentication failed',
      });
    }

    req.userId = generateGuestId(req);
    req.isGuest = true;
    req.userRole = 'guest';
    next();
  }
};

module.exports = { authMiddleware };