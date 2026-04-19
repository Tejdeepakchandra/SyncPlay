import { useState } from "react";
import { motion } from "framer-motion";
import {
  X, Mic, MicOff, Video, VideoOff, MessageSquare, MessageSquareOff,
  Shield, ShieldCheck, UserMinus, Crown, Volume2, VolumeX,
  Settings, Globe, Sliders, Ban,
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
  isHost = false,
  hideVideoControls = false,
  panelTheme = "movie",
}) => {
  const [tab, setTab] = useState("participants");
  const [confirmRemove, setConfirmRemove] = useState(null);

  const palette = panelTheme === "music"
    ? {
        panelBorder: "border-emerald-400/20",
        panelBg: "from-emerald-950/65 to-emerald-900/35",
        iconText: "text-emerald-300",
        activeTabText: "text-emerald-300",
        activeTabBorder: "border-emerald-300",
        statsText: "text-emerald-300",
      }
    : {
        panelBorder: "border-glass-border",
        panelBg: "from-card/95 to-card/95",
        iconText: "text-primary",
        activeTabText: "text-primary",
        activeTabBorder: "border-primary",
        statsText: "text-primary",
      };

  if (!open) return null;

  // Count stats
  const guestCount = participants.filter((p) => p.role === "guest").length;
  const coHostCount = participants.filter((p) => p.role === "co-host" || p.role === "cohost").length;
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
      className={`h-full border-l ${palette.panelBorder} bg-gradient-to-b ${palette.panelBg} backdrop-blur-xl flex flex-col overflow-hidden flex-shrink-0`}
    >
      <div className="p-4 border-b border-glass-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className={`w-4 h-4 ${palette.iconText}`} />
          <h3 className="text-sm font-semibold text-foreground">{isHost ? "Host Controls" : "Co-Host Controls"}</h3>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex border-b border-glass-border">
        {(["participants", ...(isHost ? ["settings"] : [])]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors capitalize ${
              tab === t ? `${palette.activeTabText} border-b-2 ${palette.activeTabBorder}` : "text-muted-foreground hover:text-foreground"
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
                <p className={`text-lg font-bold ${palette.statsText}`}>{participants.length}</p>
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
                        const participantId = p.userId || p.odlUserId || p.name;
                        onUpdateParticipant(participantId, { audioEnabled: false });
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
                          const participantId = p.userId || p.odlUserId || p.name;
                          onUpdateParticipant(participantId, { videoEnabled: false });
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
                const participantId = p.userId || p.odlUserId || p.name;
                const isParticipantHost = p.role === "host";
                const isParticipantCoHost = p.role === "co-host" || p.role === "cohost";
                const restrictions = p.restrictions || {};
                const isMicAllowed = !restrictions.micDisabledByHost;
                const isVideoAllowed = !restrictions.videoDisabledByHost;
                const isChatAllowed = !restrictions.chatDisabledByHost;
                const isMediaControlAllowed = !restrictions.mediaControlDisabledByHost;
                return (
                  <div key={participantId} className="glass-panel p-3 space-y-2.5">
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
                        {(restrictions.micDisabledByHost || restrictions.videoDisabledByHost || restrictions.chatDisabledByHost || restrictions.mediaControlDisabledByHost) && (
                          <p className="text-[10px] text-destructive mt-1">
                            {[
                              restrictions.micDisabledByHost ? "Mic blocked" : null,
                              restrictions.videoDisabledByHost ? "Video blocked" : null,
                              restrictions.chatDisabledByHost ? "Chat blocked" : null,
                              restrictions.mediaControlDisabledByHost ? "Media blocked" : null,
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </p>
                        )}
                      </div>
                      {isParticipantHost && <Crown className="w-4 h-4 text-primary flex-shrink-0" />}
                    </div>

                    {!isParticipantHost && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-7 w-7 ${isMicAllowed ? "text-foreground" : "text-destructive"}`}
                          onClick={() => onUpdateParticipant(participantId, { audioEnabled: !isMicAllowed })}
                          title={isMicAllowed ? "Block microphone" : "Allow microphone"}
                        >
                          {isMicAllowed ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                        </Button>
                        {!hideVideoControls && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className={`h-7 w-7 ${isVideoAllowed ? "text-foreground" : "text-destructive"}`}
                            onClick={() => onUpdateParticipant(participantId, { videoEnabled: !isVideoAllowed })}
                            title={isVideoAllowed ? "Block camera" : "Allow camera"}
                          >
                            {isVideoAllowed ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-7 w-7 ${isChatAllowed ? "text-foreground" : "text-destructive"}`}
                          onClick={() => onUpdateParticipant(participantId, { chatEnabled: !isChatAllowed })}
                          title={isChatAllowed ? "Block chat" : "Allow chat"}
                        >
                          {isChatAllowed ? <MessageSquare className="w-3.5 h-3.5" /> : <MessageSquareOff className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className={`h-7 w-7 ${isMediaControlAllowed ? "text-foreground" : "text-destructive"}`}
                          onClick={() => onUpdateParticipant(participantId, { mediaControlEnabled: !isMediaControlAllowed })}
                          title={isMediaControlAllowed ? "Block media control" : "Allow media control"}
                        >
                          {isMediaControlAllowed ? <Sliders className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        </Button>

                        <div className="flex-1" />

                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-accent"
                          disabled={!isHost}
                          onClick={() => onUpdateParticipant(participantId, {
                            role: isParticipantCoHost ? "guest" : "co-host"
                          })}
                        >
                          {isParticipantCoHost ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                        </Button>

                        {confirmRemove === participantId ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-7 text-xs px-2"
                              disabled={!isHost}
                              onClick={() => { onRemoveParticipant(participantId); setConfirmRemove(null); }}
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
                            disabled={!isHost}
                            onClick={() => setConfirmRemove(participantId)}
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
                  checked={!!roomSettings[key]}
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