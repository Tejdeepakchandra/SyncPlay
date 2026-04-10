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
  const normalizedRoomCode = String(roomCode || "").trim().toUpperCase();
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
  const startupConvergenceTimersRef = useRef([]);
  const driftSuppressUntilRef = useRef(0);
  const clientEventSeqRef = useRef(0);
  const lastDriftTickRef = useRef(0);

  const getMediaSig = useCallback((media) => {
    if (!media) return "none";
    return `${media.type || "none"}:${media.videoId || media.videoUrl || media.id || ""}`;
  }, []);

  const nextClientEventId = useCallback((eventName) => {
    clientEventSeqRef.current += 1;
    return `${normalizedRoomCode || "room"}:${eventName}:${Date.now()}:${clientEventSeqRef.current}`;
  }, [normalizedRoomCode]);

  const applyPlaybackState = useCallback((playback, options = {}) => {
    if (!playback) return;

    const clearStartupConvergence = () => {
      if (!startupConvergenceTimersRef.current?.length) return;
      startupConvergenceTimersRef.current.forEach((timer) => clearTimeout(timer));
      startupConvergenceTimersRef.current = [];
    };

    const scheduleStartupConvergence = (baseTime, startAt, playbackRate = 1) => {
      clearStartupConvergence();
      if (!Number.isFinite(baseTime) || !Number.isFinite(startAt)) return;

      const safeRate = Number.isFinite(playbackRate) ? playbackRate : 1;
      const scheduleAt = [760];
      scheduleAt.forEach((delayMs) => {
        const timer = setTimeout(() => {
          const serverNow = Date.now() + ntpOffsetRef.current;
          const elapsedSec = Math.max(0, (serverNow - startAt) / 1000);
          const projected = baseTime + elapsedSec * safeRate;

          // Avoid startup flicker: only apply if local drift is still meaningfully large.
          const localPos = typeof getCurrentPosition === "function"
            ? Number(getCurrentPosition())
            : Number.NaN;
          if (Number.isFinite(localPos) && Math.abs(projected - localPos) < 0.55) {
            return;
          }

          handlersRef.current.onSeek?.(projected);
          lastAppliedRef.current.time = projected;
        }, delayMs);
        startupConvergenceTimersRef.current.push(timer);
      });
    };

    const force = !!options.force;
    const media = playback.media ?? lastMediaRef.current ?? null;
    const mediaSig = getMediaSig(media);
    const hasVersion = Number.isFinite(playback.version);
    const mediaChanged = mediaSig !== lastAppliedRef.current.mediaSig;
    if (hasVersion && !force && playback.version < lastAppliedRef.current.version) {
      return;
    }

    // Same-version updates can still carry authoritative media changes.
    if (hasVersion && !force && playback.version === lastAppliedRef.current.version && !mediaChanged) {
      return;
    }

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

    if (!playback.isPlaying) {
      clearStartupConvergence();
    }

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
          if (hasStartAt) {
            scheduleStartupConvergence(baseTime, playback.startAt, playback.playbackRate || 1);
          }
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
          if (hasStartAt) {
            scheduleStartupConvergence(baseTime, playback.startAt, playback.playbackRate || 1);
          }
          lastAppliedRef.current.time = projectedTime;
        } else {
          if (pendingPlayTimeoutRef.current) {
            clearTimeout(pendingPlayTimeoutRef.current);
            pendingPlayTimeoutRef.current = null;
          }
          clearStartupConvergence();
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
  }, [getMediaSig, timeUnit, getCurrentPosition]);

  useEffect(() => {
    handlersRef.current = { onMediaChange, onPlay, onPause, onSeek, onRateAdjust, onSyncUpdate, onSyncConflict };
  }, [onMediaChange, onPlay, onPause, onSeek, onRateAdjust, onSyncUpdate, onSyncConflict]);

  useEffect(() => {
    const seekCoalesce = seekCoalesceRef.current;
    const pendingControlTimeoutRefObj = pendingControlTimeoutRef;
    const pendingPlayTimeoutRefObj = pendingPlayTimeoutRef;
    const startupConvergenceTimersRefObj = startupConvergenceTimersRef;

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
      if (startupConvergenceTimersRefObj.current?.length) {
        startupConvergenceTimersRefObj.current.forEach((timer) => clearTimeout(timer));
        startupConvergenceTimersRefObj.current = [];
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

       // Keep initiator aligned with the same authoritative timeline as everyone else.
      if (response?.state) {
        const playback = toPlaybackFromState(response.state);
        if (playback) {
          applyPlaybackState(playback, { force: true });
        }
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
    if (!normalizedRoomCode) return;

    if (mode === "advanced") {
      const handleMediaChange = (data) => {
        const eventTs = Number(data?.timestamp) || Date.now();
        if (eventTs <= lastMediaTimestampRef.current) {
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

      socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
      const handleReconnect = () => {
        socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
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
    socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
    const handleReconnect = () => {
      socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
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
  }, [normalizedRoomCode, mode, applyPlaybackState, getMediaSig, toPlaybackFromState]);

  const emitDriftCheck = useCallback(() => {
    if (mode !== "advanced") return;
    if (!enableDriftCorrection) return;
    if (!normalizedRoomCode) return;
    if (typeof getCurrentPosition !== "function") return;
    if (controlPending) return;
    if (Date.now() < driftSuppressUntilRef.current) return;

    const clientPosition = Number(getCurrentPosition());
    if (!Number.isFinite(clientPosition)) return;

    socket.emit(
      "sync:check-position",
      {
        roomCode: normalizedRoomCode,
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
  }, [mode, enableDriftCorrection, normalizedRoomCode, getCurrentPosition, controlPending]);

  useEffect(() => {
    if (mode !== "advanced") return;
    if (!enableDriftCorrection) return;
    if (!normalizedRoomCode) return;
    if (typeof getCurrentPosition !== "function") return;

    lastDriftTickRef.current = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      const jumpMs = Math.abs(now - lastDriftTickRef.current - Math.max(1000, driftIntervalMs));
      lastDriftTickRef.current = now;

      // Large local clock jumps can invalidate offset math; force authoritative refresh.
      if (jumpMs > 12000) {
        const t1 = Date.now();
        socket.emit("sync:clock-sync", {
          samples: [{ t1, t2: t1, t3: Date.now(), t4: Date.now() }],
        }, (resp) => {
          if (resp?.success && Number.isFinite(resp.offset)) {
            ntpOffsetRef.current = resp.offset;
            setNtpOffset(resp.offset);
          }
        });
        socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
      }

      emitDriftCheck();
    }, Math.max(1000, driftIntervalMs));

    return () => clearInterval(timer);
  }, [mode, enableDriftCorrection, normalizedRoomCode, driftIntervalMs, emitDriftCheck, getCurrentPosition]);

  useEffect(() => {
    if (mode !== "advanced") return;
    if (!enableDriftCorrection) return;

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
        emitDriftCheck();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [mode, enableDriftCorrection, normalizedRoomCode, emitDriftCheck]);

  const broadcast = useCallback((event) => {
    if (!canControl || !normalizedRoomCode) return;
    if (mode === "advanced") {
      if (event.event === "media_change") {
        const payload = { roomCode: normalizedRoomCode, media: event.media };
        socket.emit("sync:media-change", payload, (response) => {
          if (response?.success) {
            if (response.currentPlayback) {
              applyPlaybackState(response.currentPlayback, { force: true });
            }
            return;
          }

          if (!response?.success) {
            handlersRef.current.onSyncConflict?.({
              event: "media_change",
              attemptedPayload: payload,
              error: response?.error || "Failed to apply media change",
            });
            socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
          }
        });
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
          roomCode: normalizedRoomCode,
          timestamp: typeof event.time === "number" ? event.time : 0,
          duration: event.duration,
          latency: 100,
          clientVersion: latestVersionRef.current,
          clientEventId: nextClientEventId("play"),
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
          roomCode: normalizedRoomCode,
          timestamp: typeof event.time === "number" ? event.time : 0,
          duration: event.duration,
          clientVersion: latestVersionRef.current,
          clientEventId: nextClientEventId("pause"),
        };
        lastControlEmitRef.current = { event: "pause", at: now, time: payload.timestamp };
        markControlPending("pause");
        socket.emit("sync:pause", payload, (response) => handleControlAck("pause", payload, response));
        return;
      }
      if (event.event === "seek") {
        const payload = {
          roomCode: normalizedRoomCode,
          newTime: typeof event.time === "number" ? event.time : 0,
          duration: event.duration,
          clientVersion: latestVersionRef.current,
          clientEventId: nextClientEventId("seek"),
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

    socket.emit("sync:broadcast", { roomCode: normalizedRoomCode, ...event });
  }, [canControl, normalizedRoomCode, mode, handleControlAck, markControlPending, nextClientEventId, applyPlaybackState]);

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
    socket.emit("sync:request-state", { roomCode: normalizedRoomCode });
  }, [normalizedRoomCode]);

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