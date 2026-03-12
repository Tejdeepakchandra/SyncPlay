import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useRoomSync = ({
  roomId,
  isHost,
  isCoHost = false,
  onMediaChange,
  onPlay,
  onPause,
  onSeek,
}) => {
  const { user } = useAuth();
  const channelRef = useRef(null);
  const subscribedRef = useRef(false);
  const handlersRef = useRef({ onMediaChange, onPlay, onPause, onSeek });
  const canControl = isHost || isCoHost;

  useEffect(() => {
    handlersRef.current = { onMediaChange, onPlay, onPause, onSeek };
  }, [onMediaChange, onPlay, onPause, onSeek]);

  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room-sync-${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on("broadcast", { event: "sync" }, ({ payload }) => {
        if (payload.senderId === user?.id) return;

        switch (payload.event) {
          case "media_change":
            handlersRef.current.onMediaChange?.(payload.media);
            break;
          case "play":
            handlersRef.current.onPlay?.();
            break;
          case "pause":
            handlersRef.current.onPause?.();
            break;
          case "seek":
            if (payload.time !== undefined) handlersRef.current.onSeek?.(payload.time);
            break;
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          subscribedRef.current = true;
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user?.id]);

  const broadcast = useCallback((event) => {
    if (!canControl) return;
    channelRef.current?.send({
      type: "broadcast",
      event: "sync",
      payload: { ...event, senderId: user?.id, timestamp: Date.now() },
    });
  }, [canControl, user?.id]);

  const broadcastMediaChange = useCallback((media) => {
    broadcast({ event: "media_change", media });
  }, [broadcast]);

  const broadcastPlay = useCallback(() => {
    broadcast({ event: "play" });
  }, [broadcast]);

  const broadcastPause = useCallback(() => {
    broadcast({ event: "pause" });
  }, [broadcast]);

  const broadcastSeek = useCallback((pct) => {
    broadcast({ event: "seek", time: pct });
  }, [broadcast]);

  return {
    broadcastMediaChange,
    broadcastPlay,
    broadcastPause,
    broadcastSeek,
    canControl,
  };
};