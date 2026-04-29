// postgres connection

const { Pool } = require('pg');

const parseBooleanEnv = (value, fallback = true) => {
    if (typeof value !== 'string') return fallback;

    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;

    return fallback;
};

const connectionString = process.env.POSTGRES_POOLER_URI || process.env.POSTGRES_URI;
const useSsl = parseBooleanEnv(process.env.POSTGRES_SSL, true);
const usingPoolerUri = Boolean(process.env.POSTGRES_POOLER_URI);

let postgresTargetHost = 'unknown';
try {
    postgresTargetHost = connectionString ? new URL(connectionString).hostname : 'missing';
} catch (_err) {
    postgresTargetHost = 'invalid-uri';
}

if (!usingPoolerUri) {
}

const pgPool = new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
    keepAlive: true
});

// Non-blocking connection check (doesn't block server startup)
setTimeout(() => {
    pgPool.query('SELECT NOW()', (err, result) => {
        if (err) {
            if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH') {
            }
        }
        else {
        }
    });
}, 1000);

pgPool.on('error', (err) => {
    if (err.code === 'ENOTFOUND' || err.code === 'ENETUNREACH' || err.code === 'ETIMEDOUT') {
    }
})

module.exports = pgPool;

// Don't exit the process on connection failure - Redis and MongoDB still work
process.on('unhandledRejection', (reason, promise) => {
});