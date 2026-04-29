const Room = require('../models/mongodb/Room');
const roomService = require('../services/roomService');
const mediaCleanupService = require('../services/mediaCleanupService');
const cloudinary = require('../utils/cloudinary');
const redisClient = require('../config/redis');
const { createRedisKey } = require('../utils/helpers');
const { REDIS_KEYS, ROOM_STATUS } = require('../utils/constants');

const ROOM_EXPIRATION_MS = 5 * 60 * 60 * 1000; // 5 hours
const CHECK_INTERVAL_MS = 3 * 60 * 1000; // Check every 3 minutes
const BATCH_SIZE = 10;

/**
 * Force-end a room at the system level (bypasses host check).
 * This handles Cloudinary cleanup, Redis cleanup, analytics, etc.
 */
async function forceEndRoom(room) {
  const roomCode = room.roomCode;

  // Collect all Cloudinary assets for cleanup
  const assetsToClean = new Map();

  const currentPublicId = room?.media?.current?.metadata?.cloudinary?.publicId;
  if (currentPublicId) {
    assetsToClean.set(currentPublicId, room?.media?.current?.metadata?.cloudinary?.resourceType || 'video');
  }

  const uploadedAssets = room.uploadedAssets || [];
  for (const asset of uploadedAssets) {
    if (asset.publicId && !assetsToClean.has(asset.publicId)) {
      assetsToClean.set(asset.publicId, asset.resourceType || 'video');
    }
  }

  // Record participant history
  const endedAt = new Date();
  if (typeof roomService.upsertParticipantHistory === 'function') {
    (room.participants || []).forEach((participant) => {
      roomService.upsertParticipantHistory(room, participant, endedAt);
    });
  }

  // Update room document
  room.status = ROOM_STATUS.ENDED;
  room.endedAt = endedAt;
  room.participants = [];
  room.waitingUsers = [];
  room.joinRequests = [];
  room.coHosts = [];
  room.participantCount = 0;
  room.media = { current: null, queue: [], history: [] };
  room.uploadedAssets = [];
  room.version += 1;
  await room.save();

  // Clean up Cloudinary assets (non-blocking)
  if (assetsToClean.size > 0) {
    console.log(`[ROOM-EXPIRY] Cleaning ${assetsToClean.size} Cloudinary asset(s) for ${roomCode}`);
    for (const [publicId, resourceType] of assetsToClean) {
      try {
        const result = await cloudinary.deleteAsset(publicId, resourceType);
        const ok = result?.result === 'ok' || result?.result === 'not_found';
        if (!ok) throw new Error(`Delete returned: ${result?.result}`);
      } catch (_err) {
        await mediaCleanupService.enqueue(publicId, resourceType, 'room-expired').catch(() => {});
      }
    }
  }

  // Clean up Redis keys
  try {
    const redisKey = createRedisKey(REDIS_KEYS.ROOM, roomCode);
    const usersKey = createRedisKey(REDIS_KEYS.ROOM_USERS, roomCode);
    const metaKey = createRedisKey(REDIS_KEYS.ROOM_METADATA, roomCode);
    await Promise.all([
      redisClient.del(redisKey).catch(() => {}),
      redisClient.del(usersKey).catch(() => {}),
      redisClient.del(metaKey).catch(() => {}),
    ]);
  } catch (_err) {
    // Redis might be down — not critical
  }

  return room;
}

function startRoomExpirationJob(io) {
  console.log(`[ROOM-EXPIRY] Job started — checking every ${CHECK_INTERVAL_MS / 1000}s for rooms older than ${ROOM_EXPIRATION_MS / (1000 * 60 * 60)}h`);

  const run = async () => {
    try {
      const expirationThreshold = new Date(Date.now() - ROOM_EXPIRATION_MS);

      // Find rooms that are active/lobby/paused and were created before the threshold
      const expiredRooms = await Room.find({
        status: { $in: ['active', 'lobby', 'paused'] },
        createdAt: { $lt: expirationThreshold },
      }).limit(BATCH_SIZE);

      if (expiredRooms.length === 0) return;

      console.log(`[ROOM-EXPIRY] Found ${expiredRooms.length} expired room(s). Ending...`);

      for (const room of expiredRooms) {
        try {
          const endedRoom = await forceEndRoom(room);

          if (io) {
            // Notify all clients in the room that it was auto-ended
            io.to(room.roomCode).emit('room:ended', {
              reason: 'auto_expired',
              message: 'This room was automatically closed after 5 hours.',
            });

            // Notify discovery page
            io.emit('discovery:rooms-updated', {
              type: endedRoom?.type || null,
              roomCode: room.roomCode,
              roomName: endedRoom?.name || null,
              reason: 'room-expired',
              at: new Date().toISOString(),
            });
          }

          console.log(`[ROOM-EXPIRY] ✅ Ended room ${room.roomCode} (created ${room.createdAt.toISOString()})`);
        } catch (err) {
          console.error(`[ROOM-EXPIRY] ❌ Failed to end room ${room.roomCode}:`, err.message);

          // Force-update status even if something failed, so we don't retry forever
          try {
            await Room.updateOne(
              { _id: room._id },
              { $set: { status: 'ended', endedAt: new Date() } }
            );
          } catch (_forceErr) {
            // Give up on this room
          }
        }
      }
    } catch (error) {
      console.error('[ROOM-EXPIRY] Job error:', error.message);
    }
  };

  // Run once immediately (in case server was down and rooms expired)
  setTimeout(run, 10000); // Wait 10s for DB connections

  // Then run on interval
  setInterval(run, CHECK_INTERVAL_MS);
}

module.exports = { startRoomExpirationJob, forceEndRoom };
