const { ROOM_TYPES } = require('../utils/constants');


const validateRoomCreation = (req, res, next) => {
  const { name, type, settings } = req.body;
  
  if (!name || !type) {
    return res.status(400).json({
      success: false,
      message: 'Room name and type are required'
    });
  }
  
  if (name.length < 3 || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Room name must be between 3 and 100 characters'
    });
  }
  
  if (!Object.values(ROOM_TYPES).includes(type)) {
    return res.status(400).json({
      success: false,
      message: 'Room type must be either movie or music'
    });
  }
  
  // Validate settings if provided
  if (settings) {
    if (settings.maxParticipants && 
        (settings.maxParticipants < 2 || settings.maxParticipants > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Max participants must be between 2 and 100'
      });
    }
    
    if (settings.privacy && 
        !['public', 'private', 'invite-only'].includes(settings.privacy)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid privacy setting'
      });
    }
  }
  
  next();
};


const validateRoomCode = (req, res, next) => {
  const { roomCode } = req.params;
  
  if (!roomCode || roomCode.length !== 6) {
    return res.status(400).json({
      success: false,
      message: 'Invalid room code'
    });
  }
  
  next();
};

module.exports = {
  validateRoomCreation,
  validateRoomCode
};