import { motion, useScroll, useTransform } from 'framer-motion'
import { Link } from 'react-router-dom'
import { useRef } from 'react'
import { wordReveal, floatEmoji, magneticHover } from '@/lib/landingAnimations'
import { Container } from '@/components/shared/Container'

export function HeroSection() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"]
  })

  const y = useTransform(scrollYProgress, [0, 1], [0, 300])
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0])
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1])

  const headline = "Watch Movies & Listen to Music Together, In Perfect Sync".split(" ")

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Cinematic Background Layers */}
      <motion.div 
        className="absolute inset-0"
        style={{ y, scale }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.3),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(16,185,129,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.05),transparent_60%)]" />
      </motion.div>

      {/* Floating Emojis */}
      <motion.div variants={floatEmoji} initial="initial" animate="animate" className="absolute top-1/4 left-1/4 text-7xl opacity-30">
        🎬
      </motion.div>
      <motion.div 
        variants={floatEmoji} 
        initial="initial" 
        animate="animate" 
        custom={{ delay: 1 }}
        className="absolute bottom-1/3 right-1/4 text-7xl opacity-30"
      >
        🎵
      </motion.div>
      <motion.div 
        variants={floatEmoji} 
        initial="initial" 
        animate="animate" 
        custom={{ delay: 2 }}
        className="absolute top-2/3 left-1/3 text-5xl opacity-30"
      >
        🍿
      </motion.div>

      {/* Main Content */}
      <Container>
        <motion.div 
          style={{ opacity }}
          className="relative z-10 text-center"
        >
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="inline-flex items-center px-4 py-2 rounded-full bg-movie/10 border border-movie/20 mb-8 backdrop-blur-sm"
          >
            <span className="relative flex h-2 w-2 mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-movie opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-movie"></span>
            </span>
            <span className="text-sm text-movie-light font-medium">✨ Real-time sync • No login required</span>
          </motion.div>

          {/* Headline with Word Reveal */}
          <h1 className="text-5xl md:text-7xl font-black mb-6 leading-tight max-w-6xl mx-auto">
            {headline.map((word, i) => (
              <motion.span
                key={i}
                custom={i}
                variants={wordReveal}
                initial="hidden"
                animate="show"
                className="inline-block mr-[0.25em]"
              >
                {word}
              </motion.span>
            ))}
          </h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="text-xl text-text-secondary mb-12 max-w-2xl mx-auto"
          >
            Create a room, share the link, and enjoy movies or music with friends — 
            with crystal-clear voice chat and instant reactions.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link to="/movie">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(59,130,246,0.5)" }}
                whileTap={{ scale: 0.98 }}
                className="btn-movie-primary px-8 py-4 text-lg group relative overflow-hidden"
              >
                <span className="relative z-10">🎬 Start Movie Night</span>
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>
            </Link>
            
            <Link to="/music">
              <motion.button
                whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(16,185,129,0.5)" }}
                whileTap={{ scale: 0.98 }}
                className="btn-music-primary px-8 py-4 text-lg group relative overflow-hidden"
              >
                <span className="relative z-10">🎵 Start Music Party</span>
                <motion.div
                  className="absolute inset-0 bg-white/20"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: 0 }}
                  transition={{ duration: 0.3 }}
                />
              </motion.button>
            </Link>
          </motion.div>

          {/* Scroll Indicator */}
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute bottom-10 left-1/2 transform -translate-x-1/2"
          >
            <div className="w-6 h-10 border-2 border-text-tertiary/30 rounded-full flex justify-center backdrop-blur-sm">
              <div className="w-1 h-3 bg-gradient-to-b from-movie to-music rounded-full mt-2" />
            </div>
          </motion.div>
        </motion.div>
      </Container>
    </section>
  )
}