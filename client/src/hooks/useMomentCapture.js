import { useState, useEffect, useCallback, useRef } from 'react';
import momentCapture from '../services/momentCapture';
import { socket } from '../services/socket';
import api from '../services/api';

/**
 * useMomentCapture — React hook for the Moment Capture System.
 * 
 * Architecture:
 * 1. Host starts rolling buffer when joining room (captures full screen continuously)
 * 2. All users can trigger moments via bookmarks, reactions, comments
 * 3. When server detects a moment, it sends capture-request to host
 * 4. Host extracts clip from rolling buffer (includes 5s BEFORE trigger)
 * 5. Host uploads clip directly to Cloudinary
 * 6. All users see the moment appear on progress bar
 * 7. Users can watch moments independently without desyncing
 * 8. Session end merges all clips into final highlights video
 */
export const useMomentCapture = (roomId, roomCode, isHost = false) => {
  const [moments, setMoments] = useState([]);
  const [isBuffering, setIsBuffering] = useState(false);    // Buffer running (host only)
  const [isExtracting, setIsExtracting] = useState(false);  // Currently extracting clip
  const [captureProgress, setCaptureProgress] = useState(null);
  const [currentMoment, setCurrentMoment] = useState(null);  // Active capture indicator
  const [watchingMoment, setWatchingMoment] = useState(null); // Currently watching
  const [momentCounts, setMomentCounts] = useState({});
  const [limitWarning, setLimitWarning] = useState(null);
  const [bufferStatus, setBufferStatus] = useState(null);
  const captureTimeoutRef = useRef(null);
  const statusIntervalRef = useRef(null);
  const remoteStreamsRef = useRef([]);

  // ─── Socket event listeners (all users) ───
  useEffect(() => {
    // Moment detected — show icon on progress bar
    const handleMomentDetected = (data) => {
      setMoments(prev => {
        if (prev.some(m => m.momentId === data.momentId)) return prev;
        return [...prev, { ...data, detectedAt: Date.now(), ready: false }];
      });
    };

    // Moment updated (merged with nearby bookmark)
    const handleMomentUpdated = (data) => {
      setMoments(prev => prev.map(m =>
        m.momentId === data.momentId
          ? { ...m, ...data, updatedAt: Date.now() }
          : m
      ));
    };

    // Moment ready — video uploaded, now playable
    const handleMomentReady = (data) => {
      setMoments(prev => prev.map(m =>
        m.momentId === data.momentId
          ? { ...m, ready: true, thumbnail: data.thumbnail, videoUrl: data.videoUrl, duration: data.duration }
          : m
      ));
    };

    // Moment deleted
    const handleMomentDeleted = (data) => {
      setMoments(prev => prev.filter(m => m.momentId !== data.momentId));
      refreshCounts();
    };

    // Capture in progress (all users see indicator)
    const handleCaptureStart = (data) => {
      setCurrentMoment(data);
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = setTimeout(() => {
        setCurrentMoment(null);
      }, (data.duration || 15) * 1000 + 5000);
    };

    // Capture error
    const handleCaptureError = (data) => {
      setIsExtracting(false);
      setCurrentMoment(null);
    };

    // Limit reached (host only)
    const handleLimitReached = (data) => {
      setLimitWarning({
        type: data.momentType,
        current: data.currentCount,
        max: data.maxAllowed,
        message: data.message,
      });
      setTimeout(() => setLimitWarning(null), 10000);
    };

    // Broadcast events (informational — other users' reactions/comments)
    const handleReactionBroadcast = (data) => {
      // Can be used for additional reaction UI; MovieRoom's room:reaction already handles floating emojis
    };
    const handleCommentBroadcast = (data) => {
    };

    socket.on('moment:detected', handleMomentDetected);
    socket.on('moment:updated', handleMomentUpdated);
    socket.on('moment:ready', handleMomentReady);
    socket.on('moment:deleted', handleMomentDeleted);
    socket.on('moment:capture-start', handleCaptureStart);
    socket.on('moment:capture-error', handleCaptureError);
    socket.on('moment:limit-reached', handleLimitReached);
    socket.on('moment:reaction-broadcast', handleReactionBroadcast);
    socket.on('moment:comment-broadcast', handleCommentBroadcast);

    return () => {
      socket.off('moment:detected', handleMomentDetected);
      socket.off('moment:updated', handleMomentUpdated);
      socket.off('moment:ready', handleMomentReady);
      socket.off('moment:deleted', handleMomentDeleted);
      socket.off('moment:capture-start', handleCaptureStart);
      socket.off('moment:capture-error', handleCaptureError);
      socket.off('moment:limit-reached', handleLimitReached);
      socket.off('moment:reaction-broadcast', handleReactionBroadcast);
      socket.off('moment:comment-broadcast', handleCommentBroadcast);
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    };
  }, [roomCode]);

  // ─── Host: Show capture modal after delay (NOT immediate screen share) ───
  const [showCaptureModal, setShowCaptureModal] = useState(false);

  useEffect(() => {
    if (!isHost || !roomCode) return;

    // Show capture prompt modal after 12 seconds (let UI settle first)
    const modalTimer = setTimeout(() => {
      // Only show if buffer is not already running
      if (!momentCapture.isBuffering) {
        setShowCaptureModal(true);
      }
    }, 12000);

    // Update buffer status periodically
    statusIntervalRef.current = setInterval(() => {
      if (momentCapture.isBuffering) {
        setBufferStatus(momentCapture.getStatus());
      }
    }, 5000);

    return () => {
      clearTimeout(modalTimer);
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, [isHost, roomCode]);

  // Start capture buffer (called from modal or settings)
  const startCapture = useCallback(async () => {
    try {
      await momentCapture.startBuffer({
        withMic: true,
        remoteStreams: remoteStreamsRef.current,
        audioOnly: false,
      });
      setIsBuffering(true);
      setShowCaptureModal(false);
      return { success: true };
    } catch (error) {
      console.error('[MOMENT] Failed to start buffer:', error);
      setIsBuffering(false);
      setShowCaptureModal(false);
      return { success: false, error: error.message };
    }
  }, []);

  // Stop capture buffer (called from settings)
  const stopCapture = useCallback(() => {
    momentCapture.stopBuffer();
    setIsBuffering(false);
  }, []);

  // Dismiss modal (choose "Later")
  const dismissCaptureModal = useCallback(() => {
    setShowCaptureModal(false);
  }, []);

  // ─── Host: Handle capture requests from server ───
  useEffect(() => {
    if (!isHost) return;

    const handleCaptureRequest = async (data) => {

      if (!momentCapture.isBuffering) {
        socket.emit('moment:capture-failed', {
          captureJobId: data.captureJobId,
          reason: 'Buffer not running (screen share may have been denied)',
        });
        return;
      }

      setIsExtracting(true);
      socket.emit('moment:capture-started', { captureJobId: data.captureJobId });

      // Progress callback
      momentCapture.onCaptureProgress((progress) => {
        setCaptureProgress(progress);
      });

      // Instant local blob ready — make moment playable immediately
      momentCapture.onBlobReady((blobResult) => {
        const localUrl = URL.createObjectURL(blobResult.blob);
        
        // Instantly mark moment as ready with local blob URL
        setMoments(prev => prev.map(m =>
          m.momentId === blobResult.momentId
            ? { ...m, ready: true, videoUrl: localUrl, _localBlobUrl: localUrl, _blob: blobResult.blob }
            : m
        ));
        setIsExtracting(false);
        setCaptureProgress({ phase: 'uploading', momentId: blobResult.momentId });
      });

      // Upload complete — swap blob URL for Cloudinary URL
      momentCapture.onCaptureComplete((result) => {
        
        // Swap local blob URL for permanent Cloudinary URL
        setMoments(prev => prev.map(m => {
          if (m.momentId === result.momentId && m._localBlobUrl) {
            URL.revokeObjectURL(m._localBlobUrl);
            return { ...m, videoUrl: result.videoData.url, thumbnail: result.videoData.thumbnailUrl, _localBlobUrl: null, _blob: null };
          }
          return m;
        }));

        // Notify server with final Cloudinary data
        socket.emit('moment:capture-complete', {
          momentId: result.momentId,
          captureJobId: result.captureJobId,
          videoData: result.videoData,
        }, (response) => {
          if (!response?.success) {
            console.error('[MOMENT] Server rejected capture:', response?.error);
          }
        });
        setCaptureProgress(null);
        refreshCounts();
      });

      momentCapture.onCaptureError((error) => {
        console.error('[MOMENT] Extraction error:', error);
        socket.emit('moment:capture-failed', {
          captureJobId: data.captureJobId,
          reason: error.message || 'Clip extraction failed',
        });
        setIsExtracting(false);
        setCaptureProgress(null);
      });

      try {
        await momentCapture.extractClip(data);
      } catch (error) {
        console.error('[MOMENT] Extract clip failed:', error);
        socket.emit('moment:capture-failed', {
          captureJobId: data.captureJobId,
          reason: error.message || 'Failed to extract clip from buffer',
        });
        setIsExtracting(false);
        setCaptureProgress(null);
      }
    };

    socket.on('moment:capture-request', handleCaptureRequest);
    return () => {
      socket.off('moment:capture-request', handleCaptureRequest);
    };
  }, [isHost]);

  // ─── Refresh moment counts ───
  const refreshCounts = useCallback(() => {
    if (!roomCode) return;
    socket.emit('moment:get-counts', { roomCode }, (response) => {
      if (response?.success) {
        setMomentCounts(response.counts || {});
      }
    });
  }, [roomCode]);

  // ─── Load moments on mount ───
  useEffect(() => {
    if (!roomCode) return;
    let cancelled = false;

    const fetchMoments = async () => {
      try {
        const response = await api.get(`/moments/room/${encodeURIComponent(roomCode)}`);
        const data = response.data;
        if (!cancelled && data.success) {
          setMoments(data.data.map(m => ({
            ...m,
            momentId: m._id,
            ready: m.status === 'ready',
            videoUrl: m.capturedVideo?.url,
            thumbnail: m.capturedVideo?.thumbnailUrl,
          })));
        }
      } catch (error) {
        console.error('Load moments error:', error);
      }
    };

    fetchMoments();
    refreshCounts();
    return () => { cancelled = true; };
  }, [roomCode, refreshCounts]);

  // ─── Actions ───

  const sendReaction = useCallback((reaction, videoTimestamp) => {
    socket.emit('moment:reaction', {
      roomCode, reaction, videoTimestamp
    }, (response) => {
      if (response?.limitReached) {
        setLimitWarning({
          type: 'reaction_spike',
          current: response.currentCount,
          max: response.maxAllowed,
          message: 'Reaction moment limit reached for this room',
        });
        setTimeout(() => setLimitWarning(null), 8000);
      }
    });
  }, [roomCode]);

  const sendComment = useCallback((text, videoTimestamp) => {
    socket.emit('moment:comment', {
      roomCode, text, videoTimestamp
    }, (response) => {
      if (response?.limitReached) {
        setLimitWarning({
          type: 'comment_cluster',
          current: response.currentCount,
          max: response.maxAllowed,
          message: 'Comment moment limit reached for this room',
        });
        setTimeout(() => setLimitWarning(null), 8000);
      }
    });
  }, [roomCode]);

  const createBookmark = useCallback((videoTimestamp, note = '') => {
    socket.emit('moment:bookmark', {
      roomCode, videoTimestamp, note
    }, (response) => {
      if (response?.limitReached) {
        setLimitWarning({
          type: 'bookmark',
          current: response.currentCount,
          max: response.maxAllowed,
          message: 'Bookmark limit reached. Delete an existing bookmark to add a new one.',
        });
        setTimeout(() => setLimitWarning(null), 8000);
      }
    });
  }, [roomCode]);

  const deleteMoment = useCallback((momentId) => {
    socket.emit('moment:delete', { roomCode, momentId }, (response) => {
      if (response?.success) {
        setMoments(prev => prev.filter(m => m.momentId !== momentId));
        refreshCounts();
      }
    });
  }, [roomCode, refreshCounts]);

  // ─── Watch / Clear ───

  const startWatching = useCallback((momentId) => {
    setWatchingMoment(momentId);
    socket.emit('moment:watch-start', { roomCode, momentId });
  }, [roomCode]);

  const stopWatching = useCallback(() => {
    setWatchingMoment(null);
    socket.emit('moment:watch-end', { roomCode });
  }, [roomCode]);

  // Clear all moments (called when media changes)
  const clearMoments = useCallback(() => {
    setMoments([]);
    setMomentCounts({});
    setCurrentMoment(null);
    setWatchingMoment(null);
  }, []);

  // ─── Host: Manually start/stop buffer ───

  const startBufferManually = useCallback(async () => {
    try {
      await momentCapture.startBuffer({
        withMic: true,
        remoteStreams: remoteStreamsRef.current,
      });
      setIsBuffering(true);
    } catch (error) {
      console.error('[MOMENT] Manual buffer start failed:', error);
      throw error;
    }
  }, []);

  const stopBufferManually = useCallback(() => {
    momentCapture.stopBuffer();
    setIsBuffering(false);
    setBufferStatus(null);
  }, []);

  // ─── Update remote streams (call from WebRTC handler) ───
  const updateRemoteStreams = useCallback((streams) => {
    remoteStreamsRef.current = streams;
    if (momentCapture.isBuffering) {
      momentCapture.updateRemoteStreams(streams);
    }
  }, []);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => {
      momentCapture.cleanup();
      if (statusIntervalRef.current) clearInterval(statusIntervalRef.current);
    };
  }, []);

  return {
    // State
    moments,
    isBuffering,
    isExtracting,
    captureProgress,
    currentMoment,
    watchingMoment,
    momentCounts,
    limitWarning,
    bufferStatus,
    showCaptureModal,

    // Actions — all users
    sendReaction,
    sendComment,
    createBookmark,
    deleteMoment,
    startWatching,
    stopWatching,
    clearMoments,
    refreshCounts,
    dismissLimitWarning: () => setLimitWarning(null),

    // Actions — host only (capture controls)
    startCapture,
    stopCapture,
    dismissCaptureModal,
    startBufferManually,
    stopBufferManually,
    updateRemoteStreams,

    // Info
    isSupported: !!navigator.mediaDevices?.getDisplayMedia,
  };
};