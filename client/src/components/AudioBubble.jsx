import { motion } from "framer-motion";
import { Mic, MicOff, Crown, ShieldCheck } from "lucide-react";

const AudioBubble = ({ 
  participant, 
  isLocal = false, 
  speaking = false,
  onContextMenu = null
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative w-12 h-12 md:w-14 md:h-14"
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.();
      }}
    >
      {/* Main bubble */}
      <div
        className={`w-full h-full rounded-full overflow-hidden cursor-pointer group transition-all ${
          isLocal ? "ring-2 ring-primary/60" : ""
        } ${participant.muted ? "opacity-50" : ""}`}
        style={{
          boxShadow: speaking
            ? "0 0 0 2px hsl(var(--secondary)), 0 0 16px hsl(var(--secondary) / 0.35)"
            : "0 0 0 2px hsl(var(--background) / 0.6), 0 4px 12px rgba(0,0,0,0.5)",
        }}
      >
        {/* Background */}
        <div className="absolute inset-0 bg-muted/85 backdrop-blur-md" />

        {/* Avatar emoji or initials */}
        <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-foreground">
          {participant.emoji || participant.avatar || (
            <span>{participant.name?.charAt(0) || "?"}</span>
          )}
        </div>

        {/* Speaking pulse ring */}
        {speaking && (
          <motion.div
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: [1, 1.3, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 rounded-full border-2 border-secondary pointer-events-none"
          />
        )}

        {/* Online indicator */}
        <div className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-card bg-green-500 z-20" />

        {/* Role badge */}
        {participant.role === "host" && (
          <div className="absolute top-0 left-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center z-20 -translate-x-1 -translate-y-1">
            <Crown className="w-3 h-3 text-primary-foreground" />
          </div>
        )}
        {participant.role === "co-host" && (
          <div className="absolute top-0 left-0 w-5 h-5 rounded-full bg-accent flex items-center justify-center z-20 -translate-x-1 -translate-y-1">
            <ShieldCheck className="w-3 h-3 text-accent-foreground" />
          </div>
        )}

        {/* Mic indicator (bottom-center) */}
        <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-card/90 backdrop-blur flex items-center justify-center z-20 border border-glass-border">
          {participant.audioEnabled ? (
            <Mic className="w-3 h-3 text-secondary" />
          ) : (
            <MicOff className="w-3 h-3 text-destructive" />
          )}
        </div>

        {/* Equalizer bars (when speaking) */}
        {speaking && (
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex items-end justify-center gap-[2px] h-4">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-secondary"
                animate={{ height: ["40%", "100%", "60%"] }}
                transition={{
                  duration: 0.5,
                  repeat: Infinity,
                  delay: i * 0.15,
                }}
              />
            ))}
          </div>
        )}

        {/* Hover tooltip */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          whileHover={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute -top-12 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap"
        >
          <p className="text-[11px] font-semibold text-foreground">
            {participant.name}
          </p>
          <p className="text-[9px] text-muted-foreground">
            @{participant.username || "user"}
          </p>
          {participant.role && (
            <p className="text-[8px] font-semibold text-secondary capitalize">
              {participant.role === "host" ? "👑 Host" : "🎧 Listener"}
            </p>
          )}
          <p className="text-[8px] text-green-500">● Online</p>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default AudioBubble;
