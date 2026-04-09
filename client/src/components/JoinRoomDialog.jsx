import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LinkIcon, ArrowRight, Hash, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import api from "@/services/api";


const JoinRoomDialog = ({ open, onClose }) => {
  const navigate = useNavigate();
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const normalizeRoomCode = (value) =>
    String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12);

  const handleJoin = async () => {
    const trimmed = link.trim();
    if (!trimmed) return;

    setChecking(true);
    setError("");

    let roomId = "";
    let isMusic = false;

    // Parse URL input (supports full link, path, or raw code)
    try {
      const url = trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? new URL(trimmed)
        : new URL(trimmed, window.location.origin);

      const path = url.pathname.toLowerCase();
      if (path.includes("/music/room/")) {
        const match = url.pathname.match(/\/music\/room\/([^/?#]+)/i);
        if (match) {
          roomId = normalizeRoomCode(match[1]);
          isMusic = true;
        }
      } else if (path.includes("/room/")) {
        const match = url.pathname.match(/\/room\/([^/?#]+)/i);
        if (match) {
          roomId = normalizeRoomCode(match[1]);
        }
      }
    } catch {
      // Not a URL - fallback to room code parsing below.
    }

    // If not a URL, treat as room code
    if (!roomId) {
      const code = normalizeRoomCode(trimmed);
      if (code.length >= 4 && code.length <= 10) {
        roomId = code;
      } else {
        setError("Invalid room code or link");
        setChecking(false);
        return;
      }
    }

    try {
      // Resolve room type from backend to avoid music/movie route collisions.
      const response = await api.get(`/rooms/${roomId}`);
      const roomType = response?.data?.data?.type;

      const targetIsMusic = roomType === "music" || isMusic;

      onClose();
      setLink("");
      setError("");
      setChecking(false);
      navigate(targetIsMusic ? `/music/room/${roomId}` : `/room/${roomId}`);
    } catch {
      setError("Room not found or unavailable");
      setChecking(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative glass-panel p-6 w-full max-w-md z-10"
        >
          <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-4">
            <LinkIcon className="w-6 h-6 text-foreground" />
          </div>

          <h2 className="font-display text-xl font-bold text-foreground mb-1">Join a Room</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Paste a room link or enter a 6-character room code.
          </p>

          <Input
            placeholder="Room code (e.g. L5UDWX) or link"
            value={link}
            onChange={(e) => { setLink(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            className="bg-muted/50 border-glass-border mb-2 font-mono uppercase tracking-wider"
          />

          <p className="text-[11px] text-muted-foreground mb-4 flex items-center gap-1">
            <Hash className="w-3 h-3" />
            Public rooms: join with code. Private rooms: invite only.
          </p>

          {error && <p className="text-xs text-destructive mb-3">{error}</p>}

          <Button
            disabled={!link.trim() || checking}
            onClick={handleJoin}
            className="w-full gradient-movie text-primary-foreground font-semibold"
          >
            {checking ? (
              <>
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                Checking...
              </>
            ) : (
              <>
                Join Room
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default JoinRoomDialog;