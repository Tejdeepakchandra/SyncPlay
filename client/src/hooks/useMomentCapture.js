import { useState, useEffect, useCallback, useRef } from 'react';
import momentCapture from '../services/momentCapture';
import { useSocket } from '../contexts/SocketContext';

export const useMomentCapture = (roomId, roomCode) => {
  const [moments, setMoments] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [currentMoment, setCurrentMoment] = useState(null);
  const captureTimeout = useRef(null);
  const socket = useSocket();

  // Listen for moment detection
  useEffect(() => {
    if (!socket) return;

    const handleMomentDetected = (data) => {
      // Add to moments list
      setMoments(prev => [...prev, {
        ...data,
        detectedAt: Date.now()
      }]);
      
      // Show notification
      showMomentNotification(data);
    };

    const handleCaptureStart = async (data) => {
      setIsCapturing(true);
      setCurrentMoment(data);
      
      try {
        // Start capturing
        await momentCapture.startCapture({
          roomCode,
          ...data
        });
        
        // Auto-stop after duration
        if (captureTimeout.current) {
          clearTimeout(captureTimeout.current);
        }
        
        captureTimeout.current = setTimeout(() => {
          setIsCapturing(false);
          setCurrentMoment(null);
        }, data.duration * 1000 + 1000);
        
      } catch (error) {
        console.error('Capture start failed:', error);
        setIsCapturing(false);
        setCurrentMoment(null);
      }
    };

    const handleMomentReady = (data) => {
      // Update moment in list
      setMoments(prev => prev.map(m => 
        m.momentId === data.momentId 
          ? { ...m, ready: true, thumbnail: data.thumbnail }
          : m
      ));
    };

    socket.on('moment:detected', handleMomentDetected);
    socket.on('moment:capture-start', handleCaptureStart);
    socket.on('moment:ready', handleMomentReady);

    return () => {
      socket.off('moment:detected', handleMomentDetected);
      socket.off('moment:capture-start', handleCaptureStart);
      socket.off('moment:ready', handleMomentReady);
      
      if (captureTimeout.current) {
        clearTimeout(captureTimeout.current);
      }
    };
  }, [socket, roomCode]);

  /**
   * Send a reaction (could trigger moment)
   */
  const sendReaction = useCallback((reaction, videoTimestamp) => {
    if (!socket) return;
    
    socket.emit('moment:reaction', {
      roomCode,
      reaction,
      videoTimestamp
    }, (response) => {
      if (response?.detected) {
        console.log('Moment detected!', response);
      }
    });
  }, [socket, roomCode]);

  /**
   * Send a comment (could trigger moment)
   */
  const sendComment = useCallback((text, videoTimestamp) => {
    if (!socket) return;
    
    socket.emit('moment:comment', {
      roomCode,
      text,
      videoTimestamp
    }, (response) => {
      if (response?.detected) {
        console.log('Moment detected!', response);
      }
    });
  }, [socket, roomCode]);

  /**
   * Create a bookmark moment
   */
  const createBookmark = useCallback((videoTimestamp, note = '') => {
    if (!socket) return;
    
    socket.emit('moment:bookmark', {
      roomCode,
      videoTimestamp,
      note
    });
  }, [socket, roomCode]);

  /**
   * Load moments for this room
   */
  const loadMoments = useCallback(async () => {
    try {
      const response = await fetch(`/api/moments/room/${roomCode}`);
      const data = await response.json();
      
      if (data.success) {
        setMoments(data.data);
      }
    } catch (error) {
      console.error('Load moments error:', error);
    }
  }, [roomCode]);

  /**
   * Show notification for detected moment
   */
  const showMomentNotification = (moment) => {
    // You can integrate with your toast/notification system
    console.log('✨ New moment detected!', moment);
  };

  // Load moments on mount
  useEffect(() => {
    if (roomCode) {
      loadMoments();
    }
  }, [roomCode, loadMoments]);

  return {
    moments,
    isCapturing,
    currentMoment,
    sendReaction,
    sendComment,
    createBookmark,
    loadMoments
  };
};