import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Film, Music, Play, Users, MessageCircle, Smile } from "lucide-react";
import { leftReveal, rightReveal, floatEmoji, buttonHover } from "@/lib/landingAnimations";
import heroImage from "@/assets/hero-image.jpg";

// Pre-computed random positions to avoid impure Math.random in render
const particlePositions = Array.from({ length: 10 }, (_, i) => ({
  left: (17 + i * 8.3) % 100,
  top: (23 + i * 7.1) % 100,
  duration: 4 + (i % 5) * 0.8,
}));

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Static Background */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="SyncPlay virtual movie room"
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/60" />
      </div>

      {/* Floating particles - Optimized */}
      {particlePositions.map((p, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-primary/40"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
          }}
          animate={{
            y: [0, -40, 0],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.2,
          }}
        />
      ))}

      <div className="container mx-auto px-4 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: Copy */}
          <motion.div
            variants={leftReveal}
            initial="hidden"
            animate="show"
            className="max-w-xl"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              No sign-up required
            </motion.div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Watch Movies & Listen to Music —{" "}
              <span className="text-gradient-movie">Together</span>, in{" "}
              <span className="text-gradient-music">Sync</span>.
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-md">
              No downloads. No sign-up required. Just create a room and invite
              friends for the ultimate shared experience.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/movies">
                <motion.button
                  variants={buttonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-primary-foreground gradient-movie hover-glow-movie transition-all"
                >
                  <Film className="w-5 h-5" />
                  Try Movie Room
                </motion.button>
              </Link>
              <Link to="/music">
                <motion.button
                  variants={buttonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-secondary border-2 border-secondary/40 hover:bg-secondary/10 hover-glow-music transition-all"
                >
                  <Music className="w-5 h-5" />
                  Try Music Room
                </motion.button>
              </Link>
            </div>
          </motion.div>

          {/* Right: Animated preview */}
          <motion.div
            variants={rightReveal}
            initial="hidden"
            animate="show"
            className="hidden lg:block"
          >
            <div className="relative">
              {/* Main player preview */}
              <motion.div
                variants={floatEmoji}
                animate="animate"
                className="glass-panel p-3 glow-movie"
              >
                <div className="aspect-video rounded-xl bg-muted/50 flex items-center justify-center relative overflow-hidden">
                  <img
                    src={heroImage}
                    alt="Movie preview"
                    className="absolute inset-0 w-full h-full object-cover opacity-60 rounded-xl"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="relative z-10 w-16 h-16 rounded-full bg-primary/90 flex items-center justify-center backdrop-blur-sm cursor-pointer"
                  >
                    <Play className="w-7 h-7 text-primary-foreground ml-1" />
                  </motion.div>
                </div>

                {/* Participant faces */}
                <div className="flex items-center gap-2 mt-3 px-2">
                  {["🧑", "👩", "🧔", "👧"].map((emoji, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.8 + i * 0.1 }}
                      whileHover={{ scale: 1.2, y: -5 }}
                      className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg border-2 border-border cursor-pointer transition-all"
                    >
                      {emoji}
                    </motion.div>
                  ))}
                  <span className="text-xs text-muted-foreground ml-2">+12 watching</span>
                </div>
              </motion.div>

              {/* Floating chat bubble */}
              <motion.div
                animate={{ y: [0, -15, 0], x: [0, 8, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-4 top-8 glass-panel px-4 py-2 flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground">This scene is amazing! 🔥</span>
              </motion.div>

              {/* Floating reaction */}
              <motion.div
                animate={{ y: [0, -20, 0], x: [0, -12, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="absolute -left-6 bottom-20 glass-panel px-3 py-2 flex items-center gap-2"
              >
                <Smile className="w-4 h-4 text-secondary" />
                <span className="text-2xl">😂🎬👏</span>
              </motion.div>

              {/* Sync indicator */}
              <motion.div
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute left-4 -top-3 glass-panel px-3 py-1.5 flex items-center gap-2"
              >
                <Users className="w-3.5 h-3.5 text-secondary" />
                <span className="text-xs text-secondary font-medium">In Sync</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}