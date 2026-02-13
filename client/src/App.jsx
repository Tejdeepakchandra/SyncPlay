import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { PageTransition } from './components/shared/PageTransition'
import { CinematicHero } from './components/landing/CinematicHero'
import { MotionCard } from './components/ui/MotionCard'
import { MotionButton } from './components/ui/MotionButton'
import { AnimatedWaveform } from './components/music/AnimatedWaveform'

function App() {
  const location = useLocation()

  return (
    <ThemeProvider>
      <AnimatePresence mode="wait">
        <PageTransition key={location.pathname}>
          <div className="min-h-screen bg-cinematic">
            <CinematicHero />
            
            {/* Features Section with Motion Cards */}
            <section className="py-20 px-4 bg-surface-1">
              <div className="max-w-7xl mx-auto">
                <motion.h2 
                  className="text-4xl font-bold text-center mb-12 text-gradient-movie"
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  Everything You Need for the Perfect Watch Party
                </motion.h2>
                
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <MotionCard theme="movie">
                    <div className="p-6">
                      <div className="text-4xl mb-4">🚪</div>
                      <h3 className="text-xl font-semibold text-white mb-2">No Login Required</h3>
                      <p className="text-text-secondary">Start watching instantly. No account needed.</p>
                    </div>
                  </MotionCard>
                  
                  <MotionCard theme="movie">
                    <div className="p-6">
                      <div className="text-4xl mb-4">⚡</div>
                      <h3 className="text-xl font-semibold text-white mb-2">Perfect Sync Engine</h3>
                      <p className="text-text-secondary">Frame-accurate synchronization across all devices.</p>
                    </div>
                  </MotionCard>
                  
                  <MotionCard theme="music">
                    <div className="p-6">
                      <div className="text-4xl mb-4">💬</div>
                      <h3 className="text-xl font-semibold text-white mb-2">Chat, Voice & Reactions</h3>
                      <p className="text-text-secondary">Real-time communication with emoji reactions.</p>
                    </div>
                  </MotionCard>
                  
                  <MotionCard theme="music">
                    <div className="p-6">
                      <div className="text-4xl mb-4">📱</div>
                      <h3 className="text-xl font-semibold text-white mb-2">Works on Mobile</h3>
                      <p className="text-text-secondary">PWA support. Install like a native app.</p>
                    </div>
                  </MotionCard>
                </div>
              </div>
            </section>

            {/* Music Preview Section */}
            <section className="py-20 px-4">
              <div className="max-w-4xl mx-auto text-center">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  className="bg-background-card p-12 rounded-2xl border border-border"
                >
                  <div className="text-6xl mb-6">🎧</div>
                  <h3 className="text-2xl font-bold text-white mb-4">Premium Music Experience</h3>
                  <div className="flex justify-center mb-6">
                    <AnimatedWaveform />
                  </div>
                  <p className="text-text-secondary mb-6">
                    Collaborative playlists, crystal clear audio, and background playback.
                  </p>
                  <MotionButton theme="music">
                    Start Music Party
                  </MotionButton>
                </motion.div>
              </div>
            </section>

            {/* Theatre Mode Demo */}
            <section className="py-20 px-4 bg-surface-1">
              <div className="max-w-4xl mx-auto text-center">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                >
                  <h3 className="text-2xl font-bold text-white mb-4">🎬 Cinematic Theatre Mode</h3>
                  <div className="relative movie-player-container aspect-video mb-6">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-text-secondary">Preview Theatre Experience</span>
                    </div>
                    <div className="control-bar">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className="text-white">⏯️</span>
                          <span className="text-white">🔊</span>
                          <span className="text-white">⏺️</span>
                        </div>
                        <span className="text-xs text-text-secondary">00:00 / 02:15</span>
                      </div>
                    </div>
                  </div>
                  <MotionButton theme="movie" variant="secondary">
                    Enter Theatre Mode
                  </MotionButton>
                </motion.div>
              </div>
            </section>
          </div>
        </PageTransition>
      </AnimatePresence>
    </ThemeProvider>
  )
}

export default App