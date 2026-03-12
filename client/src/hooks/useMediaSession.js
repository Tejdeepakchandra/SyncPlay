import { useEffect, useRef } from "react";

/**
 * Media Session API Hook
 * Enables lock-screen controls and keeps audio alive in background
 * Integrates with browser's native media controls
 */

export const useMediaSession = ({
  title = "Now Playing",
  artist = "Watchparty",
  artwork,
  isPlaying = false,
  onPlay,
  onPause,
  onSeekForward,
  onSeekBackward,
  onNextTrack,
  onPreviousTrack,
}) => {
  const silentAudioRef = useRef(null);

  // Keep a silent audio element alive to prevent audio context suspension
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    // Create a tiny silent WAV file (44 bytes) to hold the audio session open
    const audio = new Audio();
    audio.src =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
    audio.loop = true;
    audio.volume = 0.01; // Nearly silent
    silentAudioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
      silentAudioRef.current = null;
    };
  }, []);

  // Start/stop silent audio based on playback state
  useEffect(() => {
    const audio = silentAudioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Set metadata
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const artworkList = artwork
      ? [{ src: artwork, sizes: "512x512", type: "image/jpeg" }]
      : [];

    navigator.mediaSession.metadata = new MediaMetadata({
      title: title || "Now Playing",
      artist: artist || "Watchparty",
      album: "Watchparty",
      artwork: artworkList,
    });
  }, [title, artist, artwork]);

  // Set playback state
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  // Set action handlers
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const handlers = [
      ["play", onPlay],
      ["pause", onPause],
      ["seekforward", onSeekForward],
      ["seekbackward", onSeekBackward],
      ["nexttrack", onNextTrack],
      ["previoustrack", onPreviousTrack],
    ];

    handlers.forEach(([action, handler]) => {
      try {
        if (handler) {
          navigator.mediaSession.setActionHandler(action, handler);
        } else {
          navigator.mediaSession.setActionHandler(action, null);
        }
      } catch {
        // Action not supported, ignore
      }
    });

    return () => {
      handlers.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch { /* cleanup failed */ }
      });
    };
  }, [onPlay, onPause, onSeekForward, onSeekBackward, onNextTrack, onPreviousTrack]);
};