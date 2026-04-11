const mediaCleanupService = require('../services/mediaCleanupService');

function startMediaCleanupJob() {
  // Keep short cadence for quick cleanup after room end while staying lightweight.
  setInterval(async () => {
    try {
      const result = await mediaCleanupService.runDueBatch(20);
      if (result.processed > 0) {
        console.log(`[MEDIA-CLEANUP] processed=${result.processed} deleted=${result.deleted} retried=${result.retried} skipped=${result.skipped}`);
      }
    } catch (error) {
      console.error('[MEDIA-CLEANUP] job error:', error.message);
    }
  }, 60 * 1000);
}

module.exports = { startMediaCleanupJob };
