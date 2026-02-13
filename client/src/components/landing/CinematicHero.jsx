import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { MotionButton } from '@/components/ui/MotionButton'
import { 
  fadeIn, 
  slideUp, 
  staggerContainer,
  floatVariants,
  rotateVariants 
} from '@/lib/animations'

export function CinematicHero() {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden bg-cinematic">
      {/* Animated Background Particles */}
      <motion.div
        className="absolute inset-0"
        variants={rotateVariants}
        animate="animate"
      >
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-movie-glow-soft rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-1/3 right-1/4 w-96 h-96 bg-music-glow-soft rounded-full blur-3xl opacity-20" />
      </motion.div>

      {/* Floating Emojis */}
      <motion.div
        className="absolute top-20 left-[20%] text-4xl"
        variants={floatVariants}
        animate="animate"
      >
        🎬
      </motion.div>
      <motion.div
        className="absolute bottom-20 right-[20%] text-4xl"
        variants={floatVariants}
        animate="animate"
        custom={1}
      >
        🎵
      </motion.div>
      <motion.div
        className="absolute top-1/3 right-[15%] text-3xl"
        variants={floatVariants}
        animate="animate"
        custom={2}
      >
        🍿
      </motion.div>
      <motion.div
        className="absolute bottom-1/3 left-[15%] text-3xl"
        variants={floatVariants}
        animate="animate"
        custom={3}
      >
        👑
      </motion.div>

      {/* Main Content */}
      <motion.div
        className="relative z-10 text-center max-w-5xl mx-auto px-4"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        <motion.h1
          className="text-6xl md:text-7xl lg:text-8xl font-bold mb-6"
          variants={slideUp}
        >
          <span className="text-gradient-movie">Watch</span>
          <span className="text-white"> & </span>
          <span className="text-gradient-music">Listen</span>
          <br />
          <span className="text-white">Together, </span>
          <span className="text-gradient-movie">In Sync.</span>
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl text-text-secondary mb-8"
          variants={slideUp}
        >
          No downloads. No sign-up required.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          variants={slideUp}
        >
          <Link to="/movie">
            <MotionButton theme="movie" size="lg">
              🎬 Try Movie Room
            </MotionButton>
          </Link>
          <Link to="/music">
            <MotionButton theme="music" size="lg">
              🎵 Try Music Room
            </MotionButton>
          </Link>
        </motion.div>

        <motion.div
          className="mt-12 flex gap-2 justify-center"
          variants={slideUp}
        >
          <input
            type="text"
            placeholder="Enter room code"
            className="w-64 px-4 py-3 bg-background-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-movie/50 focus:border-movie transition-all text-white placeholder-text-tertiary"
          />
          <MotionButton theme="movie" variant="secondary">
            Join Room
          </MotionButton>
        </motion.div>

        {/* Guest Badge */}
        <motion.div
          className="mt-8"
          variants={fadeIn}
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-background-elevated rounded-full border border-border">
            <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            <span className="text-sm text-text-secondary">Guest mode available — no login needed</span>
          </span>
        </motion.div>
      </motion.div>

      {/* Scroll Indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2"
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="w-6 h-10 border-2 border-border rounded-full flex justify-center">
          <div className="w-1 h-2 bg-movie rounded-full mt-2" />
        </div>
      </motion.div>
    </section>
  )
}