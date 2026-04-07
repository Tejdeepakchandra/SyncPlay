import { motion } from "framer-motion";
import { X, Shield, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/button";

const UserSettingsModal = ({ user, isOpen, onClose }) => {
  if (!isOpen || !user) return null;

  const joinTime = user.joinedAt ? new Date(user.joinedAt).toLocaleTimeString() : "Unknown";
  const profileData = user.profile || {};

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-glass-border rounded-lg shadow-xl max-w-sm w-full mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4 border-b border-glass-border flex items-center justify-between bg-gradient-to-r from-primary/10 to-transparent">
          <h3 className="text-base font-semibold text-foreground">User Settings</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Profile Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl">
                {profileData.avatar_emoji || "🧑"}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{user.name || "User"}</p>
                <p className="text-xs text-muted-foreground">{user.username || "guest"}</p>
              </div>
            </div>
          </div>

          {/* Role Badge */}
          <div className="glass-panel p-3 flex items-center gap-2.5">
            <Shield className="w-4 h-4 text-accent" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Role</p>
              <p className="text-sm font-semibold text-foreground capitalize">
                {user.role === "host" ? "Host" : user.role === "co-host" ? "Co-Host" : "Guest"}
              </p>
            </div>
          </div>

          {/* Join Time */}
          <div className="glass-panel p-3 flex items-center gap-2.5">
            <Clock className="w-4 h-4 text-secondary" />
            <div>
              <p className="text-xs font-medium text-muted-foreground">Joined At</p>
              <p className="text-sm font-semibold text-foreground">{joinTime}</p>
            </div>
          </div>

          {/* User ID */}
          <div className="glass-panel p-3 flex items-center gap-2.5">
            <User className="w-4 h-4 text-primary" />
            <div className="flex-1">
              <p className="text-xs font-medium text-muted-foreground">User ID</p>
              <p className="text-xs font-mono text-muted-foreground truncate">{user.odlUserId || "N/A"}</p>
            </div>
          </div>

          {/* Permissions Status */}
          <div className="space-y-2 pt-2 border-t border-glass-border">
            <p className="text-xs font-semibold text-muted-foreground uppercase">Permissions</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">Microphone</span>
                <span className={`${user.audioEnabled ? "text-secondary" : "text-destructive"}`}>
                  {user.audioEnabled ? "✓ Enabled" : "✗ Disabled"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">Video</span>
                <span className={`${user.videoEnabled ? "text-secondary" : "text-destructive"}`}>
                  {user.videoEnabled ? "✓ Enabled" : "✗ Disabled"}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">Chat</span>
                <span className={`${user.chatEnabled ? "text-secondary" : "text-destructive"}`}>
                  {user.chatEnabled ? "✓ Enabled" : "✗ Disabled"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-glass-border">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="w-full"
          >
            Close
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default UserSettingsModal;
