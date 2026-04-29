import { useEffect, useRef, useCallback, useState } from "react";

/**
 * YouTube IFrame Player API Hook
 * Manages YouTube player lifecycle and events
 * Integrates with sync engine for play/pause/seek
 */

// Suppress YouTube IFrame API console noise (errors from www-embed-player.js, etc.)
// Uses a version number so HMR re-applies the updated filter.
const _YT_FILTER_VERSION = 3;
if (typeof window !== "undefined" && window.__ytConsoleFilterVersion !== _YT_FILTER_VERSION) {
  // Restore original console methods if previously patched, then re-patch
  const origError = window.__ytOrigConsoleError || console.error;
  const origWarn = window.__ytOrigConsoleWarn || console.warn;
  window.__ytOrigConsoleError = origError;
  window.__ytOrigConsoleWarn = origWarn;
  window.__ytConsoleFilterVersion = _YT_FILTER_VERSION;
  const ytNoise = /(?:www-embed-player|youtube\.com\/embed|Failed to execute 'postMessage'|blocked a frame|embed\?enablejsapi|Encountered two children with the same key)/i;
  console.error = (...args) => {
    if (args.some(a => typeof a === "string" && ytNoise.test(a))) return;
    origError.apply(console, args);
  };
  console.warn = (...args) => {
    if (args.some(a => typeof a === "string" && ytNoise.test(a))) return;
    origWarn.apply(console, args);
  };
}

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

export const useYouTubePlayer = ({ videoId, controlsEnabled = true, onStateChange, onReady, onVideoChange, onError }) => {
  const playerRef = useRef(null);
  const wrapperRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerState, setPlayerState] = useState("unstarted");
  const timeIntervalRef = useRef(null);
  const suppressSyncRef = useRef(false);
  const [apiIsReady, setApiIsReady] = useState(apiReady);
  const currentVideoIdRef = useRef(videoId);
  const lastControlsEnabledRef = useRef(controlsEnabled);
  const playerReadyRef = useRef(false);
  const lastTimeRef = useRef(0);
  const lastDurationRef = useRef(0);

  // Refs for callbacks
  const onStateChangeRef = useRef(onStateChange);
  const onReadyRef = useRef(onReady);
  const onVideoChangeRef = useRef(onVideoChange);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
    onReadyRef.current = onReady;
    onVideoChangeRef.current = onVideoChange;
    onErrorRef.current = onError;
  }, [onStateChange, onReady, onVideoChange, onError]);

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
    const maxRetries = 120;

    const hasMountedIframe = !!wrapperRef.current?.querySelector("iframe");
    const controlsUnchanged = lastControlsEnabledRef.current === controlsEnabled;
    if (playerRef.current?.loadVideoById && hasMountedIframe && playerReadyRef.current && controlsUnchanged) {
      try {
        if (typeof playerRef.current.cueVideoById === "function") {
          playerRef.current.cueVideoById(videoId);
        } else {
          playerRef.current.loadVideoById(videoId);
        }
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
        } else {
          setPlayerState("error");
          onErrorRef.current?.("wrapper_timeout");
          onStateChangeRef.current?.("error", { errorCode: "wrapper_timeout" });
        }
        return;
      }

      destroyPlayer();

      const target = document.createElement("div");
      target.style.width = "100%";
      target.style.height = "100%";
      wrapperRef.current.appendChild(target);

      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.tagName === 'IFRAME') {
              node.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            }
          });
        });
      });
      observer.observe(wrapperRef.current, { childList: true });

      try {
        playerRef.current = new window.YT.Player(target, {
          videoId,
          host: "https://www.youtube.com",
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 0,
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            // Keep controls visible for all viewers so autoplay-blocked browsers are never stuck on a black frame.
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
              lastControlsEnabledRef.current = controlsEnabled;
              if (typeof e.target.cueVideoById === "function") {
                e.target.cueVideoById(videoId);
              }
              setDuration(e.target.getDuration());
              onReadyRef.current?.();
            },
            onStateChange: (e) => {
              if (cancelled) return;
              const state = mapState(e.data);
              setPlayerState(state);
              const playerTime = typeof e.target?.getCurrentTime === "function"
                ? e.target.getCurrentTime()
                : 0;
              const playerDuration = typeof e.target?.getDuration === "function"
                ? e.target.getDuration()
                : 0;
              onStateChangeRef.current?.(state, {
                eventCode: e.data,
                playerTime,
                playerDuration,
              });
              if (e.target.getDuration() > 0) {
                setDuration(e.target.getDuration());
              }
            },
            onError: (e) => {
              if (cancelled) return;
              const errorCode = Number.isFinite(e?.data) ? e.data : null;
              setPlayerState("error");
              onErrorRef.current?.(errorCode);
              onStateChangeRef.current?.("error", { errorCode });
            },
          },
        });
      } catch (err) {
        console.error("Failed to create YouTube player:", err);
      } finally {
        setTimeout(() => observer.disconnect(), 5000);
      }
    };

    setTimeout(tryCreate, 50);

    return () => {
      cancelled = true;
    };
  }, [videoId, controlsEnabled, apiIsReady, destroyPlayer]);

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
          if (Math.abs(time - lastTimeRef.current) >= 0.1) {
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
    }, 250);

    return () => {
      if (timeIntervalRef.current) {
        clearInterval(timeIntervalRef.current);
      }
    };
  }, []);

  // Player controls
  const withReadyPlayer = useCallback((fn) => {
    if (!playerRef.current || !playerReadyRef.current) return false;
    try {
      fn(playerRef.current);
      return true;
    } catch {
      return false;
    }
  }, []);

  const play = useCallback(() => {
    withReadyPlayer((player) => player.playVideo?.());
  }, [withReadyPlayer]);

  const pause = useCallback(() => {
    withReadyPlayer((player) => player.pauseVideo?.());
  }, [withReadyPlayer]);

  const seekTo = useCallback((seconds, allowSeekAhead = true) => {
    const didSeek = withReadyPlayer((player) => player.seekTo?.(seconds, allowSeekAhead));
    if (!didSeek) return;
    suppressSyncRef.current = true;
    setTimeout(() => {
      suppressSyncRef.current = false;
    }, 300);
  }, [withReadyPlayer]);

  // Direct API read for drift checks — avoids stale React state
  const getRealtimePosition = useCallback(() => {
    try {
      if (playerRef.current?.getCurrentTime) {
        return playerRef.current.getCurrentTime();
      }
    } catch { /* player not ready */ }
    return currentTime;
  }, [currentTime]);

  const seekToPercent = useCallback((pct) => {
    if (duration > 0) {
      seekTo((pct / 100) * duration);
    }
  }, [duration, seekTo]);

  const setVolume = useCallback((vol) => {
    withReadyPlayer((player) => player.setVolume?.(vol));
  }, [withReadyPlayer]);

  const setPlaybackRate = useCallback((rate) => {
    withReadyPlayer((player) => player.setPlaybackRate?.(rate));
  }, [withReadyPlayer]);

  const mute = useCallback(() => {
    withReadyPlayer((player) => player.mute?.());
  }, [withReadyPlayer]);

  const unmute = useCallback(() => {
    withReadyPlayer((player) => player.unMute?.());
  }, [withReadyPlayer]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return {
    wrapperRef,
    player: playerRef,
    play,
    pause,
    seekTo,
    seekToPercent,
    setVolume,
    setPlaybackRate,
    mute,
    unmute,
    getRealtimePosition,
    duration,
    currentTime,
    progressPercent,
    playerState,
    suppressSyncRef,
    destroyPlayer,
  };
};