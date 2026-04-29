import { Gem, ShieldCheck, Trophy } from "lucide-react";

const tierStyles = {
  bronze: "bg-amber-500/12 text-amber-300 border-amber-500/25",
  silver: "bg-slate-300/15 text-slate-200 border-slate-300/25",
  gold: "bg-yellow-400/12 text-yellow-300 border-yellow-400/25",
  platinum: "bg-cyan-400/12 text-cyan-300 border-cyan-400/25",
  diamond: "bg-fuchsia-400/12 text-fuchsia-300 border-fuchsia-400/25",
};

export function AchievementCard({ achievement }) {
  const unlocked = Boolean(achievement.unlocked);
  const tierClass = tierStyles[String(achievement.tier || "").toLowerCase()] || "bg-muted/30 text-muted-foreground border-border";

  return (
    <div
      className={`rounded-2xl border p-3.5 ${
        unlocked
          ? "border-secondary/45 bg-[linear-gradient(135deg,hsl(var(--secondary)/0.2),hsl(var(--card)/0.62))]"
          : "border-border bg-[linear-gradient(135deg,hsl(var(--card)/0.9),hsl(var(--background)/0.65))]"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground truncate">{achievement.title}</p>
          <p className="text-xs text-muted-foreground">{achievement.description}</p>
        </div>
        {unlocked ? (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-secondary/25 border border-secondary/45 text-secondary font-semibold">
            <ShieldCheck className="w-3 h-3" /> Unlocked
          </span>
        ) : (
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border ${tierClass}`}>
            <Gem className="w-3 h-3" /> {achievement.tier}
          </span>
        )}
      </div>

      <div className="mb-2 h-1.5 rounded-full bg-muted/40 overflow-hidden border border-border/60">
        <div className="h-full bg-gradient-to-r from-primary via-secondary to-accent" style={{ width: `${achievement.progress}%` }} />
      </div>

      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{achievement.current}/{achievement.target}</span>
        <span className="font-semibold text-foreground inline-flex items-center gap-1">
          <Trophy className="w-3 h-3" /> {achievement.progress}%
        </span>
      </div>
    </div>
  );
}
