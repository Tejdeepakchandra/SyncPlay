const redisClient = require('../config/redis');
const cloudinary = require('../utils/cloudinary');

const CLEANUP_ZSET_KEY = 'media_cleanup:due';
const CLEANUP_PREFIX = 'media_cleanup:item:';
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];

function itemKey(id) {
  return `${CLEANUP_PREFIX}${id}`;
}

function makeId(publicId) {
  return `${Date.now()}:${Math.random().toString(36).slice(2, 10)}:${publicId}`;
}

async function enqueue(publicId, resourceType = 'video', reason = 'room-ended') {
  if (!publicId) return null;
  if (!redisClient?.isReady) {
    try {
      const result = await cloudinary.deleteAsset(publicId, resourceType);
      const ok = result?.result === 'ok' || result?.result === 'not_found';
      return ok ? 'deleted-immediately' : null;
    } catch (_error) {
      return null;
    }
  }

  const id = makeId(publicId);
  const payload = {
    id,
    publicId,
    resourceType,
    reason,
    attempts: 0,
    createdAt: Date.now(),
  };

  await redisClient.set(itemKey(id), JSON.stringify(payload), { EX: 7 * 24 * 60 * 60 });
  await redisClient.zAdd(CLEANUP_ZSET_KEY, [{ score: Date.now(), value: id }]);
  return id;
}

async function runDueBatch(limit = 20) {
  if (!redisClient?.isReady) return { processed: 0, deleted: 0, retried: 0, skipped: 0 };

  const now = Date.now();
  const ids = await redisClient.zRangeByScore(CLEANUP_ZSET_KEY, 0, now, { LIMIT: { offset: 0, count: limit } });
  if (!ids.length) {
    return { processed: 0, deleted: 0, retried: 0, skipped: 0 };
  }

  let deleted = 0;
  let retried = 0;
  let skipped = 0;

  for (const id of ids) {
    await redisClient.zRem(CLEANUP_ZSET_KEY, id);
    const raw = await redisClient.get(itemKey(id));
    if (!raw) {
      skipped += 1;
      continue;
    }

    const task = JSON.parse(raw);
    if (!task?.publicId) {
      await redisClient.del(itemKey(id));
      skipped += 1;
      continue;
    }

    try {
      const result = await cloudinary.deleteAsset(task.publicId, task.resourceType || 'video');
      const ok = result?.result === 'ok' || result?.result === 'not_found';
      if (ok) {
        await redisClient.del(itemKey(id));
        deleted += 1;
        continue;
      }
      throw new Error(`Delete failed: ${result?.result || 'unknown'}`);
    } catch (error) {
      const attempts = Number(task.attempts || 0) + 1;
      const retryDelay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];

      if (attempts > RETRY_DELAYS_MS.length + 1) {
        // Give up after bounded retries; keep one record for observability.
        await redisClient.set(itemKey(id), JSON.stringify({ ...task, attempts, failedAt: Date.now(), error: error.message }), { EX: 24 * 60 * 60 });
        skipped += 1;
      } else {
        const nextRun = Date.now() + retryDelay;
        await redisClient.set(itemKey(id), JSON.stringify({ ...task, attempts, lastError: error.message }), { EX: 7 * 24 * 60 * 60 });
        await redisClient.zAdd(CLEANUP_ZSET_KEY, [{ score: nextRun, value: id }]);
        retried += 1;
      }
    }
  }

  return { processed: ids.length, deleted, retried, skipped };
}

module.exports = {
  enqueue,
  runDueBatch,
};
