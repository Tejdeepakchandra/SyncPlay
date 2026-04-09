import { useEffect, useState, useCallback } from 'react';
import { socket } from '@/services/socket';

/**
 * useParticipantStates
 * Manages real-time participant audio states (speaking, muted, audioEnabled)
 * Listens for audio state changes and activity levels from other participants
 */
export const useParticipantStates = (roomCode) => {
  const [participantStates, setParticipantStates] = useState({});
  const [participantActivity, setParticipantActivity] = useState({});

  // Broadcast our own audio state
  const broadcastAudioState = useCallback(
    (userId, { audioEnabled, isMuted, isSpeaking }) => {
      if (!socket || !roomCode) return;
      socket.emit('audio:state-change', {
        roomCode,
        userId,
        audioEnabled,
        isMuted,
        isSpeaking,
      });
    },
    [socket, roomCode]
  );

  // Broadcast activity level for equalizer
  const broadcastActivityLevel = useCallback(
    (userId, level) => {
      if (!socket || !roomCode) return;
      socket.emit('audio:activity-level', {
        roomCode,
        userId,
        level,
      });
    },
    [socket, roomCode]
  );

  useEffect(() => {
    if (!socket || !roomCode) return;

    // Listen for participant state changes
    const handleParticipantState = (data) => {
      const { userId, audioEnabled, isMuted, isSpeaking, timestamp } = data;
      setParticipantStates((prev) => ({
        ...prev,
        [userId]: {
          audioEnabled,
          isMuted,
          isSpeaking,
          timestamp,
        },
      }));
    };

    // Listen for activity level updates
    const handleParticipantActivity = (data) => {
      const { userId, level, timestamp } = data;
      setParticipantActivity((prev) => ({
        ...prev,
        [userId]: {
          level,
          timestamp,
        },
      }));
    };

    socket.on('audio:participant-state', handleParticipantState);
    socket.on('audio:participant-activity', handleParticipantActivity);

    // Request current states when joining
    socket.emit('audio:request-states', { roomCode });

    return () => {
      socket.off('audio:participant-state', handleParticipantState);
      socket.off('audio:participant-activity', handleParticipantActivity);
    };
  }, [socket, roomCode]);

  return {
    participantStates,
    participantActivity,
    broadcastAudioState,
    broadcastActivityLevel,
  };
};
