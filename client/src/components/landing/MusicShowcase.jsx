import { motion } from 'framer-motion'
import { SectionWrapper } from './SectionWrapper'
import { leftReveal, rightReveal } from '@/lib/landingAnimations'

export function MusicShowcase() {
  return (
    <SectionWrapper theme="music">
      <div className="grid lg:grid-cols-2 gap-12 items-center">
        {/* Left - Content (Reversed Order) */}
        <motion.div
          variants={leftReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="space-y-6 lg:order-1"
        >
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-music/10 border border-music/20">
            <span className="text-music-light text-sm font-medium">🎵 STUDIO QUALITY</span>
          </div>

          <h2 className="text-4xl md:text-5xl font-bold">
            Listen to Music{' '}
            <span className="text-gradient-music">Collaboratively</span>
          </h2>

          <p className="text-text-secondary text-lg">
            Create collaborative playlists, vote on next songs, and enjoy perfect sync.
          </p>

          <ul className="space-y-4">
            {[
              'Collaborative playlists with voting',
              'Background audio (keeps playing when minimized)',
              'Waveform visualization',
              'DJ rotation system'
            ].map((item, i) => (
              <motion.li
                key={i}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex items-center gap-3"
              >
                <span className="text-music">✓</span>
                <span>{item}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        {/* Right - Music Player Mock */}
        <motion.div
          variants={rightReveal}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.3 }}
          className="relative group lg:order-2"
        >
          <div className="bg-background-card rounded-2xl p-8 border border-music/20">
            {/* Album Art */}
            <div className="aspect-square rounded-xl bg-gradient-to-br from-music/30 to-music/10 mb-6 relative overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 rounded-full bg-music/30 animate-pulse" />
              </div>
            </div>

            {/* Song Info */}
            <div className="space-y-4">
              <div>
                <div className="h-6 w-32 bg-music/20 rounded animate-pulse mb-2" />
                <div className="h-4 w-24 bg-music/10 rounded animate-pulse" />
              </div>

              {/* Waveform */}
              <div className="waveform-container">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="wave-bar"
                    animate={{
                      height: [16, 32, 16],
                    }}
                    transition={{
                      duration: 1,
                      delay: i * 0.05,
                      repeat: Infinity
                    }}
                  />
                ))}
              </div>

              {/* Controls */}
              <div className="flex justify-center gap-4">
                <div className="w-10 h-10 rounded-full bg-music/20" />
                <div className="w-12 h-12 rounded-full bg-music" />
                <div className="w-10 h-10 rounded-full bg-music/20" />
              </div>
            </div>
          </div>

          {/* Glow Effect */}
          <div className="absolute -inset-4 bg-music/20 blur-3xl -z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </motion.div>
      </div>
    </SectionWrapper>
  )
}