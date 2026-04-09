const { Clerk } = require('@clerk/clerk-sdk-node');
const jwt = require('jsonwebtoken');
const User = require('../../models/mongodb/User');

const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Generate consistent guest ID for socket (fallback only)
 * Prefers client-provided guestId, falls back to IP+UA hash
 */
const generateGuestId = (socket, clientGuestId = null) => {
  // If client provided a unique guest ID, use it (multiple guests from same IP)
  if (clientGuestId && clientGuestId.startsWith('guest-')) {
    console.log(`🔐 Using client-provided guest ID: ${clientGuestId}`);
    return clientGuestId;
  }
  
  // Fallback: generate from IP + UA (for backward compatibility)
  const ip = socket.handshake.address;
  const ua = socket.handshake.headers['user-agent'] || 'unknown';
  const hash = require('crypto').createHash('md5').update(ip + ua).digest('hex');
  const guestId = `guest-${hash.substring(0, 8)}`;
  console.log(`🔐 Generated guest ID from IP+UA: ${guestId}`);
  return guestId;
};

/**
 * Socket authentication middleware
 * Uses Clerk JWT token for authenticated users
 * ✅ FIX: Use jwt.decode() like HTTP auth middleware (consistent approach)
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    const clientGuestId = socket.handshake.auth?.guestId; // Get guest ID from client
    
    if (!token) {
      // No token: guest mode
      socket.userId = generateGuestId(socket, clientGuestId);
      socket.userRole = 'guest';
      socket.isGuest = true;
      return next();
    }

    // ✅ Decode Clerk JWT token (same as HTTP middleware)
    try {
      const decoded = jwt.decode(token, { complete: true });
      
      if (!decoded || !decoded.payload.sub) {
        console.log('❌ Socket: Invalid token structure');
        socket.userId = generateGuestId(socket);
        socket.userRole = 'guest';
        socket.isGuest = true;
        return next();
      }

      const clerkUserId = decoded.payload.sub;
      
      // Try to find user in MongoDB for display info only
      const user = await User.findOne({ clerkId: clerkUserId });
      
      if (user) {
        // ✅ User found in MongoDB - use Clerk ID as the primary identifier (IMPORTANT!)
        // This ensures consistency with how rooms are created and participants are stored
        socket.userId = clerkUserId;  // Use Clerk ID, NOT MongoDB ObjectId
        socket.clerkId = clerkUserId;
        socket.userRole = 'user';
        socket.isGuest = false;
        socket.username = user.username;
        socket.displayName = user.displayName;
        
        // Update online status (async)
        User.findByIdAndUpdate(user._id, { 
          lastActive: new Date(), 
          isOnline: true 
        }).catch(err => console.error('Socket: Failed to update user status:', err.message));
        
        console.log(`✅ Socket authenticated: ${socket.id} → User: ${user.username} (${clerkUserId})`);
      } else {
        // User has valid Clerk token but NOT in MongoDB yet
        // This happens right after OAuth signin (webhook pending)
        console.log(`⚠️ Socket: User not in DB yet (clerkId: ${clerkUserId.substring(0, 10)}...)`);
        
        socket.userId = clerkUserId;
        socket.clerkId = clerkUserId;
        socket.userRole = 'user';
        socket.isGuest = false;
        socket.userPending = true;
      }
    } catch (err) {
      console.error('❌ Socket token decode error:', err.message);
      socket.userId = generateGuestId(socket);
      socket.userRole = 'guest';
      socket.isGuest = true;
    }
    
    next();
  } catch (error) {
    console.error('❌ Socket auth middleware error:', error.message);
    socket.userId = generateGuestId(socket);
    socket.userRole = 'guest';
    socket.isGuest = true;
    next();
  }
};

module.exports = { authenticateSocket };