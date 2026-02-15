import { motion } from 'framer-motion'
import { SectionWrapper } from './SectionWrapper'
import { staggerContainer, cardItem } from '@/lib/landingAnimations'

const features = [
  {
    icon: '⚡',
    title: 'Perfect Sync',
    description: 'Frame-accurate synchronization with drift correction under 50ms.',
    theme: 'movie'
  },
  {
    icon: '🎤',
    title: 'Crystal Voice',
    description: 'High-quality WebRTC voice chat while you watch or listen.',
    theme: 'music'
  },
  {
    icon: '👥',
    title: 'Social First',
    description: 'Instagram-style friends system with real-time presence.',
    theme: 'friends'
  },
  {
    icon: '📱',
    title: 'PWA Ready',
    description: 'Install like a native app on any device. Works offline.',
    theme: 'movie'
  }
]

export function WhySection() {
  return (
    <SectionWrapper theme="movie">
      <div className="text-center mb-16">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-4xl md:text-5xl font-bold mb-4"
        >
          Why Choose{' '}
          <span className="text-gradient-movie">SyncPlay</span>?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-text-secondary text-lg max-w-2xl mx-auto"
        >
          Built for real connections, not just streaming.
        </motion.p>
      </div>

      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.3 }}
        className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        {features.map((feature, index) => (
          <motion.div
            key={index}
            variants={cardItem}
            className="group relative"
          >
            <div className={`card-cinematic p-8 h-full ${
              feature.theme === 'movie' ? 'card-cinematic' : 
              feature.theme === 'music' ? 'card-cinematic-music' : 
              'border-friends/30 hover:border-friends'
            }`}>
              {/* Icon */}
              <div className={`text-5xl mb-4 transform group-hover:scale-110 transition-transform duration-300 ${
                feature.theme === 'movie' ? 'text-movie' :
                feature.theme === 'music' ? 'text-music' : 'text-friends'
              }`}>
                {feature.icon}
              </div>

              {/* Content */}
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-text-secondary">{feature.description}</p>

              {/* Hover Glow */}
              <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ${
                feature.theme === 'movie' ? 'movie-glow' :
                feature.theme === 'music' ? 'music-glow' : 'friends-glow'
              }`} />
            </div>
          </motion.div>
        ))}
      </motion.div>
    </SectionWrapper>
  )
}