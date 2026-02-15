import { motion } from "framer-motion";
import { SkipBack, Play, SkipForward, Repeat, Shuffle, Mic } from "lucide-react";
import { leftReveal, rightReveal, staggerContainer, bulletItem, waveformVariants } from "@/lib/landingAnimations";

export default function MusicPreview() {
  const bulletPoints = [
    "Voice chat while listening",
    "Collaborative queue & playlist",
    "Beautiful waveform visualizer",
    "Background audio (keeps playing when minimized)",
  ];

  // Waveform bars
  const bars = Array.from({ length: 40 }, (_, i) => ({
    delay: i * 0.03,
  }));

  return (
    <section className="py-24 lg:py-32 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-secondary/5 blur-[120px] pointer-events-none" />

      <div className="container mx-auto px-4 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          
          {/* LEFT SIDE — Content slides from left */}
          <motion.div
            variants={leftReveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
          >
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-block text-xs font-semibold uppercase tracking-widest text-secondary mb-4"
            >
              🎵 Music
            </motion.div>
            
            <h2 className="font-display text-3xl sm:text-4xl font-bold mb-6 leading-tight">
              Spotify-Style <span className="text-gradient-music">Listening Rooms</span>
            </h2>
            
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Listen together in real-time. Build collaborative playlists, visualize the music,
              and talk to friends — all without leaving the room.
            </p>

            {/* Bullet points with stagger */}
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="space-y-4"
            >
              {bulletPoints.map((item, i) => (
                <motion.div
                  key={i}
                  variants={bulletItem}
                  className="flex items-center gap-3"
                >
                  <motion.div
                    whileHover={{ scale: 1.2, rotate: 360 }}
                    transition={{ duration: 0.3 }}
                    className="w-6 h-6 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0"
                  >
                    <div className="w-2 h-2 rounded-full bg-secondary" />
                  </motion.div>
                  <span className="text-foreground">{item}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT SIDE — Music player slides from right */}
          <motion.div
            variants={rightReveal}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, amount: 0.3 }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity }}
              className="glass-panel p-6 glow-music max-w-sm mx-auto"
            >
              {/* Album art placeholder */}
              <div className="aspect-square rounded-xl bg-gradient-to-br from-secondary/20 to-accent/20 mb-6 flex items-center justify-center overflow-hidden relative">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-32 h-32 rounded-full border-4 border-secondary/30 flex items-center justify-center"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="w-8 h-8 rounded-full bg-secondary/40" 
                  />
                </motion.div>
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute bottom-3 right-3 glass-panel px-2 py-1 flex items-center gap-1.5"
                >
                  <Mic className="w-3 h-3 text-secondary" />
                  <span className="text-[10px] text-secondary font-medium">Voice On</span>
                </motion.div>
              </div>

              {/* Song info */}
              <div className="text-center mb-4">
                <h4 className="font-display font-semibold text-foreground">Midnight Groove</h4>
                <p className="text-sm text-muted-foreground">SyncPlay Radio</p>
              </div>

              {/* Waveform */}
              <div className="flex items-end justify-center gap-[3px] h-12 mb-4">
                {bars.map((bar, i) => (
                  <motion.div
                    key={i}
                    className="w-1 rounded-full bg-secondary/60"
                    custom={i}
                    variants={waveformVariants}
                    animate="animate"
                    style={{ height: 20 + Math.sin(i) * 10 }}
                  />
                ))}
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="w-full h-1.5 rounded-full bg-muted/50 overflow-hidden">
                  <motion.div
                    animate={{ width: ["40%", "45%", "40%"] }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="h-full rounded-full gradient-music"
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">1:23</span>
                  <span className="text-[10px] text-muted-foreground">3:45</span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-6">
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Shuffle className="w-4 h-4 text-muted-foreground hover:text-secondary cursor-pointer transition-colors" />
                </motion.div>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <SkipBack className="w-5 h-5 text-foreground hover:text-secondary cursor-pointer transition-colors" />
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  className="w-12 h-12 rounded-full gradient-music flex items-center justify-center cursor-pointer shadow-lg"
                >
                  <Play className="w-5 h-5 text-secondary-foreground ml-0.5" />
                </motion.div>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <SkipForward className="w-5 h-5 text-foreground hover:text-secondary cursor-pointer transition-colors" />
                </motion.div>
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Repeat className="w-4 h-4 text-muted-foreground hover:text-secondary cursor-pointer transition-colors" />
                </motion.div>
              </div>

              {/* Listeners */}
              <div className="flex items-center justify-center gap-1 mt-5">
                {["👩", "🧑", "👧", "🧔", "👱"].map((e, i) => (
                  <motion.div
                    key={i}
                    whileHover={{ scale: 1.2, y: -5 }}
                    className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-sm -ml-1 first:ml-0 border border-border cursor-pointer transition-all"
                  >
                    {e}
                  </motion.div>
                ))}
                <motion.span 
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-xs text-muted-foreground ml-2"
                >
                  +8 listening
                </motion.span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}