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
    if (wrapperRef.current) {
      wrapperRef.current.innerHTML = "";
    }
  }, []);

  // Load API
  useEffect(() => {
    ensureAPI(() => setApiIsReady(true));
  }, []);

  // Block top-level navigation attempts
  useEffect(() => {
    if (!videoId || !apiIsReady) return;

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    const handleClick = (e) => {
      const target = e.target;
      const anchor = target.closest?.("a");
      if (anchor) {
        const href = anchor.getAttribute("href") || "";
        if (href.includes("youtube.com") || href.includes("youtu.be")) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
    };
  }, [videoId, apiIsReady]);

  // Create player when ready
  useEffect(() => {
    if (!videoId || !apiIsReady) return;

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 10;

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
          },
        });
      } catch (err) {
        console.error("Failed to create YouTube player:", err);
      }
    };

    setTimeout(tryCreate, 50);

    return () => {
      cancelled = true;
      destroyPlayer();
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
          setCurrentTime(time);

          const dur = playerRef.current.getDuration();
          if (dur > 0) setDuration(dur);

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
    }, 500);

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