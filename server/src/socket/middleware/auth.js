const { Clerk } = require('@clerk/clerk-sdk-node');
const User = require('../../models/mongodb/User');

const clerk = new Clerk({ secretKey: process.env.CLERK_SECRET_KEY });

/**
 * Generate consistent guest ID for socket
 */
const generateGuestId = (socket) => {
  const ip = socket.handshake.address;
  const ua = socket.handshake.headers['user-agent'] || 'unknown';
  const hash = require('crypto').createHash('md5').update(ip + ua).digest('hex');
  return `guest-${hash.substring(0, 8)}`;
};

/**
 * Socket authentication middleware
 * Uses Clerk JWT token for authenticated users
 */
const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      // Guest mode
      socket.userId = generateGuestId(socket);
      socket.userRole = 'guest';
      socket.isGuest = true;
      return next();
    }

    // Verify Clerk JWT token
    try {
      const session = await clerk.sessions.verifySession({
        sessionId: token,
        token
      });
      
      if (session) {
        const user = await User.findOne({ clerkId: session.userId });
        
        if (user) {
          socket.userId = user._id.toString();
          socket.clerkId = session.userId;
          socket.userRole = 'user';
          socket.isGuest = false;
          socket.username = user.username;
          socket.displayName = user.displayName;
          
          // Update online status
          await User.findByIdAndUpdate(user._id, { 
            lastActive: new Date(), 
            isOnline: true 
          });
        } else {
          // User not synced yet
          socket.userId = generateGuestId(socket);
          socket.userRole = 'guest';
          socket.isGuest = true;
        }
      } else {
        socket.userId = generateGuestId(socket);
        socket.userRole = 'guest';
        socket.isGuest = true;
      }
    } catch (err) {
      console.error('Socket token verification error:', err.message);
      socket.userId = generateGuestId(socket);
      socket.userRole = 'guest';
      socket.isGuest = true;
    }
    
    next();
  } catch (error) {
    console.error('Socket auth error:', error);
    socket.userId = generateGuestId(socket);
    socket.userRole = 'guest';
    socket.isGuest = true;
    next();
  }
};

module.exports = { authenticateSocket };