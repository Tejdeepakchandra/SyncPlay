import { useState, useRef, useEffect } from "react";
import { Bell, Check, Film, MessageSquare, Music, UserPlus, ExternalLink, X, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotifications } from "@/hooks/useNotifications";
import { useNavigate } from "react-router-dom";

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const NOTIF_STYLES = {
  room_invite: { icon: Film, color: "#60A5FA", bg: "rgba(96,165,250,0.12)", label: "Room Invite" },
  music_invite: { icon: Music, color: "#34D399", bg: "rgba(52,211,153,0.12)", label: "Music Invite" },
  dm_message: { icon: MessageSquare, color: "#A78BFA", bg: "rgba(167,139,250,0.12)", label: "Message" },
  room_story: { icon: Film, color: "#FBBF24", bg: "rgba(251,191,36,0.12)", label: "Room Story" },
  friend_request: { icon: UserPlus, color: "#F472B6", bg: "rgba(244,114,182,0.12)", label: "Friend Request" },
  default: { icon: Bell, color: "#9CA3AF", bg: "rgba(156,163,175,0.08)", label: "Notification" },
};

function getStyle(type) {
  return NOTIF_STYLES[type] || NOTIF_STYLES.default;
}



export default function NotificationDropdown({ variant = "desktop" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, markRead, deleteNotification, clearAll } = useNotifications();

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

  const handleDelete = (e, notifId) => {
    e.stopPropagation();
    deleteNotification(notifId);
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
            : "p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <Bell className="w-5 h-5" />
        {isMobile && "Alerts"}
        {unreadCount > 0 && (
          <span
            className={`absolute rounded-full font-bold flex items-center justify-center ${
              isMobile
                ? "top-0 right-1 w-4 h-4 text-[9px] bg-primary text-white"
                : "top-1 right-1 min-w-[16px] h-4 px-1 text-[9px] bg-primary text-white animate-pulse"
            }`}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: isMobile ? 10 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 rounded-2xl overflow-hidden ${
              isMobile
                ? "bottom-full mb-2 right-0 w-80"
                : isTopMobile
                  ? "right-0 top-full mt-2 w-[min(22rem,calc(100vw-1rem))]"
                : "right-0 top-full mt-2 w-[21rem]"
            }`}
            style={{
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 20px 60px -15px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-2.5"
              style={{ borderBottom: "1px solid hsl(var(--border) / 0.6)" }}
            >
              <h3 className="text-[13px] font-semibold text-foreground">Notifications</h3>
              <div className="flex items-center gap-0.5">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-[10px] text-primary hover:text-primary/80 px-2 py-1 rounded-md hover:bg-primary/10 font-medium transition-colors"
                  >
                    Read all
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="text-[10px] text-muted-foreground hover:text-red-400 px-2 py-1 rounded-md hover:bg-red-500/10 font-medium transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="max-h-[320px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="py-10 px-4 text-center">
                  <Sparkles className="w-6 h-6 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">All caught up!</p>
                </div>
              ) : (
                notifications.map((notif, idx) => {
                  const style = getStyle(notif.type);
                  const IconComp = style.icon;
                  const hasLink = notif.metadata?.path || notif.metadata?.room_path;
                  const uniqueKey = notif.id || `notif-${idx}`;

                  return (
                    <div
                      key={uniqueKey}
                      className="group relative flex items-start gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer"
                      style={{ borderBottom: "1px solid hsl(var(--border) / 0.3)" }}
                      onClick={() => handleClick(notif)}
                    >
                      {/* Unread dot */}
                      {!notif.read && (
                        <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" />
                      )}

                      {/* Icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: style.bg }}
                      >
                        <IconComp className="w-3.5 h-3.5" style={{ color: style.color }} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-[12px] leading-snug ${!notif.read ? 'font-semibold text-foreground' : 'font-medium text-foreground/70'} line-clamp-2`}>
                          {notif.title}
                        </p>
                        <p className="text-[11px] text-muted-foreground/70 mt-0.5 line-clamp-1">{notif.body}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[9px] text-muted-foreground/50">{timeAgo(notif.created_at)}</span>
                          <span
                            className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                            style={{ background: style.bg, color: style.color }}
                          >
                            {style.label}
                          </span>
                          {hasLink && <ExternalLink className="w-2.5 h-2.5 text-muted-foreground/30" />}
                        </div>
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={(e) => handleDelete(e, notif.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/10 text-muted-foreground/30 hover:text-red-400 flex-shrink-0 mt-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
