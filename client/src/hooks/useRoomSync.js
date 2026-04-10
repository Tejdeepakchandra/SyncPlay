import { useEffect, useCallback, useRef, useState } from "react";
import { socket } from "@/services/socket";

export const useRoomSync = ({
  roomCode,
  mode = "legacy", // "legacy" | "advanced"
  isHost,
  isCoHost = false,
  canControlOverride,
  timeUnit = "percent", // "percent" | "seconds"
  enableDriftCorrection = false,
  driftIntervalMs = 5000,
  getCurrentPosition,
  onMediaChange,
  onPlay,
  onPause,
  onSeek,
  onRateAdjust,
  onSyncUpdate,
  onSyncConflict,
}) => {
  const [ntpOffset, setNtpOffset] = useState(0);
  const [controlPending, setControlPending] = useState(null);
  const ntpOffsetRef = useRef(0);
  const canControl = typeof canControlOverride === "boolean" ? canControlOverride : (isHost || isCoHost);
  const handlersRef = useRef({ onMediaChange, onPlay, onPause, onSeek, onRateAdjust, onSyncUpdate, onSyncConflict });
  const lastMediaRef = useRef(null);
  const lastAppliedRef = useRef({ mediaSig: null, isPlaying: null, time: null, version: -1 });
  const latestVersionRef = useRef(0);
  const lastSyncTimestampRef = useRef(0);
  const lastMediaTimestampRef = useRef(0);
  const lastMediaBroadcastRef = useRef({ sig: null, at: 0 });
  const lastControlEmitRef = useRef({ event: null, at: 0, time: null });
  const seekCoalesceRef = useRef({ timer: null, payload: null });
  const pendingControlTimeoutRef = useRef(null);
  const pendingPlayTimeoutRef = useRef(null);
  const driftSuppressUntilRef = useRef(0);

  const getMediaSig = useCallback((media) => {
    if (!media) return "none";
    return `${media.type || "none"}:${media.videoId || media.videoUrl || media.id || ""}`;
  }, []);

  const applyPlaybackState = useCallback((playback, options = {}) => {
    if (!playback) return;
    const force = !!options.force;
    const hasVersion = Number.isFinite(playback.version);
    if (hasVersion && !force && playback.version <= lastAppliedRef.current.version) {
      return;
    }

    const media = playback.media ?? lastMediaRef.current ?? null;
    const mediaSig = getMediaSig(media);
    if (mediaSig !== lastAppliedRef.current.mediaSig) {
      lastMediaRef.current = media;
      handlersRef.current.onMediaChange?.(media || { type: "none" });
      lastAppliedRef.current.mediaSig = mediaSig;
    }

    const baseTime = typeof playback.time === "number" ? playback.time : 0;
    const hasStartAt = typeof playback.startAt === "number";
    const estimatedServerNow = Date.now() + ntpOffsetRef.current;
    const msUntilStart = hasStartAt ? (playback.startAt - estimatedServerNow) : 0;
    const shouldScheduleStart = playback.isPlaying === true && msUntilStart > 35;

    if (typeof playback.time === "number" && !shouldScheduleStart) {
      const threshold = timeUnit === "seconds" ? 0.2 : 0.5;
      if (force || lastAppliedRef.current.time == null || Math.abs(playback.time - lastAppliedRef.current.time) >= threshold) {
        handlersRef.current.onSeek?.(playback.time);
        lastAppliedRef.current.time = playback.time;
      }
    }

    if (typeof playback.isPlaying === "boolean") {
      if (shouldScheduleStart) {
        if (pendingPlayTimeoutRef.current) {
          clearTimeout(pendingPlayTimeoutRef.current);
          pendingPlayTimeoutRef.current = null;
        }

        const shouldPauseNow = force || lastAppliedRef.current.isPlaying !== false;
        if (shouldPauseNow) {
          handlersRef.current.onPause?.(baseTime);
          lastAppliedRef.current.isPlaying = false;
        }

        pendingPlayTimeoutRef.current = setTimeout(() => {
          pendingPlayTimeoutRef.current = null;
          const serverNowAtPlay = Date.now() + ntpOffsetRef.current;
          const elapsedSec = hasStartAt ? Math.max(0, (serverNowAtPlay - playback.startAt) / 1000) : 0;
          const projectedTime = baseTime + elapsedSec;
          handlersRef.current.onSeek?.(projectedTime);
          handlersRef.current.onPlay?.(projectedTime);
          lastAppliedRef.current.time = projectedTime;
          lastAppliedRef.current.isPlaying = true;
        }, msUntilStart);
      }

      if (force || playback.isPlaying !== lastAppliedRef.current.isPlaying) {
        if (playback.isPlaying && !shouldScheduleStart) {
          if (pendingPlayTimeoutRef.current) {
            clearTimeout(pendingPlayTimeoutRef.current);
            pendingPlayTimeoutRef.current = null;
          }

          const elapsedSec = hasStartAt ? Math.max(0, (estimatedServerNow - playback.startAt) / 1000) : 0;
          const projectedTime = baseTime + elapsedSec;
          handlersRef.current.onPlay?.(projectedTime);
          lastAppliedRef.current.time = projectedTime;
        } else {
          if (pendingPlayTimeoutRef.current) {
            clearTimeout(pendingPlayTimeoutRef.current);
            pendingPlayTimeoutRef.current = null;
          }
          handlersRef.current.onPause?.(baseTime);
        }
        if (!shouldScheduleStart) {
          lastAppliedRef.current.isPlaying = playback.isPlaying;
        }
      }
    }

    if (hasVersion) {
      lastAppliedRef.current.version = playback.version;
      latestVersionRef.current = playback.version;
    }
  }, [getMediaSig, timeUnit]);

  useEffect(() => {
    handlersRef.current = { onMediaChange, onPlay, onPause, onSeek, onRateAdjust, onSyncUpdate, onSyncConflict };
  }, [onMediaChange, onPlay, onPause, onSeek, onRateAdjust, onSyncUpdate, onSyncConflict]);

  useEffect(() => {
    const seekCoalesce = seekCoalesceRef.current;
    const pendingControlTimeoutRefObj = pendingControlTimeoutRef;
    const pendingPlayTimeoutRefObj = pendingPlayTimeoutRef;

    return () => {
      const seekTimer = seekCoalesce?.timer;
      if (seekTimer) {
        clearTimeout(seekTimer);
      }
      const pendingTimer = pendingControlTimeoutRefObj.current;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
      }
      const playTimer = pendingPlayTimeoutRefObj.current;
      if (playTimer) {
        clearTimeout(playTimer);
      }
    };
  }, []);

  const markControlPending = useCallback((eventName) => {
    setControlPending(eventName);
    if (pendingControlTimeoutRef.current) {
      clearTimeout(pendingControlTimeoutRef.current);
    }
    pendingControlTimeoutRef.current = setTimeout(() => {
      setControlPending(null);
      pendingControlTimeoutRef.current = null;
    }, 1800);
    driftSuppressUntilRef.current = Date.now() + 2400;
  }, []);

  const clearControlPending = useCallback(() => {
    setControlPending(null);
    if (pendingControlTimeoutRef.current) {
      clearTimeout(pendingControlTimeoutRef.current);
      pendingControlTimeoutRef.current = null;
    }
  }, []);

  const toPlaybackFromState = useCallback((state) => {
    if (!state) return null;
    return {
      media: lastMediaRef.current,
      isPlaying: !!state.isPlaying,
      playbackRate: state.playbackRate,
      version: state.version,
      time: typeof state.baseTimestamp === "number" ? state.baseTimestamp : 0,
      startAt: state.startAt,
    };
  }, []);

  const handleControlAck = useCallback((eventName, payload, response) => {
    clearControlPending();
    if (!response) return;
    if (response.success) {
      if (Number.isFinite(response?.state?.version)) {
        latestVersionRef.current = response.state.version;
      }
      return;
    }

    if (response.error && response.error !== "Stale client") {
      handlersRef.current.onSyncConflict?.({
        event: eventName,
        attemptedPayload: payload,
        error: response.error,
      });
      socket.emit("sync:request-state", { roomCode });
      return;
    }

    if (response.error === "Stale client" && response.currentState) {
      handlersRef.current.onSyncConflict?.({
        event: eventName,
        attemptedPayload: payload,
        currentState: response.currentState,
      });

      const playback = toPlaybackFromState(response.currentState);
      if (playback) {
        applyPlaybackState(playback, { force: true });
      }
      socket.emit("sync:request-state", { roomCode });
    }
  }, [applyPlaybackState, roomCode, toPlaybackFromState, clearControlPending]);

  useEffect(() => {
    if (!roomCode) return;

    if (mode === "advanced") {
      const handleMediaChange = (data) => {
        const eventTs = Number(data?.timestamp) || Date.now();
        if (eventTs <= lastMediaTimestampRef.current || eventTs <= lastSyncTimestampRef.current) {
          return;
        }

        const media = data?.media || null;
        lastMediaTimestampRef.current = eventTs;
        lastMediaRef.current = media;
        handlersRef.current.onMediaChange?.(media);
        lastAppliedRef.current.mediaSig = getMediaSig(media);
      };

      const handleSyncUpdate = (data) => {
        const serverTime = data.timestamp;
        if (typeof serverTime === "number" && serverTime <= lastSyncTimestampRef.current) {
          return;
        }

        if (typeof serverTime === "number") {
          lastSyncTimestampRef.current = serverTime;
        }

        if (Number.isFinite(data?.currentPlayback?.updatedAt)) {
          lastMediaTimestampRef.current = Math.max(lastMediaTimestampRef.current, data.currentPlayback.updatedAt);
        }

        const clientTime = Date.now();
        const offset = serverTime - clientTime;
        ntpOffsetRef.current = offset;
        setNtpOffset(offset);

        handlersRef.current.onSyncUpdate?.({
          serverTime,
          clientTime,
          offset,
          currentPlayback: data.currentPlayback,
        });

        const hasAppliedState = lastAppliedRef.current.version >= 0;
        applyPlaybackState(data.currentPlayback, { force: !hasAppliedState });
      };

      const handleStateUpdate = (data) => {
        const state = data?.state;
        if (!state) return;
        driftSuppressUntilRef.current = Date.now() + 1200;
        const playback = {
          ...toPlaybackFromState(state),
          media: data?.media || lastMediaRef.current,
        };
        applyPlaybackState(playback);
      };

      socket.on("sync:media-change", handleMediaChange);
      socket.on("sync:update", handleSyncUpdate);
      socket.on("sync:state-update", handleStateUpdate);

      socket.emit("sync:request-state", { roomCode });
      const handleReconnect = () => {
        socket.emit("sync:request-state", { roomCode });
      };
      socket.on("connect", handleReconnect);

      return () => {
        socket.off("sync:media-change", handleMediaChange);
        socket.off("sync:update", handleSyncUpdate);
        socket.off("sync:state-update", handleStateUpdate);
        socket.off("connect", handleReconnect);
      };
    }

    // Listen for sync events
    const handleMediaChange = (data) => {
      handlersRef.current.onMediaChange?.(data.media);
    };

    const handlePlay = (data) => {
      // Adjust time by NTP offset
      const adjustedTime = data.timestamp ? (data.timestamp + ntpOffsetRef.current) / 1000 : 0;
      handlersRef.current.onPlay?.(adjustedTime);
    };

    const handlePause = (data) => {
      const adjustedTime = data.timestamp ? (data.timestamp + ntpOffsetRef.current) / 1000 : 0;
      handlersRef.current.onPause?.(adjustedTime);
    };

    const handleSeek = (data) => {
      const seekTime = typeof data.time === "number" ? data.time : 0;
      handlersRef.current.onSeek?.(seekTime);
    };

    const handleSyncUpdate = (data) => {
      // NTP clock sync
      const serverTime = data.timestamp;
      const clientTime = Date.now();
      const offset = serverTime - clientTime;
      ntpOffsetRef.current = offset;
      setNtpOffset(offset);

      handlersRef.current.onSyncUpdate?.({
        serverTime,
        clientTime,
        offset,
        currentPlayback: data.currentPlayback,
      });

      const playback = data.currentPlayback;
      if (playback?.media) {
        handlersRef.current.onMediaChange?.(playback.media);
      }
      if (typeof playback?.time === "number") {
        handlersRef.current.onSeek?.(playback.time);
      }
    };

    socket.on("sync:media-change", handleMediaChange);
    socket.on("sync:play", handlePlay);
    socket.on("sync:pause", handlePause);
    socket.on("sync:seek", handleSeek);
    socket.on("sync:update", handleSyncUpdate);

    // Pull current room media/sync snapshot on subscribe and reconnection.
    socket.emit("sync:request-state", { roomCode });
    const handleReconnect = () => {
      socket.emit("sync:request-state", { roomCode });
    };
    socket.on("connect", handleReconnect);

    return () => {
      socket.off("sync:media-change", handleMediaChange);
      socket.off("sync:play", handlePlay);
      socket.off("sync:pause", handlePause);
      socket.off("sync:seek", handleSeek);
      socket.off("sync:update", handleSyncUpdate);
      socket.off("connect", handleReconnect);
    };
  }, [roomCode, mode, applyPlaybackState, getMediaSig, toPlaybackFromState]);

  useEffect(() => {
    if (mode !== "advanced") return;
    if (!enableDriftCorrection) return;
    if (!roomCode) return;
    if (typeof getCurrentPosition !== "function") return;

    const timer = setInterval(() => {
      if (controlPending) return;
      if (Date.now() < driftSuppressUntilRef.current) return;

      const clientPosition = Number(getCurrentPosition());
      if (!Number.isFinite(clientPosition)) return;

      socket.emit(
        "sync:check-position",
        {
          roomCode,
          clientPosition,
          clientNow: Date.now(),
          clientOffset: ntpOffsetRef.current,
        },
        (response) => {
          if (!response?.success || !response?.correction) return;

          const correction = response.correction;
          if (correction.action === "hardSeek" || correction.action === "gradual") {
            handlersRef.current.onSeek?.(correction.targetPosition);
          } else if (correction.action === "rateAdjust") {
            handlersRef.current.onRateAdjust?.(correction.rate, correction);
          }
        }
      );
    }, Math.max(1000, driftIntervalMs));

    return () => clearInterval(timer);
  }, [mode, enableDriftCorrection, roomCode, driftIntervalMs, getCurrentPosition, controlPending]);

  const broadcast = useCallback((event) => {
    if (!canControl || !roomCode) return;
    if (mode === "advanced") {
      if (event.event === "media_change") {
        socket.emit("sync:media-change", { roomCode, media: event.media });
        return;
      }
      if (event.event === "play") {
        const now = Date.now();
        const isDuplicateRapid =
          lastControlEmitRef.current.event === "play" &&
          now - lastControlEmitRef.current.at < 220 &&
          Math.abs((lastControlEmitRef.current.time ?? 0) - (event.time ?? 0)) < 0.2;
        if (isDuplicateRapid) return;

        const payload = {
          roomCode,
          timestamp: typeof event.time === "number" ? event.time : 0,
          duration: event.duration,
          latency: 100,
          clientVersion: latestVersionRef.current,
        };
        lastControlEmitRef.current = { event: "play", at: now, time: payload.timestamp };
        markControlPending("play");
        socket.emit("sync:play", payload, (response) => handleControlAck("play", payload, response));
        return;
      }
      if (event.event === "pause") {
        const now = Date.now();
        const isDuplicateRapid =
          lastControlEmitRef.current.event === "pause" &&
          now - lastControlEmitRef.current.at < 220 &&
          Math.abs((lastControlEmitRef.current.time ?? 0) - (event.time ?? 0)) < 0.2;
        if (isDuplicateRapid) return;

        const payload = {
          roomCode,
          timestamp: typeof event.time === "number" ? event.time : 0,
          duration: event.duration,
          clientVersion: latestVersionRef.current,
        };
        lastControlEmitRef.current = { event: "pause", at: now, time: payload.timestamp };
        markControlPending("pause");
        socket.emit("sync:pause", payload, (response) => handleControlAck("pause", payload, response));
        return;
      }
      if (event.event === "seek") {
        const payload = {
          roomCode,
          newTime: typeof event.time === "number" ? event.time : 0,
          duration: event.duration,
          clientVersion: latestVersionRef.current,
        };
        seekCoalesceRef.current.payload = payload;
        if (seekCoalesceRef.current.timer) {
          clearTimeout(seekCoalesceRef.current.timer);
        }
        seekCoalesceRef.current.timer = setTimeout(() => {
          const finalPayload = seekCoalesceRef.current.payload;
          seekCoalesceRef.current.payload = null;
          seekCoalesceRef.current.timer = null;
          if (!finalPayload) return;
          lastControlEmitRef.current = { event: "seek", at: Date.now(), time: finalPayload.newTime };
          markControlPending("seek");
          socket.emit("sync:seek", finalPayload, (response) => handleControlAck("seek", finalPayload, response));
        }, 120);
        return;
      }
    }

    socket.emit("sync:broadcast", { roomCode, ...event });
  }, [canControl, roomCode, mode, handleControlAck, markControlPending]);

  const broadcastMediaChange = useCallback((media) => {
    const sig = getMediaSig(media);
    const now = Date.now();
    if (lastMediaBroadcastRef.current.sig === sig && now - lastMediaBroadcastRef.current.at < 700) {
      return;
    }
    lastMediaBroadcastRef.current = { sig, at: now };
    broadcast({ event: "media_change", media });
  }, [broadcast, getMediaSig]);

  const broadcastPlay = useCallback((time = 0, duration) => {
    if (mode === "advanced") {
      broadcast({ event: "play", time, duration });
      return;
    }
    broadcast({ event: "play", timestamp: Date.now() });
  }, [broadcast, mode]);

  const broadcastPause = useCallback((time = 0, duration) => {
    if (mode === "advanced") {
      broadcast({ event: "pause", time, duration });
      return;
    }
    broadcast({ event: "pause", timestamp: Date.now() });
  }, [broadcast, mode]);

  const broadcastSeek = useCallback((time, duration) => {
    if (mode === "advanced") {
      broadcast({ event: "seek", time, duration });
      return;
    }
    broadcast({ event: "seek", timestamp: Date.now(), time });
  }, [broadcast, mode]);

  const requestSync = useCallback(() => {
    socket.emit("sync:request-state", { roomCode });
  }, [roomCode]);

  return {
    broadcastMediaChange,
    broadcastPlay,
    broadcastPause,
    broadcastSeek,
    canControl,
    ntpOffset,
    controlPending,
    requestSync,
  };
};