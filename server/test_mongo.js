const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(() => {
  const Room = require('./src/models/mongodb/Room');
  Room.findOneAndUpdate(
    { roomCode: 'V94W4E' },
    {
      $set: {
        'media.current': { source: 'youtube', metadata: { type: 'youtube', videoId: 'Sher123' } },
        status: 'active',
        'syncState.isPlaying': false,
        'syncState.baseTimestamp': 0,
        'syncState.currentTime': 0,
        'syncState.startAt': null,
        'syncState.lastUpdated': new Date(),
        'syncState.updatedBy': 'test',
        'syncState.version': 1
      }
    },
    { new: false }
  )
    .then(doc => {
      console.log('SUCCESS');
      process.exit(0);
    })
    .catch(err => {
      console.log('ERROR:', err);
      process.exit(1);
    });
}).catch(err => {
  console.log('MONGO ERR:', err);
  process.exit(1);
});
