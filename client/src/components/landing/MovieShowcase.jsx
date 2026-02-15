import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { SectionWrapper } from './SectionWrapper'
import { leftReveal, rightReveal } from '@/lib/landingAnimations'

export function MovieShowcase() {
  const ref = useRef(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  })

  const rotateX = useTransform(scrollYProgress, [0, 0.5, 1], [10, 0, 10])
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.95, 1, 0.95])

  return (
    <SectionWrapper theme="movie">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        {/* Left - Video Preview */}
        <motion.div
          ref={ref}
          variants={leftReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          style={{ rotateX, scale }}
          className="relative group"
        >
          <div className="movie-player-container aspect-video">
            {/* Mock Video Player */}
            <div className="absolute inset-0 bg-gradient-to-br from-movie/20 to-transparent" />
            
            {/* Play Button Overlay */}
            <motion.div 
              className="absolute inset-0 flex items-center justify-center"
              whileHover={{ scale: 1.1 }}
            >
              <div className="w-20 h-20 rounded-full bg-movie/30 backdrop-blur-md flex items-center justify-center border-2 border-white/50">
                <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-white border-b-[12px] border-b-transparent ml-1" />
              </div>
            </motion.div>

            {/* Control Bar Mock */}
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/80 to-transparent px-4 flex items-end pb-3">
              <div className="w-full flex items-center gap-2">
                <div className="w-24 h-1 bg-white/30 rounded-full">
                  <div className="w-16 h-1 bg-movie rounded-full" />
                </div>
                <div className="text-xs text-white/70">1:23 / 2:15</div>
              </div>
            </div>
          </div>

          {/* Participant Avatars */}
          <div className="absolute -bottom-4 left-8 flex -space-x-2">
            {[1,2,3].map(i => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.1, zIndex: 10 }}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-movie to-music border-2 border-background"
              />
            ))}
          </div>
        </motion.div>

        {/* Right - Content */}
        <motion.div
          variants={rightReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-movie/10 border border-movie/20">
            <span className="text-movie-light text-sm font-medium">🎬 CINEMA GRADE</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold">
            Watch Movies{' '}
            <span className="text-gradient-movie">Together</span>
          </h2>

          <p className="text-text-secondary text-lg">
            No more "3, 2, 1... play" texts. Our sync engine keeps everyone within 50ms of each other.
          </p>

          <ul className="space-y-4">
            {[
              'Frame-accurate synchronization',
              'Theatre mode with ambient glow',
              'Screen sharing for any streaming service',
              'Real-time reactions that float across the screen'
            ].map((item, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3"
              >
                <span className="text-movie">✓</span>
                <span>{item}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>
    </SectionWrapper>
  )
}