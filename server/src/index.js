const express = require('express');
const http = require('http');
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
const { clerkWebhook } = require('./controllers/authController');

// Initialize Express
const app = express();
const server = http.createServer(app);

startPresenceCleanup();


// SOCKET.IO SETUP

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});


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

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  exposedHeaders: ['Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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


// DATABASE CONNECTIONS

connectDB();
redisClient.connect().catch(err => {
  console.error('❌ Redis connection failed:', err.message);
});


// ROUTES

const authRoutes = require('./routes/authRoutes');
const roomRoutes = require('./routes/roomRoutes');
const momentRoutes = require('./routes/momentRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

app.use('/api/moments', momentRoutes);
app.use('/api/users', userRoutes);


// SOCKET.IO HANDLERS

setupSocketHandlers(io);


// ERROR HANDLING

app.use((err, req, res, next) => {
  console.error('❌ Error:', err.stack);
  
  // Log to PostgreSQL
  pgPool.query(
    `INSERT INTO error_logs (error, path, method, user_id, timestamp) 
     VALUES ($1, $2, $3, $4, NOW())`,
    [err.message, req.path, req.method, req.userId || 'anonymous']
  ).catch(e => console.error('Failed to log error:', e));

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


// START SERVER

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log('\n=================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket server ready`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log('=================================\n');
});

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