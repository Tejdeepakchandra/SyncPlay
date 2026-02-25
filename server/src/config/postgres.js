// postgres connection

const {Pool} = require('pg');

const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URI,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000, // Increased timeout for direct connection
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000
})

// Non-blocking connection check (doesn't block server startup)
setTimeout(() => {
    pgPool.query('SELECT NOW()', (err, result) => {
        if(err){
            console.log("⚠️  PostgreSQL connection check failed:", err.message);
        }
        else{
            console.log("✅ PostgreSQL connected successfully");
        }
    });
}, 1000);

pgPool.on('error', (err)=>{
    console.log("Supabase PostgreSQL error:", err.message);
})

module.exports = pgPool;

// Don't exit the process on connection failure - Redis and MongoDB still work
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});