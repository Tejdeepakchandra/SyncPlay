import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Share2, Link2, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const RoomInfoBar = ({ roomId, roomType, host, participantCount = 1, isHost = false }) => {
  const [showPanel, setShowPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user, profile } = useAuth();

  const roomCode = roomId.replace(/^(room-|music-)/, "").toUpperCase();
  const roomLink = `${window.location.origin}${roomType === "music" ? "/music/room/" : "/room/"}${roomId}`;
  const displayHost = isHost ? `${profile?.username || user?.username || "You"} (Host)` : (host || "Host");

  const handleCopy = () => {
    navigator.clipboard.writeText(roomLink);
    setCopied(true);
    toast.success("Room link copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    toast.success("Room code copied!");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join my ${roomType} room`,
          text: `Join my ${roomType === "music" ? "music session" : "movie night"}! Room code: ${roomCode}`,
          url: roomLink,
        });
      } catch { /* share cancelled or unsupported */ }
    } else {
      handleCopy();
    }
  };

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setShowPanel(!showPanel)} className={showPanel ? "text-primary" : "text-muted-foreground"}>
        <Link2 className="w-4 h-4" />
      </Button>

      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 z-50 w-72 sm:w-80"
          >
            <div className="glass-panel p-4 space-y-3 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Link2 className="w-3.5 h-3.5 text-primary" /> Room Info
                </h3>
                <button onClick={() => setShowPanel(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-glass-border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Room Code</p>
                  <p className="text-lg font-mono font-bold text-foreground tracking-widest">{roomCode}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={handleCopyCode} className="ml-auto h-7 text-xs gap-1">
                  <Copy className="w-3 h-3" /> Copy
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground">Host</p>
                  <p className="font-medium text-foreground truncate">{displayHost}</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-muted-foreground">Participants</p>
                  <p className="font-medium text-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" /> {participantCount}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Shareable Link</p>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-glass-border">
                  <p className="text-xs text-muted-foreground truncate flex-1 font-mono">{roomLink}</p>
                  <button onClick={handleCopy} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
                    {copied ? <Check className="w-3.5 h-3.5 text-secondary" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleCopy} className={`flex-1 text-xs h-8 gap-1.5 ${
                  roomType === "music" ? "gradient-music" : "gradient-movie"
                } text-primary-foreground`}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? "Copied!" : "Copy Link"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleShare} className="flex-1 text-xs h-8 gap-1.5 border-glass-border">
                  <Share2 className="w-3 h-3" /> Share
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default RoomInfoBar;