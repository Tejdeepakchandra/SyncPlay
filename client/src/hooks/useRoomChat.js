import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useRoomChat = (roomId) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    if (!roomId) return;

    // Fetch existing messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("*, profile:profiles(display_name, avatar_emoji)")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (data) setMessages(data);
    };

    fetchMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat-${roomId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const { data } = await supabase
          .from("chat_messages")
          .select("*, profile:profiles(display_name, avatar_emoji)")
          .eq("id", payload.new.id)
          .single();

        if (data) {
          setMessages(prev => [...prev, data]);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const sendMessage = async (text) => {
    if (!user || !text.trim()) return;
    await supabase.from("chat_messages").insert({
      room_id: roomId,
      user_id: user.id,
      text: text.trim(),
    });
  };

  return { messages, sendMessage };
};