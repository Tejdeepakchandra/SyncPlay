import { useState, useEffect, useCallback } from "react";
import { socket } from "@/services/socket";

export const useRoomChat = (roomCode) => {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [typingUsers, setTypingUsers] = useState({});

  // Fetch initial messages on room join
  useEffect(() => {
    if (!roomCode || !socket.connected) return;

    setIsLoading(true);
    socket.emit("chat:get-history", { roomCode, limit: 50 }, (response) => {
      if (response.success) {
        setMessages(response.messages);
      }
      setIsLoading(false);
    });

    // Listen for new messages
    const handleNewMessage = (messageData) => {
      setMessages((prev) => [...prev, messageData]);
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
      console.log('[CHAT-PERMISSION-DENIED]:', data);
      window.dispatchEvent(new CustomEvent('permission:chat-denied', {
        detail: { error: data.error, error_code: data.error_code }
      }));
    };

    socket.on("chat:message-new", handleNewMessage);
    socket.on("chat:typing-indicator", handleTypingIndicator);
    socket.on("chat:permission-denied", handleChatPermissionDenied);

    return () => {
      socket.off("chat:message-new", handleNewMessage);
      socket.off("chat:typing-indicator", handleTypingIndicator);
      socket.off("chat:permission-denied", handleChatPermissionDenied);
    };
  }, [roomCode]);

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

  return {
    messages,
    isLoading,
    typingUsers,
    sendMessage,
    sendTypingIndicator,
  };
};