import { useState, useCallback, useRef, useEffect } from "react";

/**
 * WebRTC Local Media Hook
 * Manages local camera, microphone, and screen sharing
 * Returns streams and controls for media devices
 */

// Detect mobile/tablet (screen share not supported on these)
const isMobileOrTablet = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (navigator.maxTouchPoints > 0 && /Macintosh/.test(ua)); // iPad pretends to be Mac
};

export const useWebRTC = () => {
  const [state, setState] = useState({
    stream: null,
    screenStream: null,
    videoEnabled: false,
    audioEnabled: false,
    screenSharing: false,
    error: null,
    isInitializing: false,
    // Incremented on every track change so downstream hooks know to re-check
    streamVersion: 0,
  });

  const streamRef = useRef(null);
  const screenRef = useRef(null);

  // Start camera and microphone
  const startMedia = useCallback(async (video = true, audio = true) => {
    setState(prev => ({ ...prev, isInitializing: true, error: null }));

    // getUserMedia requires at least one of video/audio to be true
    const requestAudio = audio || !video; // If no video requested, must have audio
    const requestVideo = video;

    const constraints = {
      video: requestVideo ? {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user",
      } : false,
      audio: requestAudio ? {
        // Prevent OS from treating WebRTC audio as a phone call
        // This fixes audio ducking on mobile (Issue #3)
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // These hints help prevent volume ducking on iOS/Android
        channelCount: 1,
        sampleRate: 48000,
      } : false,
    };

    let stream = null;
    let lastErr = null;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error("[WebRTC] getUserMedia is not supported in this browser or context is not secure.");
      setState(prev => ({
        ...prev,
        error: "Camera/mic API not supported (requires HTTPS or localhost)",
        isInitializing: false,
      }));
      return null;
    }

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      console.warn(`[WebRTC] getUserMedia failed:`, err.name, err.message);
      lastErr = err;
    }

    if (stream) {
      streamRef.current = stream;
      setState(prev => ({
        ...prev,
        stream,
        videoEnabled: stream.getVideoTracks().length > 0,
        audioEnabled: stream.getAudioTracks().length > 0,
        error: null,
        isInitializing: false,
        streamVersion: prev.streamVersion + 1,
      }));
      return stream;
    } else {
      let errorMsg = "Could not access media devices";
      if (lastErr?.name === "NotAllowedError") {
        errorMsg = "Camera/mic permission denied";
      } else if (lastErr?.name === "NotFoundError") {
        errorMsg = "No camera/mic found (is it plugged in?)";
      } else if (lastErr?.name === "NotReadableError" || lastErr?.name === "TrackStartError") {
        errorMsg = "Camera/mic already in use by another app (Zoom, OBS, etc.)";
      } else if (lastErr?.name === "OverconstrainedError") {
        errorMsg = "Device constraints not supported";
      } else if (lastErr?.message) {
        errorMsg = `Error: ${lastErr.message}`;
      }

      setState(prev => ({
        ...prev,
        error: errorMsg,
        isInitializing: false,
      }));
      return null;
    }
  }, []);

  // Toggle video track
  const toggleVideo = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      // If we only have an audio stream from a previous fallback, request video now
      try {
        setState(prev => ({ ...prev, isInitializing: true }));
        const videoStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
        });
        const newVideoTrack = videoStream.getVideoTracks()[0];
        stream.addTrack(newVideoTrack);
        // Bump streamVersion so mesh hook picks up the new track
        setState(prev => ({
          ...prev,
          videoEnabled: true,
          error: null,
          isInitializing: false,
          streamVersion: prev.streamVersion + 1,
        }));
      } catch (err) {
        let errorMsg = "Could not start camera";
        if (err.name === "NotAllowedError") errorMsg = "Camera permission denied";
        else if (err.name === "NotFoundError") errorMsg = "No camera found";
        else if (err.name === "NotReadableError") errorMsg = "Camera already in use by another app";
        setState(prev => ({ ...prev, error: errorMsg, isInitializing: false }));
      }
      return;
    }

    const enabled = !videoTracks[0].enabled;
    videoTracks[0].enabled = enabled;

    // Bump streamVersion so mesh hook picks up the enabled/disabled change
    setState(prev => ({
      ...prev,
      videoEnabled: enabled,
      streamVersion: prev.streamVersion + 1,
    }));
  }, []);

  // Toggle audio track
  const toggleAudio = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const enabled = !audioTracks[0].enabled;
    audioTracks[0].enabled = enabled;

    // Bump streamVersion so mesh hook picks up the enabled/disabled change
    setState(prev => ({
      ...prev,
      audioEnabled: enabled,
      streamVersion: prev.streamVersion + 1,
    }));
  }, []);

  // Check if screen sharing is supported on this device
  const isScreenShareSupported = useCallback(() => {
    // Mobile browsers don't support getDisplayMedia
    if (isMobileOrTablet()) return false;
    return !!navigator.mediaDevices?.getDisplayMedia;
  }, []);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    // Check mobile/tablet support first
    if (isMobileOrTablet()) {
      setState(prev => ({
        ...prev,
        error: "Screen sharing is not supported on mobile/tablet devices",
      }));
      return null;
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setState(prev => ({
        ...prev,
        error: "Screen sharing is not supported in this browser",
      }));
      return null;
    }

    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor",
        },
        audio: true,
      });

      screenRef.current = screen;

      // Handle browser's native "Stop sharing" button
      screen.getVideoTracks()[0].addEventListener("ended", () => {
        screenRef.current = null;
        setState(prev => ({
          ...prev,
          screenStream: null,
          screenSharing: false,
        }));
      });

      setState(prev => ({
        ...prev,
        screenStream: screen,
        screenSharing: true,
        error: null,
      }));

      return screen;
    } catch (err) {
      let errorMsg = "Could not start screen sharing";

      if (err.name === "NotAllowedError") {
        errorMsg = "Screen share permission denied";
      } else if (err.name === "AbortError") {
        errorMsg = "Screen sharing cancelled";
      } else if (err.name === "NotSupportedError") {
        errorMsg = "Screen sharing is not supported on this device";
      }

      setState(prev => ({ ...prev, error: errorMsg }));
      return null;
    }
  }, []);

  // Stop screen sharing
  const stopScreenShare = useCallback(() => {
    if (screenRef.current) {
      screenRef.current.getTracks().forEach(track => track.stop());
      screenRef.current = null;
    }

    setState(prev => ({
      ...prev,
      screenStream: null,
      screenSharing: false,
    }));
  }, []);

  // Stop all media
  const stopMedia = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (screenRef.current) {
      screenRef.current.getTracks().forEach(track => track.stop());
      screenRef.current = null;
    }

    setState({
      stream: null,
      screenStream: null,
      videoEnabled: false,
      audioEnabled: false,
      screenSharing: false,
      error: null,
      isInitializing: false,
      streamVersion: 0,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenRef.current) {
        screenRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return {
    ...state,
    startMedia,
    toggleVideo,
    toggleAudio,
    startScreenShare,
    stopScreenShare,
    stopMedia,
    isScreenShareSupported,
    isMobile: isMobileOrTablet(),
  };
};