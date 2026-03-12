import { useState, useCallback, useRef, useEffect } from "react";

/**
 * WebRTC Local Media Hook
 * Manages local camera, microphone, and screen sharing
 * Returns streams and controls for media devices
 */

export const useWebRTC = () => {
  const [state, setState] = useState({
    stream: null,
    screenStream: null,
    videoEnabled: false,
    audioEnabled: false,
    screenSharing: false,
    error: null,
    isInitializing: false,
  });

  const streamRef = useRef(null);
  const screenRef = useRef(null);

  // Start camera and microphone
  const startMedia = useCallback(async (video = true, audio = true) => {
    setState(prev => ({ ...prev, isInitializing: true, error: null }));

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        } : false,
        audio: audio ? {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } : false,
      });

      streamRef.current = stream;

      setState(prev => ({
        ...prev,
        stream,
        videoEnabled: video,
        audioEnabled: audio,
        error: null,
        isInitializing: false,
      }));

      return stream;
    } catch (err) {
      let errorMsg = "Could not access media devices";

      if (err.name === "NotAllowedError") {
        errorMsg = "Camera/mic permission denied";
      } else if (err.name === "NotFoundError") {
        errorMsg = "No camera/mic found";
      } else if (err.name === "NotReadableError") {
        errorMsg = "Camera/mic already in use";
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
  const toggleVideo = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) return;

    const enabled = !videoTracks[0].enabled;
    videoTracks[0].enabled = enabled;

    setState(prev => ({ ...prev, videoEnabled: enabled }));
  }, []);

  // Toggle audio track
  const toggleAudio = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const enabled = !audioTracks[0].enabled;
    audioTracks[0].enabled = enabled;

    setState(prev => ({ ...prev, audioEnabled: enabled }));
  }, []);

  // Start screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor",
        },
        audio: false,
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
  };
};