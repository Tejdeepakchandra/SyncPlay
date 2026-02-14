import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { navItems } from '@/config/navigation'

export function MobileNav() {
  const location = useLocation()

  const getThemeColor = (path) => {
    if (path.includes('/movie')) return 'bg-movie'
    if (path.includes('/music')) return 'bg-music'
    if (path.includes('/friends')) return 'bg-friends'
    return 'bg-movie'
  }

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-dark border-t border-border/30"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {/* Home */}
        <Link to="/" className="group">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={cn(
              'flex flex-col items-center px-4 py-2 rounded-2xl',
              'transition-all duration-300',
              location.pathname === '/' 
                ? 'text-movie bg-movie/10' 
                : 'text-text-tertiary hover:text-text-primary'
            )}
          >
            <img src="/logos/syncplay-logo.png" alt="Home" className="w-6 h-6 opacity-80 group-hover:opacity-100" />
            <span className="text-xs mt-1 font-medium">Home</span>
          </motion.div>
        </Link>

        {/* Movie, Music, Friends from config */}
        {navItems.map((item) => {
          const isActive = location.pathname === item.path
          const themeColor = getThemeColor(item.path)
          
          return (
            <Link key={item.path} to={item.path} className="group">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  'flex flex-col items-center px-4 py-2 rounded-2xl',
                  'transition-all duration-300',
                  isActive ? [
                    `text-${item.theme}`,
                    `bg-${item.theme}/10`,
                  ] : 'text-text-tertiary hover:text-text-primary'
                )}
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-xs mt-1 font-medium">{item.label}</span>
                
                {/* Active Indicator */}
                {isActive && (
                  <motion.div
                    layoutId="mobileActiveIndicator"
                    className={cn('w-1 h-1 rounded-full mt-1', themeColor)}
                  />
                )}
              </motion.div>
            </Link>
          )
        })}

        {/* Profile */}
        <Link to="/profile" className="group">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={cn(
              'flex flex-col items-center px-4 py-2 rounded-2xl',
              'transition-all duration-300',
              location.pathname === '/profile'
                ? 'text-movie bg-movie/10'
                : 'text-text-tertiary hover:text-text-primary'
            )}
          >
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-movie to-music flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
                />
              </svg>
            </div>
            <span className="text-xs mt-1 font-medium">Profile</span>
          </motion.div>
        </Link>
      </div>
    </motion.nav>
  )
}