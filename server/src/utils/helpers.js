const { ROOM_CODE, REDIS_KEYS } = require('./constants');
const crypto = require('crypto');


 // Generate unique room code

const generateRoomCode = () => {
  let code = '';
  for (let i = 0; i < ROOM_CODE.LENGTH; i++) {
    code += ROOM_CODE.CHARS.charAt(Math.floor(Math.random() * ROOM_CODE.CHARS.length));
  }
  return code;
};


 //Calculate latency and offset (NTP-style)

const calculateLatency = (t1, t2, t3, t4) => {
  return {
    offset: ((t2 - t1) + (t3 - t4)) / 2,
    delay: (t4 - t1) - (t3 - t2)
  };
};

 //Generate unique event ID

const generateEventId = () => {
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
};


 // Generate consistent guest ID
 
const generateGuestId = (ip, userAgent) => {
  const hash = crypto.createHash('md5').update(ip + userAgent).digest('hex');
  return `guest-${hash.substring(0, 8)}`;
};


 // Create Redis key
 
const createRedisKey = (prefix, ...parts) => {
  return `${prefix}${parts.join(':')}`;
};


 //Sanitize user input

const sanitizeInput = (input) => {
  if (!input) return input;
  return input
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 500);
};

module.exports = {
  generateRoomCode,
  calculateLatency,
  generateEventId,
  generateGuestId,
  createRedisKey,
  sanitizeInput
};