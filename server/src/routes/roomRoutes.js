const express = require('express');
const roomService = require('../services/roomService');
const { validateRoomCreation } = require('../middleware/validation');
const router = express.Router();

/**
 * Create new room
 * POST /api/rooms
 */
router.post('/', validateRoomCreation, async (req, res, next) => {
  const startTime = Date.now();
  console.log(`[ROOMS] 🚀 POST /rooms START - userId: ${req.userId}`);
  
  try {
    console.log(`[ROOMS] 📥 Request body:`, { 
      name: req.body.name, 
      type: req.body.type 
    });
    
    const hostId = req.userId; // From auth middleware
    
    if (!hostId) {
      console.log(`[ROOMS] ❌ No userId in request`);
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    console.log(`[ROOMS] 🔄 Calling roomService.createRoom...`);
    const room = await roomService.createRoom(req.body, hostId);
    
    console.log(`[ROOMS] ✅ Room created: ${room.roomCode} in ${Date.now() - startTime}ms`);
    
    res.status(201).json({
      success: true,
      data: {
        roomCode: room.roomCode,
        name: room.name,
        type: room.type,
        hostId: room.hostId
      }
    });
  } catch (error) {
    console.log(`[ROOMS] ❌ Error after ${Date.now() - startTime}ms:`, error.message);
    next(error);
  }
});

/**
 * Get room by code
 * GET /api/rooms/:roomCode
 */
router.get('/:roomCode', async (req, res, next) => {
  try {
    const room = await roomService.getRoomByCode(req.params.roomCode);
    
    if (!room) {
      return res.status(404).json({
        success: false,
        message: 'Room not found'
      });
    }
    
    // Don't send sensitive data
    const safeRoom = {
      roomCode: room.roomCode,
      name: room.name,
      type: room.type,
      hostId: room.hostId,
      status: room.status,
      participantCount: room.participantCount,
      settings: room.settings,
      createdAt: room.createdAt
    };
    
    res.json({
      success: true,
      data: safeRoom
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Join room
 * POST /api/rooms/:roomCode/join
 */
router.post('/:roomCode/join', async (req, res, next) => {
  try {
    const userId = req.userId;
    const asGuest = req.body.asGuest || false;
    
    const result = await roomService.joinRoom(
      req.params.roomCode, 
      userId, 
      asGuest
    );
    
    res.json({
      success: true,
      data: {
        room: {
          roomCode: result.room.roomCode,
          name: result.room.name,
          type: result.room.type,
          hostId: result.room.hostId
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Leave room
 * POST /api/rooms/:roomCode/leave
 */
router.post('/:roomCode/leave', async (req, res, next) => {
  try {
    const userId = req.userId;
    
    const result = await roomService.leaveRoom(req.params.roomCode, userId);
    
    res.json({
      success: true,
      data: {
        participants: result.participants
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get room participants
 * GET /api/rooms/:roomCode/participants
 */
router.get('/:roomCode/participants', async (req, res, next) => {
  try {
    const participants = await roomService.getRoomParticipants(req.params.roomCode);
    
    res.json({
      success: true,
      data: {
        participants,
        count: participants.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update room settings (host only)
 * PUT /api/rooms/:roomCode/settings
 */
router.put('/:roomCode/settings', async (req, res, next) => {
  try {
    const room = await roomService.updateRoomSettings(
      req.params.roomCode,
      req.userId,
      req.body
    );
    
    res.json({
      success: true,
      data: {
        settings: room.settings
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * End room (host only)
 * POST /api/rooms/:roomCode/end
 */
router.post('/:roomCode/end', async (req, res, next) => {
  try {
    const room = await roomService.endRoom(req.params.roomCode, req.userId);
    
    res.json({
      success: true,
      data: {
        status: room.status,
        endedAt: room.endedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;