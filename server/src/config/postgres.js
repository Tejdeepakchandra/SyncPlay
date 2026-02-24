// postgres connection

const {Pool} = require('pg');

const pgPool = new Pool({
    connectionString: process.env.POSTGRES_URI,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000
})

pgPool.connect((err,client,release)=>{
    if(err){
        console.log("Supabase PostgreSQL connection error:", err.message);
        // Try again after a delay
        setTimeout(() => {
            pgPool.query('SELECT NOW()', (queryErr) => {
                if(queryErr) {
                    console.log("PostgreSQL retry failed:", queryErr.message);
                } else {
                    console.log("Supabase PostgreSQL connected successfully on retry");
                }
            });
        }, 2000);
    }
    else{
        console.log("Supabase PostgreSQL connected successfully");
        release();
    }
})

pgPool.on('error', (err)=>{
    console.log("Supabase PostgreSQL error:", err.message);
})

module.exports = pgPool;

// Don't exit the process on connection failure - Redis and MongoDB still work
process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection at:', promise, 'reason:', reason);
});