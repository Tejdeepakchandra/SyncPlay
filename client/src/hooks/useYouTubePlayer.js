import { useEffect, useRef, useCallback, useState } from "react";

/**
 * YouTube IFrame Player API Hook
 * Manages YouTube player lifecycle and events
 * Integrates with sync engine for play/pause/seek
 */

let apiLoaded = false;
let apiReady = false;
const readyCallbacks = [];

// Load YouTube IFrame API
const ensureAPI = (cb) => {
  if (window.YT?.Player) {
    apiReady = true;
    cb();
    return;
  }

  if (apiReady) {
    cb();
    return;
  }

  readyCallbacks.push(cb);

  if (apiLoaded) return;

  apiLoaded = true;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(tag);

  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    readyCallbacks.forEach((fn) => fn());
    readyCallbacks.length = 0;
  };
};

// Map YouTube state codes to readable states
const mapState = (code) => {
  switch (code) {
    case -1: return "unstarted";
    case 0: return "ended";
    case 1: return "playing";
    case 2: return "paused";
    case 3: return "buffering";
    case 5: return "cued";
    default: return "unknown";
  }
};

export const useYouTubePlayer = ({ videoId, onStateChange, onReady, onVideoChange }) => {
  const playerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerState, setPlayerState] = useState("unstarted");
  const timeIntervalRef = useRef(null);
  const suppressSyncRef = useRef(false);
  const [apiIsReady, setApiIsReady] = useState(apiReady);
  const currentVideoIdRef = useRef(videoId);
  const playerReadyRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastDurationRef = useRef(0);

  // Refs for callbacks
  const onStateChangeRef = useRef(onStateChange);
  const onReadyRef = useRef(onReady);
  const onVideoChangeRef = useRef(onVideoChange);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
    onReadyRef.current = onReady;
    onVideoChangeRef.current = onVideoChange;
  }, [onStateChange, onReady, onVideoChange]);

  // Destroy player
  const destroyPlayer = useCallback(() => {
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch { /* player already destroyed */ }
      playerRef.current = null;
    }
    playerReadyRef.current = false;
    if (wrapperRef.current) {
      wrapperRef.current.innerHTML = "";
    }
    setPlayerState("unstarted");
    setDuration(0);
    setCurrentTime(0);
  }, []);

  // Load API
  useEffect(() => {
    ensureAPI(() => setApiIsReady(true));
  }, []);

  // If YouTube media is closed in UI, fully tear down iframe/player.
  useEffect(() => {
    if (!videoId) {
      destroyPlayer();
    }
  }, [videoId, destroyPlayer]);

  // Create player when ready
  useEffect(() => {
    if (!videoId || !apiIsReady) return;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 10;

    const hasMountedIframe = !!wrapperRef.current?.querySelector("iframe");
    if (playerRef.current?.loadVideoById && hasMountedIframe && playerReadyRef.current) {
      try {
        playerRef.current.loadVideoById(videoId);
        playerRef.current.playVideo?.();
        return;
      } catch {
        // Fallback to recreate flow below when player is in bad state.
      }
    }

    const tryCreate = () => {
      if (cancelled) return;

      if (!wrapperRef.current) {
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(tryCreate, 100);
        }
        return;
      }

      destroyPlayer();

      const target = document.createElement("div");
      target.style.width = "100%";
      target.style.height = "100%";
      wrapperRef.current.appendChild(target);

      try {
        playerRef.current = new window.YT.Player(target, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            controls: 1,
            disablekb: 0,
            iv_load_policy: 3,
            fs: 0,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              playerReadyRef.current = true;
              setDuration(e.target.getDuration());
              e.target.playVideo();
              onReadyRef.current?.();
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const state = mapState(e.data);
              setPlayerState(state);
              onStateChangeRef.current?.(state);
              if (e.target.getDuration() > 0) {
                setDuration(e.target.getDuration());
              }
            },
            onError: () => {
              if (cancelled) return;
              setPlayerState("error");
              onStateChangeRef.current?.("error");
            },
          },
        });
      } catch (err) {
        console.error("Failed to create YouTube player:", err);
      }
    };

    setTimeout(tryCreate, 50);

    return () => {
      cancelled = true;
    };
  }, [videoId, apiIsReady, destroyPlayer]);

  // Update video ID ref
  useEffect(() => {
    currentVideoIdRef.current = videoId;
  }, [videoId]);

  // Time tracking interval
  useEffect(() => {
    timeIntervalRef.current = setInterval(() => {
      if (playerRef.current?.getCurrentTime) {
        try {
          const time = playerRef.current.getCurrentTime();
          if (Math.abs(time - lastTimeRef.current) >= 0.5) {
            lastTimeRef.current = time;
            setCurrentTime(time);
          }

          const dur = playerRef.current.getDuration();
          if (dur > 0 && Math.abs(dur - lastDurationRef.current) >= 0.5) {
            lastDurationRef.current = dur;
            setDuration(dur);
          }

          // Detect video changes
          const url = playerRef.current.getVideoUrl?.();
          if (url) {
            const watchMatch = url.match(/[?&]v=([^&]+)/);
            const embedMatch = url.match(/\/embed\/([^?&/]+)/);
            const shortMatch = url.match(/youtu\.be\/([^?&/]+)/);
            const detectedId = watchMatch?.[1] ?? embedMatch?.[1] ?? shortMatch?.[1];

            if (detectedId && detectedId !== currentVideoIdRef.current) {
              currentVideoIdRef.current = detectedId;
              onVideoChangeRef.current?.(detectedId);
            }
          }
        } catch { /* player not ready */ }
      }
    }, 1000);

    return () => {
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
    };
  }, []);

  // Player controls
  const play = useCallback(() => {
    playerRef.current?.playVideo?.();
  }, []);

  const pause = useCallback(() => {
    playerRef.current?.pauseVideo?.();
  }, []);

  const seekTo = useCallback((seconds, allowSeekAhead = true) => {
    suppressSyncRef.current = true;
    playerRef.current?.seekTo?.(seconds, allowSeekAhead);
    setTimeout(() => {
      suppressSyncRef.current = false;
    }, 500);
  }, []);

  const seekToPercent = useCallback((pct) => {
    if (duration > 0) {
      seekTo((pct / 100) * duration);
    }
  }, [duration, seekTo]);

  const setVolume = useCallback((vol) => {
    playerRef.current?.setVolume?.(vol);
  }, []);

  const mute = useCallback(() => {
    playerRef.current?.mute?.();
  }, []);

  const unmute = useCallback(() => {
    playerRef.current?.unMute?.();
  }, []);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return {
    wrapperRef,
    player: playerRef,
    play,
    pause,
    seekTo,
    seekToPercent,
    setVolume,
    mute,
    unmute,
    duration,
    currentTime,
    progressPercent,
    playerState,
    suppressSyncRef,
    destroyPlayer,
  };
};