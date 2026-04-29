import { Check, Film, Music, Trash2 } from "lucide-react";
import { normalizeRoomType, relativeTime } from "@/lib/profileUi";

export function FavoriteRoomCard({ room, isRemoving, onDetails, onOpen, onRemove }) {
  return (
    <div className="rounded-2xl border border-border bg-[linear-gradient(130deg,hsl(var(--card)/0.92),hsl(var(--background)/0.7))] p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground truncate">{room.name}</p>
          <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
            {normalizeRoomType(room.type) === "music" ? <Music className="w-3 h-3" /> : <Film className="w-3 h-3" />}
            {room.type} room • {room.roomCode}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">Saved {relativeTime(room.addedAt)}</p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onDetails} className="h-8 px-3 rounded-lg border border-primary/35 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20">Details</button>
          <button onClick={onOpen} className="h-8 px-3 rounded-lg border border-border text-xs hover:bg-muted/35">Open</button>
          <button
            onClick={onRemove}
            disabled={isRemoving}
            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
          >
            {isRemoving ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            {isRemoving ? "Removing" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}
