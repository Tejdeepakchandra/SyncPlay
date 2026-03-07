const jwt = require('jsonwebtoken');


 //Generate consistent guest ID

const generateGuestId = (req) => {
  // Use IP + user agent to create consistent guest identity
  const ip = req.ip || req.connection.remoteAddress;
  const ua = req.headers['user-agent'] || 'unknown';
  const hash = require('crypto').createHash('md5').update(ip + ua).digest('hex');
  return `guest-${hash.substring(0, 8)}`;
};


 //Authentication middleware for REST routes
 
const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      // Consistent guest ID based on IP + UA
      req.userId = generateGuestId(req);
      req.isGuest = true;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.isGuest = false;
    
    next();
  } catch (error) {
    req.userId = generateGuestId(req);
    req.isGuest = true;
    next();
  }
};

module.exports = { authMiddleware };