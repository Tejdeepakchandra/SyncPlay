const redis = require('redis');

const redisUrl = process.env.REDIS_URI || process.env.REDIS_URL || 'redis://localhost:6379';
let redisTarget = 'localhost:6379';
try {
    const parsed = new URL(redisUrl);
    redisTarget = parsed.host;
} catch {
    // Keep default diagnostics target when URL parsing fails.
}


const redisClient = redis.createClient({
    url: redisUrl,
    socket:{
        rejectUnauthorized: false
    }
})

redisClient.on('error', (err)=>{
})

redisClient.on('connect', ()=>{
})

redisClient.on('ready',()=>{
})

redisClient.on('end',()=>{
})

process.on('SIGINT', async ()=>{
    await redisClient.quit();
})

module.exports = redisClient;