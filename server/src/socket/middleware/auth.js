const jwt = require('jsonwebtoken');
const { generateGuestId } = require('../../utils/helpers');


const authenticateSocket = (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      // Generate consistent guest ID from IP + UA
      const ip = socket.handshake.address;
      const ua = socket.handshake.headers['user-agent'] || 'unknown';
      socket.userId = generateGuestId(ip, ua);
      socket.userRole = 'guest';
      socket.isGuest = true;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    socket.userRole = decoded.role || 'user';
    socket.isGuest = false;
    
    next();
  } catch (error) {
    // Invalid token - treat as guest
    const ip = socket.handshake.address;
    const ua = socket.handshake.headers['user-agent'] || 'unknown';
    socket.userId = generateGuestId(ip, ua);
    socket.userRole = 'guest';
    socket.isGuest = true;
    next();
  }
};

module.exports = { authenticateSocket };