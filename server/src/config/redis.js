const redis = require('redis');

const redisUrl = process.env.REDIS_URI || 'redis://localhost:6379';
console.log('Redis URL from env:', process.env.REDIS_URI ? 'Set' : 'Not set (using localhost)');

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