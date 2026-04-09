import { useEffect, useCallback, useRef, useState } from "react";
import { socket } from "@/services/socket";

export const useRoomSync = ({
  roomCode,
  isHost,
  isCoHost = false,
  onMediaChange,
  onPlay,
  onPause,
  onSeek,
  onSyncUpdate,
}) => {
  const [ntpOffset, setNtpOffset] = useState(0);
  const ntpOffsetRef = useRef(0);
  const canControl = isHost || isCoHost;
  const handlersRef = useRef({ onMediaChange, onPlay, onPause, onSeek, onSyncUpdate });

  useEffect(() => {
    handlersRef.current = { onMediaChange, onPlay, onPause, onSeek, onSyncUpdate };
  }, [onMediaChange, onPlay, onPause, onSeek, onSyncUpdate]);

  useEffect(() => {
    if (!roomCode) return;

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
  }, [roomCode]);

  const broadcast = useCallback((event) => {
    if (!canControl || !roomCode) return;
    socket.emit("sync:broadcast", { roomCode, ...event });
  }, [canControl, roomCode]);

  const broadcastMediaChange = useCallback((media) => {
    broadcast({ event: "media_change", media });
  }, [broadcast]);

  const broadcastPlay = useCallback(() => {
    broadcast({ event: "play", timestamp: Date.now() });
  }, [broadcast]);

  const broadcastPause = useCallback(() => {
    broadcast({ event: "pause", timestamp: Date.now() });
  }, [broadcast]);

  const broadcastSeek = useCallback((time) => {
    broadcast({ event: "seek", timestamp: Date.now(), time });
  }, [broadcast]);

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
    requestSync,
  };
};