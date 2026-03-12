import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useRoom = (roomId) => {
  const { user } = useAuth();
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [accessStatus, setAccessStatus] = useState("loading");

  useEffect(() => {
    if (!roomId) return;

    const loadRoom = async () => {
      // Fetch room
      const { data: roomData, error: roomError } = await supabase
        .from("rooms")
        .select("*")
        .eq("id", roomId)
        .single();

      if (roomError || !roomData) {
        setAccessStatus("not_found");
        return;
      }

      // Fetch participants with profiles
      const { data: participantData } = await supabase
        .from("room_participants")
        .select(`
          *,
          profile:profiles(id, display_name, username, avatar_emoji, is_online)
        `)
        .eq("room_id", roomId);

      setRoom(roomData);
      setParticipants(participantData || []);

      // Check access
      if (!user) {
        if (roomData.is_private) {
          setAccessStatus("needs_auth");
        } else {
          setAccessStatus("granted");
        }
        return;
      }

      const userParticipant = participantData?.find(p => p.user_id === user.id);
      if (roomData.is_private && !userParticipant) {
        setAccessStatus("private_no_invite");
      } else {
        setAccessStatus("granted");
        setIsHost(roomData.host_id === user.id);
      }
    };

    loadRoom();

    // Subscribe to participant changes
    const channel = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "room_participants",
        filter: `room_id=eq.${roomId}`,
      }, async () => {
        const { data } = await supabase
          .from("room_participants")
          .select(`
            *,
            profile:profiles(id, display_name, username, avatar_emoji, is_online)
          `)
          .eq("room_id", roomId);
        setParticipants(data || []);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, user]);

  return { room, participants, isHost, accessStatus };
};