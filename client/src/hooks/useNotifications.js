import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/services/api";
import { getSocket } from "@/services/socket";
import { useAuth } from "@/hooks/useAuth";

export function useNotifications() {
  const { isAuthenticated, sessionLoaded, clerkLoaded, clerkUser } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const sanitizeNotifications = useCallback(
    (items) => (items || []).filter((item) => item?.type !== "dm_message"),
    []
  );

  const unreadCount = useMemo(
    () => notifications.reduce((count, n) => count + (n.read ? 0 : 1), 0),
    [notifications]
  );

  const upsertNotification = useCallback((incoming) => {
    if (!incoming?.id) return;
    if (incoming.type === "dm_message") return;
    setNotifications((prev) => {
      const idx = prev.findIndex((n) => n.id === incoming.id);
      if (idx < 0) {
        return [incoming, ...prev].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...incoming };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) {
      setNotifications([]);
      return;
    }

    let cancelled = false;

    const isTransientAuthRace = (error) => {
      const status = error?.response?.status;
      const message = String(error?.response?.data?.message || "").toLowerCase();
      return status === 401 && message.includes("authentication required");
    };

    const loadNotifications = async () => {
      try {
        await new Promise((resolve) => setTimeout(resolve, 250));
        const res = await api.get("/notifications");
        if (cancelled) return;
        const items = res?.data?.data?.notifications || [];
        setNotifications(sanitizeNotifications(items));
      } catch (error) {
        if (isTransientAuthRace(error)) {
          try {
            const retry = await api.get("/notifications");
            if (cancelled) return;
            const items = retry?.data?.data?.notifications || [];
            setNotifications(sanitizeNotifications(items));
            return;
          } catch {
            // Let socket or next polling cycle reconcile.
          }
        }

        // Keep previous state on fetch failure to avoid UI flicker.
      }
    };

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, sanitizeNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    const socket = getSocket();

    const handleNew = (payload) => {
      if (payload?.notification) {
        upsertNotification(payload.notification);
      }
    };

    const handleUpdated = (payload) => {
      if (payload?.notification) {
        upsertNotification(payload.notification);
      }
    };

    const handleAllRead = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })));
    };

    socket.on("notification:new", handleNew);
    socket.on("notification:updated", handleUpdated);
    socket.on("notification:all-read", handleAllRead);

    return () => {
      socket.off("notification:new", handleNew);
      socket.off("notification:updated", handleUpdated);
      socket.off("notification:all-read", handleAllRead);
    };
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, upsertNotification]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, read_at: new Date().toISOString() })));
    try {
      await api.post("/notifications/read-all");
    } catch {
      // Non-blocking; next refresh/socket event will reconcile state.
    }
  }, []);

  const markRead = useCallback(async (id) => {
    if (!id) return;
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n)));
    try {
      await api.patch(`/notifications/${id}/read`);
    } catch {
      // Non-blocking; next refresh/socket event will reconcile state.
    }
  }, []);

  const deleteNotification = useCallback(async (id) => {
    if (!id) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await api.delete(`/notifications/${id}`);
    } catch {
      // Non-blocking
    }
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    try {
      await api.delete('/notifications');
    } catch {
      // Non-blocking
    }
  }, []);

  return { notifications, unreadCount, markAllRead, markRead, deleteNotification, clearAll };
}
