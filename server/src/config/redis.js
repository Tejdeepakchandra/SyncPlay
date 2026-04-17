const redis = require('redis');

const redisUrl = process.env.REDIS_URI || process.env.REDIS_URL || 'redis://localhost:6379';
let redisTarget = 'localhost:6379';
try {
    const parsed = new URL(redisUrl);
    redisTarget = parsed.host;
} catch {
    // Keep default diagnostics target when URL parsing fails.
}

console.log('[REDIS] Source:', process.env.REDIS_URI ? 'REDIS_URI' : (process.env.REDIS_URL ? 'REDIS_URL' : 'default localhost'));
console.log('[REDIS] Target:', redisTarget);

const redisClient = redis.createClient({
    url: redisUrl,
    socket:{
        rejectUnauthorized: false
    }
})

redisClient.on('error', (err)=>{
        console.log("Redis Cloud Error:",err);
})

redisClient.on('connect', ()=>{
    console.log("Connected to Redis Cloud successfully");
})

redisClient.on('ready',()=>{
    console.log("Redis Cloud ready ");
})

redisClient.on('end',()=>{
    console.log("Redis disconnected");
})

process.on('SIGINT', async ()=>{
    await redisClient.quit();
    console.log('Redis connection closed');
})

module.exports = redisClient;