const { authenticateSocket } = require('./middleware/auth');
const roomHandlers = require('./handlers/roomHandlers');
const syncHandlers = require('./handlers/syncHandlers');
const presenceHandlers = require('./handlers/presenceHandlers');
const chatHandlers = require('./handlers/chatHandlers');
const webrtcHandlers = require('./handlers/webrtcHandlers');
const Friendship = require('../models/mongodb/Friendship');
const roomService = require('../services/roomService');
const presenceService = require('../services/presenceService');
const momentHandlers = require('./handlers/momentHandlers');
const notificationHandlers = require('./handlers/notificationHandlers');
const dmHandlers = require('./handlers/dmHandlers');

const DISCONNECT_GRACE_MS = 20000;


 // Setup all socket handlers

const setupSocketHandlers = (io) => {
  const userSocketIds = new Map(); // userId -> Set(socketId)
  const pendingLeaveTimers = new Map(); // "userId:roomCode" -> Timeout

  const makeLeaveKey = (userId, roomCode) => `${userId}:${roomCode}`;

  const emitPresenceStatusToFriends = async (userId, isOnline, roomCode = null) => {
    if (!userId) return;

    const links = await Friendship.find({
      status: 'accepted',
      $or: [{ requesterId: userId }, { addresseeId: userId }],
    })
      .select('requesterId addresseeId')
      .lean();

    const audience = new Set([userId]);
    links.forEach((link) => {
      audience.add(link.requesterId);
      audience.add(link.addresseeId);
    });

    const payload = {
      userId,
      isOnline,
      status: isOnline ? 'online' : 'offline',
      roomCode: roomCode || null,
      at: new Date().toISOString(),
    };

    audience.forEach((targetUserId) => {
      io.to(`user:${targetUserId}`).emit('presence:user-status', payload);
    });
  };

  // Authentication middleware for all sockets
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userDisplay = socket.isGuest ? `guest (${socket.userId.substring(0, 8)})` : socket.username || socket.userId;
    console.log(`🔌 Socket connected: ${socket.id} → ${userDisplay}`);

    if (!userSocketIds.has(socket.userId)) {
      userSocketIds.set(socket.userId, new Set());
    }
    userSocketIds.get(socket.userId).add(socket.id);

    // Per-user room enables direct fanout for social notifications/stories.
    socket.join(`user:${socket.userId}`);

    if (!socket.isGuest) {
      presenceService.updatePresence(socket.userId, socket.roomCode || null).catch(() => null);
      emitPresenceStatusToFriends(socket.userId, true, socket.roomCode || null).catch(() => null);
    }

    // Cancel pending auto-leave on fast reconnect/refresh.
    for (const [leaveKey, timer] of pendingLeaveTimers.entries()) {
      if (leaveKey.startsWith(`${socket.userId}:`)) {
        clearTimeout(timer);
        pendingLeaveTimers.delete(leaveKey);
      }
    }

    // Send socket.userId back to client so they know their assigned user ID
    socket.emit('socket:identify', {
      userId: socket.userId,
      isGuest: socket.isGuest,
      userRole: socket.userRole
    });

    // Initialize all handlers
    roomHandlers(socket, io);
    syncHandlers(socket, io);
    presenceHandlers(socket, io);
    chatHandlers(socket, io);
    webrtcHandlers(socket, io);
    momentHandlers(socket, io);
    notificationHandlers(socket, io);
    dmHandlers(socket, io);

    // Auto-leave room and cleanup on disconnect — FIXED
    socket.on('disconnect', async () => {
      console.log(`🔌 Socket disconnected: ${socket.id} (User: ${socket.userId})`);

      const userSockets = userSocketIds.get(socket.userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketIds.delete(socket.userId);
        }
      }

      // If another tab/device socket is still connected for this user, do nothing.
      if (userSocketIds.has(socket.userId)) {
        return;
      }
      
      // Delay auto-leave to survive refresh/transient reconnect.
      if (socket.roomCode) {
        const leaveKey = makeLeaveKey(socket.userId, socket.roomCode);
        const timer = setTimeout(async () => {
          pendingLeaveTimers.delete(leaveKey);

          // User reconnected while timer was running.
          if (userSocketIds.has(socket.userId)) {
            return;
          }

          try {
            const result = await roomService.leaveRoom(socket.roomCode, socket.userId);

            socket.to(socket.roomCode).emit('room:user-left', {
              userId: socket.userId,
              timestamp: Date.now(),
              autoLeft: true,
            });

            if (result.newHostId) {
              io.to(socket.roomCode).emit('room:new-host', {
                newHostId: result.newHostId,
                previousHost: socket.userId,
                reason: 'host-disconnected',
                restored: false,
              });
            }

            if (!socket.isGuest) {
              await presenceService.setOffline(socket.userId);
              emitPresenceStatusToFriends(socket.userId, false, null).catch(() => null);
            }
          } catch (error) {
            console.error('Auto-leave error:', error);
          }
        }, DISCONNECT_GRACE_MS);

        pendingLeaveTimers.set(leaveKey, timer);
        return;
      }

      // No room to preserve; mark offline immediately.
      if (!socket.isGuest) {
        await presenceService.setOffline(socket.userId);
        emitPresenceStatusToFriends(socket.userId, false, null).catch(() => null);
      }
    });
  });

  // Periodic cleanup (every 5 minutes)
  setInterval(() => {
    
  }, 5 * 60 * 1000);
};

module.exports = { setupSocketHandlers };