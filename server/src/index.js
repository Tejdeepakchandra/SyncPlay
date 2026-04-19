const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables BEFORE any config that reads process.env
dotenv.config();

// CONFIGURATION & DATABASES

const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const pgPool = require('./config/postgres');
const { setupSocketHandlers } = require('./socket');
const { authMiddleware } = require('./middleware/auth');
const { rateLimiter } = require('./middleware/rateLimiter');
const { startPresenceCleanup } = require('./jobs/presenceCleanup');
const { startMediaCleanupJob } = require('./jobs/mediaCleanup');
const { clerkWebhook } = require('./controllers/authController');

// Initialize Express
const app = express();
const server = http.createServer(app);

startPresenceCleanup();
startMediaCleanupJob();

const DEFAULT_ALLOWED_ORIGINS = [
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
  if (!origin) return true;
  return allowedOrigins.includes(origin);
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  exposedHeaders: ['Authorization'],
};


// SOCKET.IO SETUP

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Socket.IO CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

app.set('io', io);


// MIDDLEWARE

// Log incoming requests (REDUCED - only errors and important events)
app.use((req, res, next) => {
  // Only log non-health-check requests
  if (req.path !== '/api/health') {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const path = req.path;
    const isAuth = req.headers.authorization ? '🔐' : '🔓';
    
    console.log(`${timestamp} ${isAuth} ${method.padEnd(6)} ${path}`);
  }
  
  next();
});

app.post('/api/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhook);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.resolve(__dirname, '../../uploads')));

// HEALTH CHECK ENDPOINT (before auth middleware)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    services: {
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis: redisClient.isReady ? 'connected' : 'disconnected',
      server: 'running'
    },
    uptime: process.uptime()
  });
});

// Apply auth middleware to all routes
app.use(authMiddleware);

// Apply rate limiting to all routes
// TODO: Fix rateLimiter usage - currently broken, needs proper limitType parameter
// app.use(rateLimiter);


// ROUTES

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

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/moments', momentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/movies', movieRoutes);


// SOCKET.IO HANDLERS

setupSocketHandlers(io);


// ERROR HANDLING

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message || err);
  
  // Try to log to PostgreSQL (but don't fail if table doesn't exist)
  if (pgPool && process.env.NODE_ENV === 'production') {
    pgPool.query(
      `INSERT INTO error_logs (error, path, method, user_id, timestamp) 
       VALUES ($1, $2, $3, $4, NOW())`,
      [err.message || 'Unknown error', req.path, req.method, req.userId || 'anonymous']
    ).catch(e => {
      // Silently fail - table might not exist in development
      if (process.env.NODE_ENV === 'development') {
        console.log('[INFO] PostgreSQL logging skipped (table may not exist)');
      }
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});


// START SERVER - Wait for databases to connect first

const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Verify environment variables
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable not set');
    }

    // Connect to MongoDB
    console.log('⏳ Connecting to MongoDB...');
    await connectDB();
    console.log('✅ MongoDB connected');
    
    // Connect to Redis (optional, will continue if fails)
    console.log('⏳ Connecting to Redis...');
    try {
      await redisClient.connect();
      console.log('✅ Redis connected');
    } catch (redisErr) {
      console.warn('⚠️ Redis connection failed (optional):', redisErr.message);
    }
    
    // Now start listening
    server.listen(PORT, () => {
      console.log('\n=================================');
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 WebSocket server ready`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log('=================================\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing connections...');
  await mongoose.connection.close();
  await redisClient.quit();
  await pgPool.end();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io, pgPool };