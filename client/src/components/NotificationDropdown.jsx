import { useState, useRef, useEffect } from "react";
import { Bell, Check, Film, MessageSquare, Music, UserPlus, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function getIcon(type) {
  switch (type) {
    case "room_invite":
      return <Film className="w-4 h-4 text-primary" />;
    case "music_invite":
      return <Music className="w-4 h-4 text-secondary" />;
    case "dm_message":
      return <MessageSquare className="w-4 h-4 text-primary" />;
    case "room_story":
      return <Film className="w-4 h-4 text-accent" />;
    case "friend_request":
      return <UserPlus className="w-4 h-4 text-friends" />;
    default:
      return <Bell className="w-4 h-4 text-muted-foreground" />;
  }
}

export default function NotificationDropdown({ variant = "desktop" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleClick = (notif) => {
    markRead(notif.id);
    const destination = notif.metadata?.path || notif.metadata?.room_path || null;
    if (destination) {
      navigate(destination);
      setOpen(false);
    }
  };

  const isMobile = variant === "mobile";
  const isTopMobile = variant === "top-mobile";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`relative transition-colors ${
          isMobile
            ? "flex flex-col items-center gap-0.5 text-[10px] font-medium text-muted-foreground"
            : isTopMobile
              ? "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
            : "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <Bell className={isMobile ? "w-5 h-5" : "w-5 h-5"} />
        {isMobile && "Alerts"}
        {unreadCount > 0 && (
          <span
            className={`absolute bg-primary rounded-full ${
              isMobile
                ? "top-0 right-1 w-2 h-2"
                : isTopMobile
                  ? "top-1.5 right-1.5 w-2 h-2 animate-pulse"
                : "top-1.5 right-1.5 w-2 h-2 animate-pulse"
            }`}
          />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: isMobile ? 10 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute z-50 bg-card border border-border rounded-2xl shadow-2xl shadow-background/60 overflow-hidden ${
              isMobile
                ? "bottom-full mb-2 right-0 w-72"
                : isTopMobile
                  ? "right-0 top-full mt-2 w-[min(22rem,calc(100vw-1rem))]"
                : "right-0 top-full mt-2 w-80"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  Mark all read
                </button>
              )}
            </div>

            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No notifications yet</p>
                </div>
              ) : (
                notifications.map((notif) => (
                  <button
                    key={notif.id}
                    onClick={() => handleClick(notif)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors border-b border-border/50 last:border-0 ${
                      !notif.read ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                      {getIcon(notif.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{notif.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notif.body}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-muted-foreground">{timeAgo(notif.created_at)}</span>
                      {(notif.metadata?.path || notif.metadata?.room_path) && <ExternalLink className="w-3 h-3 text-muted-foreground/50" />}
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
