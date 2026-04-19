import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { formatMinutes, relativeTime } from "@/lib/profileUi";

export function RoomDetailsDrawer({
  open,
  loading,
  room,
  participants,
  onClose,
  onOpenRoom,
  participantsTitle = "Participants",
  showOpenRoom = true,
}) {
  useEffect(() => {
    if (!open) return undefined;

    const previous = {
      bodyOverflow: document.body.style.overflow,
      bodyTouchAction: document.body.style.touchAction,
      htmlOverflow: document.documentElement.style.overflow,
      htmlOverscrollBehavior: document.documentElement.style.overscrollBehavior,
    };

    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.documentElement.style.overflow = previous.htmlOverflow;
      document.documentElement.style.overscrollBehavior = previous.htmlOverscrollBehavior;
      document.body.style.overflow = previous.bodyOverflow;
      document.body.style.touchAction = previous.bodyTouchAction;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70]">
          <div className="absolute inset-x-0 top-16 bottom-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

          <motion.aside
            initial={{ x: 420, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 420, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-16 h-[calc(100vh-4rem)] w-full max-w-xl bg-card border-l border-border p-5 overflow-y-auto overscroll-contain"
          >
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.14em] text-primary/80 mb-1">Room analytics</p>
                <h3 className="font-display text-xl font-bold text-foreground">{room?.name || "Room details"}</h3>
                {room?.roomCode && <p className="text-sm text-muted-foreground">{room.roomCode}</p>}
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-xl border border-border hover:bg-muted/35 flex items-center justify-center">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />
                ))}
              </div>
            ) : !room ? (
              <div className="rounded-xl border border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">Could not load room details</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-border bg-background/60 p-3">
                    <p className="text-[11px] text-muted-foreground">Type</p>
                    <p className="text-sm font-semibold text-foreground capitalize">{room.type}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3">
                    <p className="text-[11px] text-muted-foreground">Status</p>
                    <p className="text-sm font-semibold text-foreground capitalize">{room.status}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3">
                    <p className="text-[11px] text-muted-foreground">Participants</p>
                    <p className="text-sm font-semibold text-foreground">{room.participantCount}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/60 p-3">
                    <p className="text-[11px] text-muted-foreground">Room Time</p>
                    <p className="text-sm font-semibold text-foreground">{formatMinutes(room.stats?.totalRoomMinutes)}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-foreground">{participantsTitle}</h4>
                    {showOpenRoom && (
                      <button
                        onClick={onOpenRoom}
                        className="h-8 px-3 rounded-lg border border-primary/35 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20"
                      >
                        Open Room
                      </button>
                    )}
                  </div>

                  <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                    {(participants || []).length === 0 && (
                      <div className="text-xs text-muted-foreground">No participants recorded.</div>
                    )}

                    {(participants || []).map((participant) => (
                      <div key={`${participant.userId}-${participant.joinedAt}`} className="rounded-lg border border-border bg-card/60 p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {participant.avatarEmoji} {participant.displayName}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {participant.role} • joined {participant.joinedAt ? relativeTime(participant.joinedAt) : "unknown"}
                          </p>
                        </div>
                        <div className="text-xs font-semibold text-foreground">
                          {formatMinutes(participant.timeSpentMinutes)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
