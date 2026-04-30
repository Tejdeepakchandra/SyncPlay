const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');

// Load environment variables BEFORE any config that reads process.env
dotenv.config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// CONFIGURATION & DATABASES

const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const pgPool = require('./config/postgres');
const { setupSocketHandlers } = require('./socket');
const { authMiddleware } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rateLimiter');
const { startPresenceCleanup } = require('./jobs/presenceCleanup');
const { startMediaCleanupJob } = require('./jobs/mediaCleanup');
const { startRoomExpirationJob } = require('./jobs/roomExpirationJob');
const { clerkWebhook } = require('./controllers/authController');

// ═══════════════════════════════════════════════════
// VALIDATE REQUIRED ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════════════

const REQUIRED_ENV = ['MONGODB_URI', 'REDIS_URI', 'JWT_SECRET', 'CLERK_SECRET_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// Initialize Express
const app = express();
const server = http.createServer(app);

// Trust reverse proxy (Railway, Render, etc.)
if (IS_PRODUCTION && process.env.TRUST_PROXY) {
  app.set('trust proxy', parseInt(process.env.TRUST_PROXY, 10) || 1);
}

startPresenceCleanup();
startMediaCleanupJob();

// ═══════════════════════════════════════════════════
// CORS CONFIGURATION
// ═══════════════════════════════════════════════════

const DEFAULT_ALLOWED_ORIGINS = IS_PRODUCTION
  ? [] // In production, ONLY use CLIENT_URL — no localhost
  : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ];

const parseAllowedOrigins = () => {
  const fromEnv = String(process.env.CLIENT_URL || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return [...new Set([...fromEnv, ...DEFAULT_ALLOWED_ORIGINS])];
};

const allowedOrigins = parseAllowedOrigins();

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // Allow server-to-server (no origin header)
  return allowedOrigins.includes(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  exposedHeaders: ['Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400, // Cache preflight for 24 hours
};


// ═══════════════════════════════════════════════════
// SOCKET.IO SETUP
// ═══════════════════════════════════════════════════

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('Socket.IO CORS blocked'));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  // Production tuning
  maxHttpBufferSize: 1e6, // 1MB max message size
  connectTimeout: 10000,  // 10s connection timeout
  allowEIO3: false,       // Disable legacy Engine.IO v3
});

app.set('io', io);

// Start room expiration job which needs the io instance
startRoomExpirationJob(io);


// ═══════════════════════════════════════════════════
// MIDDLEWARE STACK (order matters!)
// ═══════════════════════════════════════════════════

// 1. Clerk webhook (needs raw body, BEFORE any body parser)
app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhook);

// 2. Security headers via Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false, // Allow YouTube iframe embeds
  contentSecurityPolicy: IS_PRODUCTION ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.youtube.com", "https://s.ytimg.com"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://accounts.google.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "wss:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      mediaSrc: ["'self'", "https:", "blob:"],
    },
  } : false,
  hsts: IS_PRODUCTION ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// 3. CORS
app.use(cors(corsOptions));

// 4. Body parsers
app.use(express.json({ limit: '5mb' }));  // Reduced from 10mb
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// 5. NoSQL injection sanitization (req.body + req.params)
// req.query is read-only in Express 5, so we sanitize it manually
app.use((req, _res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body);
  if (req.params) req.params = mongoSanitize.sanitize(req.params);
  next();
});

// 6. Additional security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '0'); // Modern browsers don't need this, CSP handles it
  res.removeHeader('X-Powered-By');
  next();
});

// 7. Static files
app.use('/uploads', express.static(path.resolve(__dirname, '../../uploads'), {
  maxAge: IS_PRODUCTION ? '1d' : 0,
  etag: true,
  lastModified: true,
}));


// ═══════════════════════════════════════════════════
// HEALTH CHECK (before auth — must be public)
// ═══════════════════════════════════════════════════

app.get('/api/health', (_req, res) => {
  // In production, don't leak internal service status details
  if (IS_PRODUCTION) {
    return res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
    });
  }

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient.isReady ? 'connected' : 'disconnected',
      server: 'running',
    },
    uptime: process.uptime(),
  });
});


// ═══════════════════════════════════════════════════
// AUTH MIDDLEWARE (applied to all subsequent routes)
// ═══════════════════════════════════════════════════

app.use(authMiddleware);


// ═══════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════

// Global rate limiter — generous for real-time sync app
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  skip: (req) => req.path === '/api/health',
  keyGenerator: (req) => req.userId || req.ip, // Rate limit by user, not IP
  validate: false, // We use userId primarily, IP only as fallback
});
app.use(globalLimiter);

// Auth-specific rate limiter (stricter for login/signup abuse)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,                   // 30 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth requests. Please try again later.' },
  keyGenerator: (req) => req.ip,
  validate: false,
});

// Room creation limiter (prevent spam)
const createRoomLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // 10 rooms per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Room creation limit reached. Try again later.' },
  keyGenerator: (req) => req.userId || req.ip,
  validate: false,
});


// ═══════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════

const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const momentRoutes = require('./routes/momentRoutes');
const userRoutes = require('./routes/userRoutes');
const friendRoutes = require('./routes/friendRoutes');
const storyRoutes = require('./routes/storyRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dmRoutes = require('./routes/dmRoutes');
const musicRoutes = require('./routes/musicRoutes');
const movieRoutes = require('./routes/movieRoutes');

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/moments', momentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/movies', movieRoutes);


// ═══════════════════════════════════════════════════
// SOCKET.IO HANDLERS
// ═══════════════════════════════════════════════════

setupSocketHandlers(io);


// ═══════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════

// Global error handler
app.use((err, req, res, _next) => {
  const statusCode = err.status || err.statusCode || 500;

  // Log to console (always)
  if (statusCode >= 500) {
    console.error(`❌ [${req.method}] ${req.path} — ${err.message}`);
    if (!IS_PRODUCTION && err.stack) console.error(err.stack);
  }

  // Log to PostgreSQL in production (non-blocking)
  if (pgPool && IS_PRODUCTION && statusCode >= 500) {
    pgPool.query(
      `INSERT INTO error_logs (error, path, method, user_id, timestamp) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [err.message || 'Unknown error', req.path, req.method, req.userId || 'anonymous']
    ).catch(() => {});
  }

  // Never leak internal error details in production
  res.status(statusCode).json({
    success: false,
    message: IS_PRODUCTION && statusCode >= 500
      ? 'Internal server error'
      : (err.message || 'Internal server error'),
    // Only include error code in dev for debugging
    ...(IS_PRODUCTION ? {} : { code: err.code, path: req.path }),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});


// ═══════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis
    try {
      await redisClient.connect();
      console.log('✅ Redis connected');
    } catch (redisErr) {
      console.error('⚠️ Redis connection failed:', redisErr.message, '— sync will fall back to MongoDB (slower)');
    }

    // Start listening
    server.listen(PORT, () => {
      console.log(`🚀 SyncPlay server running on port ${PORT} [${IS_PRODUCTION ? 'PRODUCTION' : 'DEVELOPMENT'}]`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();


// ═══════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════

const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

  // Stop accepting new connections
  server.close(() => {
    console.log('  ✓ HTTP server closed');
  });

  // Close all socket connections
  io.close(() => {
    console.log('  ✓ Socket.IO closed');
  });

  // Disconnect databases
  try {
    await mongoose.connection.close();
    console.log('  ✓ MongoDB disconnected');
  } catch (e) { /* ignore */ }

  try {
    await redisClient.quit();
    console.log('  ✓ Redis disconnected');
  } catch (e) { /* ignore */ }

  try {
    await pgPool.end();
    console.log('  ✓ PostgreSQL disconnected');
  } catch (e) { /* ignore */ }

  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unhandled errors in production (don't crash)
if (IS_PRODUCTION) {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection:', reason?.message || reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error.message);
    // Give time to flush logs, then exit
    setTimeout(() => process.exit(1), 1000);
  });
}

module.exports = { app, server, io, pgPool };