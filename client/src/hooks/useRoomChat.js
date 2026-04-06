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

    socket.on("chat:message-new", handleNewMessage);
    socket.on("chat:typing-indicator", handleTypingIndicator);

    return () => {
      socket.off("chat:message-new", handleNewMessage);
      socket.off("chat:typing-indicator", handleTypingIndicator);
    };
  }, [roomCode]);

  const sendMessage = useCallback((text) => {
    if (!roomCode || !text.trim()) return;

    socket.emit("chat:send", { roomCode, text }, (response) => {
      if (!response.success) {
        console.error("Failed to send message:", response.error);
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