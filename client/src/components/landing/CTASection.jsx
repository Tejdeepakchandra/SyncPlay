import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { SectionWrapper } from './SectionWrapper'
import { scaleReveal, magneticHover } from '@/lib/landingAnimations'

export function CTASection() {
  return (
    <SectionWrapper theme="movie" className="relative">
      {/* Rotating Glow Background */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            'radial-gradient(circle at 30% 50%, rgba(59,130,246,0.2) 0%, transparent 50%)',
            'radial-gradient(circle at 70% 50%, rgba(16,185,129,0.2) 0%, transparent 50%)',
            'radial-gradient(circle at 30% 50%, rgba(59,130,246,0.2) 0%, transparent 50%)',
          ]
        }}
        transition={{ duration: 10, repeat: Infinity }}
      />

      <motion.div
        variants={scaleReveal}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        className="text-center max-w-3xl mx-auto relative z-10"
      >
        <h2 className="text-5xl md:text-6xl font-bold mb-6">
          Ready for{' '}
          <span className="text-gradient-movie">Movie Night</span>
          ?
        </h2>

        <p className="text-xl text-text-secondary mb-10">
          No downloads. No sign-up required. Just pure shared entertainment.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/movie">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(59,130,246,0.6)" }}
              whileTap={{ scale: 0.98 }}
              className="btn-movie-primary px-8 py-4 text-lg relative overflow-hidden group"
            >
              <span className="relative z-10">🎬 Create Movie Room</span>
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.5 }}
              />
            </motion.button>
          </Link>

          <Link to="/music">
            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 0 40px rgba(16,185,129,0.6)" }}
              whileTap={{ scale: 0.98 }}
              className="btn-music-primary px-8 py-4 text-lg relative overflow-hidden group"
            >
              <span className="relative z-10">🎵 Create Music Room</span>
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: "-100%" }}
                whileHover={{ x: "100%" }}
                transition={{ duration: 0.5 }}
              />
            </motion.button>
          </Link>
        </div>

        <p className="mt-8 text-sm text-text-tertiary">
          ✨ Free forever • No credit card required • Works on all devices
        </p>
      </motion.div>
    </SectionWrapper>
  )
}