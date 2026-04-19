import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import { getSocket } from "@/services/socket";

const formatEventText = (event) => {
  const roomLabel = event?.roomName || event?.roomCode || "a room";
  const actor = event?.actorName || "Someone";

  switch (event?.reason) {
    case "participant-joined":
      return `${actor} joined ${roomLabel}`;
    case "participant-left":
      return `${actor} left ${roomLabel}`;
    case "room-created":
      return `New room live: ${roomLabel}`;
    case "room-ended":
      return `Room ended: ${roomLabel}`;
    case "media-updated":
      return `Now playing updated in ${roomLabel}`;
    default:
      return `Room activity in ${roomLabel}`;
  }
};

export default function RoomFeedTicker({ roomType = "movie", className = "" }) {
  const [events, setEvents] = useState([]);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReducedMotion(e.matches);

    setReducedMotion(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const onUpdate = (payload) => {
      const payloadType = String(payload?.type || "").toLowerCase();
      if (payloadType && payloadType !== roomType) return;

      const item = {
        id: `${payload?.roomCode || "room"}-${payload?.reason || "update"}-${payload?.at || Date.now()}`,
        reason: payload?.reason || "update",
        roomCode: payload?.roomCode || "",
        roomName: payload?.roomName || "",
        actorName: payload?.actorName || "",
      };

      setEvents((prev) => [item, ...prev].slice(0, 12));
    };

    socket.on("discovery:rooms-updated", onUpdate);
    return () => {
      socket.off("discovery:rooms-updated", onUpdate);
    };
  }, [roomType]);

  const feedText = useMemo(() => {
    if (events.length === 0) {
      return [`Live feed armed for ${roomType} rooms`];
    }

    return events.map((item) => formatEventText(item));
  }, [events, roomType]);

  const toneClass = roomType === "music"
    ? "border-secondary/30 bg-[linear-gradient(90deg,hsl(var(--secondary)/0.18),hsl(var(--card)/0.65))] text-secondary"
    : "border-primary/30 bg-[linear-gradient(90deg,hsl(var(--primary)/0.18),hsl(var(--card)/0.65))] text-primary";

  return (
    <div className={`rounded-xl border ${toneClass} px-3 py-2 overflow-hidden ${className}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Radio className="w-3.5 h-3.5" />
        <p className="text-[11px] uppercase tracking-[0.16em] font-semibold">Room Feed</p>
      </div>

      <div className="relative overflow-hidden rounded-md bg-background/45 border border-border/70 py-1.5">
        {reducedMotion ? (
          <p className="text-xs text-muted-foreground px-2 truncate">{feedText[0]}</p>
        ) : (
          <motion.div
            className="flex gap-8 whitespace-nowrap px-2"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 20, ease: "linear", repeat: Infinity }}
          >
            {[...feedText, ...feedText].map((item, idx) => (
              <span key={`${item}-${idx}`} className="text-xs text-muted-foreground">
                {item}
              </span>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  );
}
