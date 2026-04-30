const redisClient = require('../../config/redis');
const { createRedisKey } = require('../../utils/helpers');
const { SOCKET_RATE_LIMITS, REDIS_KEYS } = require('../../utils/constants');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const socketRateLimiter = (eventName) => {
  return async (socket, next) => {
    try {
      const limit = SOCKET_RATE_LIMITS[eventName] || SOCKET_RATE_LIMITS.DEFAULT;
      const key = createRedisKey(REDIS_KEYS.SOCKET_RATE_LIMIT, eventName, socket.userId);
      const now = Date.now();
      const windowStart = now - (limit.window * 1000);

      // Atomic operation using Lua
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local windowStart = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        
        redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
        redis.call('ZADD', key, now, now)
        local count = redis.call('ZCARD', key)
        redis.call('EXPIRE', key, 60)
        
        return count
      `;

      const count = await redisClient.eval(luaScript, {
        keys: [key],
        arguments: [now.toString(), windowStart.toString(), limit.limit.toString()]
      });

      if (count > limit.limit) {
        // Don't leak internal event names in production
        const error = new Error(
          IS_PRODUCTION
            ? 'Rate limit exceeded. Please slow down.'
            : `Rate limit exceeded for ${eventName}`
        );
        error.data = { retryAfter: limit.window };
        return next(error);
      }

      next();

    } catch (error) {
      if (!IS_PRODUCTION) console.error('Socket rate limiter error:', error.message);
      next(); // Fail open — don't block sync if Redis hiccups
    }
  };
};

module.exports = { socketRateLimiter };