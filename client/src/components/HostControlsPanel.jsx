import { useState } from "react";
import { motion } from "framer-motion";
import {
  X, Mic, MicOff, Video, VideoOff, MessageSquare, MessageSquareOff,
  Shield, ShieldCheck, UserMinus, Crown, Volume2, VolumeX,
  Settings, Lock, Globe, Sliders, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const HostControlsPanel = ({
  open,
  onClose,
  participants,
  onUpdateParticipant,
  onRemoveParticipant,
  roomSettings,
  onUpdateSettings,
  hideVideoControls = false,
}) => {
  const [tab, setTab] = useState("participants");
  const [confirmRemove, setConfirmRemove] = useState(null);

  if (!open) return null;

  // Count stats
  const guestCount = participants.filter(p => p.role === "guest").length;
  const coHostCount = participants.filter(p => p.role === "co-host").length;
  const totalGuests = guestCount + coHostCount;

  const getRoleBadge = (role) => {
    switch (role) {
      case "host": return { label: "Host", className: "bg-primary/20 text-primary" };
      case "co-host": return { label: "Co-Host", className: "bg-accent/20 text-accent" };
      default: return { label: "Guest", className: "bg-muted text-muted-foreground" };
    }
  };

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: typeof window !== "undefined" && window.innerWidth < 768 ? "100%" : 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      className="border-l border-glass-border bg-card/95 backdrop-blur-xl flex flex-col overflow-hidden flex-shrink-0"
    >
      <div className="p-4 border-b border-glass-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Host Controls</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex border-b border-glass-border">
        {["participants", "settings"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors capitalize ${
              tab === t ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {tab === "participants" && (
          <div className="space-y-3">
            {/* Statistics */}
            <div className="grid grid-cols-2 gap-2">
              <div className="glass-panel p-3 text-center">
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-lg font-bold text-primary">{participants.length}</p>
              </div>
              <div className="glass-panel p-3 text-center">
                <p className="text-xs text-muted-foreground">Guests</p>
                <p className="text-lg font-bold text-accent">{totalGuests}</p>
              </div>
            </div>

            {/* Bulk Actions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Bulk Actions</p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 text-xs h-7"
                  onClick={() => {
                    participants.forEach(p => {
                      if (p.role !== "host") {
                        onUpdateParticipant(p.name, { audioEnabled: false });
                      }
                    });
                  }}
                >
                  <MicOff className="w-3 h-3 mr-1" />
                  Mute All
                </Button>
                {!hideVideoControls && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs h-7"
                    onClick={() => {
                      participants.forEach(p => {
                        if (p.role !== "host") {
                          onUpdateParticipant(p.name, { videoEnabled: false });
                        }
                      });
                    }}
                  >
                    <VideoOff className="w-3 h-3 mr-1" />
                    Stop Video
                  </Button>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-glass-border pt-2"></div>

            {/* Participants List */}
            <p className="text-xs font-semibold text-muted-foreground uppercase">Participants</p>
            <div className="space-y-2">
              {participants.map((p) => {
                const badge = getRoleBadge(p.role);
                const isHost = p.role === "host";
                return (
                  <div key={p.name} className="glass-panel p-3 space-y-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg">
                          {p.emoji}
                        </div>
                        {p.speaking && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-secondary border-2 border-card animate-pulse" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      {isHost && <Crown className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>

                    {!isHost && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-7 w-7 ${p.audioEnabled ? "text-foreground" : "text-destructive"}`}
                          onClick={() => onUpdateParticipant(p.name, { audioEnabled: !p.audioEnabled })}
                        >
                          {p.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                        </Button>
                        {!hideVideoControls && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`h-7 w-7 ${p.videoEnabled ? "text-foreground" : "text-destructive"}`}
                            onClick={() => onUpdateParticipant(p.name, { videoEnabled: !p.videoEnabled })}
                          >
                            {p.videoEnabled ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-7 w-7 ${p.chatEnabled ? "text-foreground" : "text-destructive"}`}
                          onClick={() => onUpdateParticipant(p.name, { chatEnabled: !p.chatEnabled })}
                        >
                          {p.chatEnabled ? <MessageSquare className="w-3.5 h-3.5" /> : <MessageSquareOff className="w-3.5 h-3.5" />}
                        </Button>

                        <div className="flex-1" />

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-accent"
                          onClick={() => onUpdateParticipant(p.name, {
                            role: p.role === "co-host" ? "guest" : "co-host"
                          })}
                        >
                          {p.role === "co-host" ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        </Button>

                        {confirmRemove === p.name ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs px-2"
                              onClick={() => { onRemoveParticipant(p.name); setConfirmRemove(null); }}
                            >
                              Remove
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs px-2"
                              onClick={() => setConfirmRemove(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setConfirmRemove(p.name)}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "settings" && (
          <div className="space-y-4">
            {[
              { label: "Enable Chat", desc: "Allow participants to chat", key: "chatEnabled", icon: MessageSquare },
              { label: "Enable Reactions", desc: "Allow emoji reactions", key: "reactionsEnabled", icon: Sliders },
              { label: "Private Room", desc: "Only invited users can join", key: "isPrivate", icon: Lock },
              { label: "Allow Screen Share", desc: "Guests can share their screen", key: "allowScreenShare", icon: Globe },
              { label: "Slow Mode", desc: "Limit chat to 1 msg per 5s", key: "slowMode", icon: Ban },
            ].map(({ label, desc, key, icon: IconComp }) => ( // eslint-disable-line no-unused-vars
              <div key={key} className="glass-panel p-3 flex items-center gap-3">
                <IconComp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={roomSettings[key]}
                  onCheckedChange={(v) => onUpdateSettings({ [key]: v })}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.aside>
  );
};

export default HostControlsPanel;