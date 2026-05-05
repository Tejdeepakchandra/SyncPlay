import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Clock, Play, X, Users, Film, Music, ArrowRight, Sparkles } from "lucide-react";
import { getRecentRooms, removeRecentRoom } from "@/utils/recentRooms";

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return "1d ago";
}

const roleColors = {
  host: "bg-primary/20 border-primary/40 text-primary",
  "co-host": "bg-secondary/20 border-secondary/40 text-secondary",
  cohost: "bg-secondary/20 border-secondary/40 text-secondary",
  participant: "bg-muted/30 border-border text-muted-foreground",
  guest: "bg-muted/30 border-border text-muted-foreground",
};

/**
 * RecentRooms — "Continue Watching / Listening" section
 * Shows rooms the user recently joined/created for quick re-entry.
 * 
 * Props:
 * - type: "movie" | "music" | null (filter)
 * - className: additional CSS classes
 */
export default function RecentRooms({ type = null, className = "" }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);

  const refresh = useCallback(() => {
    setRooms(getRecentRooms(type));
  }, [type]);

  useEffect(() => {
    refresh();
    // Refresh when tab becomes visible (user might have been in a room in another tab)
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const handleRemove = (e, roomCode) => {
    e.stopPropagation();
    removeRecentRoom(roomCode);
    refresh();
  };

  if (rooms.length === 0) return null;

  const isMovie = type === "movie";
  const title = isMovie ? "Continue Watching" : type === "music" ? "Recent Sessions" : "Recent Rooms";
  const Icon = isMovie ? Film : Music;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`mb-6 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center">
          <Clock className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            {title}
            <span className="text-xs font-normal text-muted-foreground">
              ({rooms.length})
            </span>
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Rejoin your recent rooms instantly
          </p>
        </div>
      </div>

      {/* Room Cards — Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory md:grid md:grid-cols-2 lg:grid-cols-4 md:overflow-x-visible">
        <AnimatePresence mode="popLayout">
          {rooms.map((room, idx) => (
            <motion.button
              key={room.roomCode}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/room/${room.roomCode}`)}
              className="group relative snap-start flex-shrink-0 w-[260px] md:w-auto rounded-xl border border-border bg-card/60 backdrop-blur-sm p-3.5 text-left hover:border-primary/35 transition-all overflow-hidden"
            >
              {/* Glow effect */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.12),transparent_60%)] pointer-events-none" />

              {/* Remove button */}
              <button
                onClick={(e) => handleRemove(e, room.roomCode)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-muted/60 border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20 hover:border-destructive/40 hover:text-destructive z-10"
                title="Remove from recent"
              >
                <X className="w-3 h-3" />
              </button>

              {/* Type badge + role */}
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-primary/12 border border-primary/25 text-primary font-semibold uppercase tracking-wider">
                  <Icon className="w-2.5 h-2.5" />
                  {room.type}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium capitalize ${roleColors[room.role] || roleColors.guest}`}>
                  {room.role}
                </span>
                {room.privacy === "private" && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">
                    Private
                  </span>
                )}
              </div>

              {/* Room name */}
              <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors mb-1">
                {room.name}
              </h3>

              {/* Host + time */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <span>{room.hostEmoji}</span>
                  {room.hostName}
                </span>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  {timeAgo(room.lastVisited)}
                </span>
              </div>

              {/* Rejoin CTA */}
              <div className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                <Play className="w-3 h-3" />
                Rejoin Room
                <ArrowRight className="w-3 h-3" />
              </div>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
