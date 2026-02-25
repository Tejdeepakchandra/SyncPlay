const { ROOM_CODE } = require('./constants');

/**
 * Generate unique room code
 */
const generateRoomCode = () => {
  let code = '';
  for (let i = 0; i < ROOM_CODE.LENGTH; i++) {
    code += ROOM_CODE.CHARS.charAt(Math.floor(Math.random() * ROOM_CODE.CHARS.length));
  }
  return code;
};

/**
 * Calculate latency and offset (NTP-style)
 */
const calculateLatency = (t1, t2, t3, t4) => {
  // t1: client send time
  // t2: server receive time
  // t3: server send time
  // t4: client receive time
  return {
    offset: ((t2 - t1) + (t3 - t4)) / 2,
    delay: (t4 - t1) - (t3 - t2)
  };
};

/**
 * Generate unique event ID
 */
const generateEventId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get drift correction strategy
 */
const getCorrectionStrategy = (drift) => {
  const absDrift = Math.abs(drift);
  
  if (absDrift < 0.15) {
    return { action: 'ignore', reason: 'within tolerance' };
  } else if (absDrift < 0.4) {
    const rate = drift > 0 ? 0.98 : 1.02;
    return { 
      action: 'rate-adjust', 
      rate,
      reason: 'smooth correction'
    };
  } else if (absDrift < 1.5) {
    return { 
      action: 'gradual', 
      steps: Math.ceil(absDrift * 2),
      reason: 'gradual correction'
    };
  } else {
    return { 
      action: 'hard-seek', 
      reason: 'large drift detected'
    };
  }
};

/**
 * Calculate adaptive buffer based on latency
 */
const calculateAdaptiveBuffer = (latencyMs) => {
  if (latencyMs < 150) return 800;
  if (latencyMs < 400) return 1200;
  return 2000;
};

/**
 * Sanitize user input
 */
const sanitizeInput = (input) => {
  if (!input) return input;
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove HTML tags
    .substring(0, 500);    // Limit length
};

/**
 * Create Redis key
 */
const createRedisKey = (prefix, ...parts) => {
  return `${prefix}${parts.join(':')}`;
};

/**
 * Parse user agent for device info
 */
const parseUserAgent = (userAgent) => {
  const isMobile = /mobile/i.test(userAgent);
  const isTablet = /tablet|ipad/i.test(userAgent);
  const isIOS = /iphone|ipad|ipod/i.test(userAgent);
  const isAndroid = /android/i.test(userAgent);
  
  return {
    isMobile: isMobile || isTablet,
    isTablet,
    isIOS,
    isAndroid,
    browser: getBrowser(userAgent),
    os: getOS(userAgent)
  };
};

/**
 * Simple browser detection
 */
const getBrowser = (ua) => {
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return 'Unknown';
};

/**
 * Simple OS detection
 */
const getOS = (ua) => {
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac')) return 'macOS';
  if (ua.includes('Linux')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iOS')) return 'iOS';
  return 'Unknown';
};

module.exports = {
  generateRoomCode,
  calculateLatency,
  generateEventId,
  getCorrectionStrategy,
  calculateAdaptiveBuffer,
  sanitizeInput,
  createRedisKey,
  parseUserAgent
};