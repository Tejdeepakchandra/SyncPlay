import { motion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { relativeTime } from "@/lib/profileUi";

export function ActivityItemCard({
  item,
  meta,
  hasRoom,
  isSaving,
  isSaved,
  delay = 0,
  onDetails,
  onSave,
}) {
  const Icon = meta.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="group rounded-2xl border border-border bg-[linear-gradient(130deg,hsl(var(--card)/0.94),hsl(var(--background)/0.7))] p-4"
    >
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${meta.badgeClass}`}>
          <Icon className={`w-5 h-5 ${meta.className}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center flex-wrap gap-2 mb-1">
            <p className="text-[15px] font-semibold text-foreground leading-none">{item.title}</p>
            <span className={`inline-flex items-center h-5 px-2 rounded-full text-[10px] border ${meta.badgeClass}`}>
              {meta.label}
            </span>
          </div>

          <p className="text-sm text-muted-foreground truncate">{item.description || "No details"}</p>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{relativeTime(item.at)}</span>
            {hasRoom && (
              <>
                <span>•</span>
                <span>{String(item.room?.roomCode || "")}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onDetails}
            disabled={!hasRoom}
            className={`h-9 px-3.5 rounded-xl border text-xs font-semibold transition-colors inline-flex items-center gap-1 ${
              hasRoom
                ? "border-primary/35 text-primary bg-primary/10 hover:bg-primary/18"
                : "border-border text-muted-foreground cursor-not-allowed"
            }`}
          >
            Details <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onSave}
            disabled={isSaving || isSaved}
            className={`h-9 px-3.5 rounded-xl border text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
              isSaved
                ? "border-secondary/35 text-secondary bg-secondary/10"
                : "border-border text-foreground hover:bg-muted/35"
            } ${isSaving ? "opacity-70" : ""}`}
          >
            {isSaved ? (
              <>
                <Check className="w-3.5 h-3.5" /> Saved
              </>
            ) : isSaving ? (
              "Saving..."
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </motion.article>
  );
}
