const redisClient = require('../config/redis');
const { createRedisKey } = require('../utils/helpers');
const { REDIS_KEYS, RATE_LIMITS } = require('../utils/constants');


const rateLimiter = (limitType) => {
  return async (req, res, next) => {
    try {
      const userId = req.userId || req.ip;
      
      // Get limit config
      const limit = RATE_LIMITS[limitType];
      if (!limit) {
        console.error(`Rate limit type "${limitType}" not found`);
        return next(); // Fail open if misconfigured
      }
      
      const key = createRedisKey(REDIS_KEYS.RATE_LIMIT, limitType, userId);
      const now = Date.now();
      const windowStart = now - (limit.window * 1000);
      
      // Use sorted set to track timestamps
      await redisClient.zAdd(key, [{ score: now, value: `${now}` }]);
      
      // Remove old entries
      await redisClient.zRemRangeByScore(key, 0, windowStart);
      
      // Count requests in window
      const count = await redisClient.zCard(key);
      
      // Set expiry
      await redisClient.expire(key, limit.window);
      
      if (count > limit.limit) {
        return res.status(429).json({
          success: false,
          message: `Too many ${limitType} requests. Try again later.`,
          retryAfter: limit.window
        });
      }
      
      next();
      
    } catch (error) {
      console.error('Rate limiter error:', error);
      // Fail open - allow request if rate limiter fails
      next();
    }
  };
};

module.exports = { rateLimiter };