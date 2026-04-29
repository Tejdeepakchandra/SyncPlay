const presenceService = require('../services/presenceService');


 //Run presence cleanup every 5 minutes

const startPresenceCleanup = () => {
  setInterval(async () => {
    try {
      await presenceService.batchUpdateMongo();
    } catch (error) {
      console.error('Presence cleanup error:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
};

module.exports = { startPresenceCleanup };