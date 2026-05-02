import { useState, useEffect, useCallback, useRef } from "react";
import { socket } from "@/services/socket";

export const useRoomChat = (roomCode) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});
  const [unreadCount, setUnreadCount] = useState(0);
  const chatOpenRef = useRef(false);

  const normalizeMessage = useCallback((raw) => {
    if (!raw) return null;

    const timestamp = raw.created_at || raw.timestamp || raw.createdAt || new Date().toISOString();
    const displayName = raw.displayName || raw.username || raw.profile?.display_name || "User";
    const avatarCandidate =
      raw.avatar_emoji ||
      raw.avatar ||
      raw.profile?.avatar_emoji ||
      raw.avatar_url ||
      raw.profile?.avatar_url ||
      "";
    const isAvatarUrl = typeof avatarCandidate === "string" && /^https?:\/\//i.test(avatarCandidate);
    const avatarEmoji = isAvatarUrl ? "🧑" : (avatarCandidate || "🧑");
    const avatarUrl = raw.avatar_url || raw.profile?.avatar_url || (isAvatarUrl ? avatarCandidate : null);

    return {
      id: raw.id || raw._id || `${raw.userId || raw.user_id || "u"}:${timestamp}`,
      userId: raw.userId || raw.user_id,
      user_id: raw.userId || raw.user_id,
      username: raw.username || "user",
      displayName,
      avatar: avatarEmoji,
      text: raw.text || "",
      type: raw.type || "message",
      timestamp,
      created_at: timestamp,
      profile: {
        display_name: displayName,
        avatar_emoji: avatarEmoji,
        avatar_url: avatarUrl,
      },
    };
  }, []);

  // Fetch initial messages on room join
  useEffect(() => {
    if (!roomCode) return;

    const requestHistory = () => {
      setIsLoading(true);
      socket.emit("chat:get-history", { roomCode, limit: 50 }, (response) => {
        if (response?.success) {
          const next = (response.messages || [])
            .map(normalizeMessage)
            .filter(Boolean);
          setMessages(next);
        }
        setIsLoading(false);
      });
    };

    if (socket.connected) {
      requestHistory();
    }

    // Listen for new messages
    const handleNewMessage = (messageData) => {
      const normalized = normalizeMessage(messageData);
      if (!normalized) return;

      setMessages((prev) => {
        if (prev.some((m) => m.id === normalized.id)) return prev;
        return [...prev, normalized];
      });

      // Increment unread count if chat is not currently open
      if (!chatOpenRef.current) {
        setUnreadCount((prev) => prev + 1);
      }
    };

    // Listen for typing indicators
    const handleTypingIndicator = (data) => {
      setTypingUsers((prev) => {
        const updated = { ...prev };
        if (data.isTyping) {
          updated[data.userId] = data.displayName;
        } else {
          delete updated[data.userId];
        }
        return updated;
      });
    };

    // Listen for chat permission denied
    const handleChatPermissionDenied = (data) => {
      window.dispatchEvent(new CustomEvent('permission:chat-denied', {
        detail: { error: data.error, error_code: data.error_code }
      }));
    };

    const handleConnected = () => {
      requestHistory();
    };

    socket.on("chat:message-new", handleNewMessage);
    socket.on("chat:typing-indicator", handleTypingIndicator);
    socket.on("chat:permission-denied", handleChatPermissionDenied);
    socket.on("connect", handleConnected);

    return () => {
      socket.off("chat:message-new", handleNewMessage);
      socket.off("chat:typing-indicator", handleTypingIndicator);
      socket.off("chat:permission-denied", handleChatPermissionDenied);
      socket.off("connect", handleConnected);
    };
  }, [roomCode, normalizeMessage]);

  const sendMessage = useCallback((text) => {
    if (!roomCode || !text.trim()) return;

    socket.emit("chat:send", { roomCode, text }, (response) => {
      if (!response.success) {
        console.error("Failed to send message:", response.error, response.error_code);
        // Dispatch permission denied event if chat is disabled by host
        if (response.error_code === 'CHAT_DISABLED_BY_HOST') {
          window.dispatchEvent(new CustomEvent('permission:chat-denied', {
            detail: { error: response.error, error_code: response.error_code }
          }));
        }
      }
    });
  }, [roomCode]);

  const sendTypingIndicator = useCallback((isTyping) => {
    if (!roomCode) return;
    socket.emit("chat:typing", { roomCode, isTyping });
  }, [roomCode]);

  // Mark messages as read (call when chat panel opens)
  const markAsRead = useCallback(() => {
    setUnreadCount(0);
    chatOpenRef.current = true;
  }, []);

  // Mark chat as closed (call when chat panel closes)
  const markAsClosed = useCallback(() => {
    chatOpenRef.current = false;
  }, []);

  return {
    messages,
    isLoading,
    typingUsers,
    sendMessage,
    sendTypingIndicator,
    unreadCount,
    markAsRead,
    markAsClosed,
  };
};