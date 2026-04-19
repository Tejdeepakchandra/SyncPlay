import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

export function ProfilePageHeader({
  onBack,
  layoutId,
  icon: Icon,
  title,
  subtitle,
  accentLabel = "Profile",
  glowClass = "bg-primary/20",
  iconBgClass = "bg-primary",
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Profile
      </button>

      <div className="rounded-3xl border border-border bg-card p-5 md:p-6 overflow-hidden relative">
        <div className={`absolute -top-24 -right-14 w-56 h-56 rounded-full blur-3xl ${glowClass}`} />
        <p className="text-xs uppercase tracking-[0.14em] text-primary/80 mb-1">{accentLabel}</p>
        <motion.div layoutId={layoutId} className={`w-10 h-10 rounded-xl ${iconBgClass} flex items-center justify-center mb-2`}>
          <Icon className="w-5 h-5 text-primary-foreground" />
        </motion.div>
        <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>
    </motion.div>
  );
}
