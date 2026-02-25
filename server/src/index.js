const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const dotenv = require("dotenv");
const {Server} = require('socket.io');
const http = require('http');
const mongoose = require('mongoose');

dotenv.config();

const connectDB = require('./config/database');
const redisClient = require('./config/redis');
const pgPool= require('./config/postgres');
const { timeStamp } = require("console");

const app = express();
const server = http.createServer(app);

const io= new Server(server,{
  cors:{
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true
  },
  transports: ['websocket','polling']
})


app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to databases
connectDB();
redisClient.connect().catch(err => console.error("Redis connection error:", err));

app.get("/api/health", async (req, res) => {
  let pgStatus = 'disconnected';
  try{
    const result= await pgPool.query('SELECT 1 as health_check');
    pgStatus = result.rows[0]?.health_check == 1 ? 'connected' : 'error';
  }
  catch(error){
    pgStatus = 'error';
  }

  res.json({
    status: 'OK',
    timeStamp: new Date().toISOString(),
    services:{
      mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      redis : redisClient.isReady ? 'connected': 'disconnected',
      postgres : pgStatus,
      server : 'running'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });

});

io.on('connection', (socket)=>{
  console.log('Client connected:',socket.id);

  socket.on('disconnect',()=>{
    console.log('Client disconnected:',socket.id);
  })
})

app.use((err,req,res,next)=>{
  console.error('Error:', err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err :{}
  });
})


const PORT = process.env.PORT || 3001;

server.listen(PORT, ()=>{
  console.log(`Server running on port ${PORT}`);
  console.log('websocket server running');
  console.log('Health check: http://localhost:'+PORT+'/api/health');
})

module.exports = {app, server, io, redisClient, pgPool};