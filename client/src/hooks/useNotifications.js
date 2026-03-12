import { useState, useCallback } from "react";

// Stub notification hook – will be wired to the backend later.
// Returns a reactive list so the UI components can render immediately.

const INITIAL = [
  {
    id: "1",
    type: "room_invite",
    title: "Movie Night Invite",
    body: "Alex invited you to watch Interstellar",
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    metadata: { room_path: "/room/demo" },
  },
  {
    id: "2",
    type: "friend_request",
    title: "New Friend Request",
    body: "Jordan wants to be your friend",
    read: false,
    created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    metadata: {},
  },
];

export function useNotifications() {
  const [notifications, setNotifications] = useState(INITIAL);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const markRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  return { notifications, unreadCount, markAllRead, markRead };
}
