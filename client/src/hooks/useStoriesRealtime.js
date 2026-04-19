import { useEffect } from "react";
import { getSocket } from "@/services/socket";

export function useStoriesRealtime({
  enabled,
  onCreated,
  onUpdated,
  onDeleted,
  onViewed,
  onAny,
}) {
  useEffect(() => {
    if (!enabled) return;

    const socket = getSocket();

    const handleCreated = (payload) => {
      onCreated?.(payload);
      onAny?.(payload);
    };

    const handleUpdated = (payload) => {
      onUpdated?.(payload);
      onAny?.(payload);
    };

    const handleDeleted = (payload) => {
      onDeleted?.(payload);
      onAny?.(payload);
    };

    const handleViewed = (payload) => {
      onViewed?.(payload);
      onAny?.(payload);
    };

    socket.on("stories:created", handleCreated);
    socket.on("stories:updated", handleUpdated);
    socket.on("stories:deleted", handleDeleted);
    socket.on("stories:viewed", handleViewed);

    return () => {
      socket.off("stories:created", handleCreated);
      socket.off("stories:updated", handleUpdated);
      socket.off("stories:deleted", handleDeleted);
      socket.off("stories:viewed", handleViewed);
    };
  }, [enabled, onCreated, onUpdated, onDeleted, onViewed, onAny]);
}
