import { useState, useRef, useCallback } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Film, Music, Play, Users, MessageCircle, Smile, Pause, Sparkles, Shield } from "lucide-react";
import { leftReveal, rightReveal, floatEmoji, buttonHover } from "@/lib/landingAnimations";
import heroImage from "@/assets/hero-image.jpg";
import heroVideo from "@/assets/Futuristic_Sync_Watch_Animation_Scene.mp4";

// Pre-computed random positions to avoid impure Math.random in render
const particlePositions = Array.from({ length: 8 }, (_, i) => ({
  left: (17 + i * 8.3) % 100,
  top: (23 + i * 7.1) % 100,
  duration: 6 + (i % 3) * 1.1,
  size: i % 3 === 0 ? 2 : 1,
}));

export default function HeroSection() {
  const reduceMotion = useReducedMotion();
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef(null);

  const handlePlayVideo = useCallback(() => {
    if (videoRef.current) {
      if (isVideoPlaying) {
        videoRef.current.pause();
        setIsVideoPlaying(false);
      } else {
        videoRef.current.play().then(() => {
          setIsVideoPlaying(true);
        }).catch(() => {
          // Autoplay blocked — user needs to tap again
        });
      }
    }
  }, [isVideoPlaying]);

  const handleVideoEnded = useCallback(() => {
    setIsVideoPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-16">
      {/* Static Background */}
      <div className="absolute inset-0">
        <img
          src={heroImage}
          alt="SyncPlay virtual movie room"
          className="w-full h-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/75 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/50" />
      </div>

      {/* Floating particles */}
      {particlePositions.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full bg-primary/30"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: reduceMotion ? 0 : [0, -22, 0],
            opacity: reduceMotion ? 0.3 : [0.15, 0.5, 0.15],
          }}
          transition={{
            duration: p.duration,
            repeat: reduceMotion ? 0 : Infinity,
            ease: "easeInOut",
            delay: i * 0.25,
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
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/8 border border-primary/15 text-primary text-xs font-medium mb-6 backdrop-blur-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Guests join free — no sign-up needed
            </motion.div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] mb-6">
              Watch Movies & Listen to Music —{" "}
              <span className="text-gradient-movie">Together</span>, in{" "}
              <span className="text-gradient-music">Sync</span>.
            </h1>

            <p className="text-lg text-muted-foreground leading-relaxed mb-4 max-w-md">
              Create a room, share the link, and enjoy movies or music with friends in perfect sync.
              Real-time chat, reactions, and voice chat included.
            </p>

            {/* Clarification about sign-in */}
            <div className="flex items-center gap-2 mb-8 text-sm text-muted-foreground/80">
              <Shield className="w-4 h-4 text-primary/60 flex-shrink-0" />
              <span>
                <span className="text-foreground/90 font-medium">Sign in to create rooms</span> — friends can join as guests instantly
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link to="/movies">
                <motion.button
                  variants={buttonHover}
                  whileHover="whileHover"
                  whileTap="whileTap"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-primary-foreground gradient-movie hover-glow-movie transition-all w-full sm:w-auto"
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
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl font-semibold text-secondary border-2 border-secondary/30 hover:bg-secondary/10 hover-glow-music transition-all w-full sm:w-auto"
                >
                  <Music className="w-5 h-5" />
                  Try Music Room
                </motion.button>
              </Link>
            </div>
          </motion.div>

          {/* Right: Animated preview with video */}
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
                animate={reduceMotion ? undefined : "animate"}
                className="landing-panel p-3"
              >
                <div
                  className="aspect-video rounded-xl bg-muted/50 relative overflow-hidden cursor-pointer group"
                  onClick={handlePlayVideo}
                >
                  {/* Static image (poster) */}
                  <img
                    src={heroImage}
                    alt="Movie preview"
                    className={`absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-500 ${
                      isVideoPlaying ? "opacity-0" : "opacity-60"
                    }`}
                  />

                  {/* Animated video */}
                  <video
                    ref={videoRef}
                    src={heroVideo}
                    className={`absolute inset-0 w-full h-full object-cover rounded-xl transition-opacity duration-500 ${
                      isVideoPlaying ? "opacity-100" : "opacity-0"
                    }`}
                    muted
                    playsInline
                    preload="metadata"
                    onEnded={handleVideoEnded}
                  />

                  {/* Gradient overlay */}
                  <div className={`absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent rounded-xl transition-opacity duration-300 ${
                    isVideoPlaying ? "opacity-30" : "opacity-60"
                  }`} />

                  {/* Play/Pause button */}
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={isVideoPlaying ? "pause" : "play"}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <motion.div
                        animate={!isVideoPlaying && !reduceMotion ? { scale: [1, 1.08, 1] } : {}}
                        transition={{ duration: 2.4, repeat: Infinity }}
                        className={`w-16 h-16 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-300 ${
                          isVideoPlaying
                            ? "bg-black/30 border-white/20 opacity-0 group-hover:opacity-100"
                            : "bg-primary/85 border-primary/30 shadow-lg shadow-primary/25"
                        }`}
                      >
                        {isVideoPlaying ? (
                          <Pause className="w-6 h-6 text-white" />
                        ) : (
                          <Play className="w-7 h-7 text-primary-foreground ml-1" />
                        )}
                      </motion.div>
                    </motion.div>
                  </AnimatePresence>

                  {/* Video playing indicator */}
                  <AnimatePresence>
                    {isVideoPlaying && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="absolute bottom-3 left-3 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm"
                      >
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                        </span>
                        <span className="text-[10px] font-medium text-white/80">Preview Playing</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
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
                  <span className="text-xs text-muted-foreground ml-2">
                    Watching together
                  </span>
                </div>
              </motion.div>

              {/* Floating chat bubble */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5 }}
                className="absolute -right-4 top-8 landing-panel px-4 py-2.5 flex items-center gap-2.5 shadow-lg"
              >
                <MessageCircle className="w-4 h-4 text-primary" />
                <span className="text-sm text-foreground">This scene is amazing! 🔥</span>
              </motion.div>

              {/* Floating reaction */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="absolute -left-6 bottom-20 landing-panel px-3 py-2.5 flex items-center gap-2 shadow-lg"
              >
                <Smile className="w-4 h-4 text-secondary" />
                <span className="text-2xl">😂🎬👏</span>
              </motion.div>

              {/* Sync indicator */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.35 }}
                className="absolute left-4 -top-3 landing-panel px-3 py-1.5 flex items-center gap-2 shadow-lg"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary" />
                </span>
                <span className="text-xs text-secondary font-medium">In Sync</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}