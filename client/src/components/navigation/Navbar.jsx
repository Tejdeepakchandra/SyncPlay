import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useNavbarAnimation } from '@/hooks/useNavbarAnimation'
import { navItems } from '@/config/navigation'

export function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const { isVisible, isAnimating, currentTheme, navigateWithAnimation } = useNavbarAnimation()
  
  // Handle scroll
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Handle navigation with animation
  const handleNavigation = (path, theme) => {
    if (path === location.pathname) return
    
    navigateWithAnimation(theme)
    
    // Navigate after animation starts
    setTimeout(() => {
      navigate(path)
    }, 400)
  }

  // Theme styles
  const themeStyles = {
    movie: {
      border: 'border-movie/30',
      bg: 'bg-movie/5',
      text: 'text-movie',
      glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]',
    },
    music: {
      border: 'border-music/30',
      bg: 'bg-music/5',
      text: 'text-music',
      glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
    },
    friends: {
      border: 'border-friends/30',
      bg: 'bg-friends/5',
      text: 'text-friends',
      glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.3)]',
    },
    default: {
      border: 'border-border',
      bg: 'bg-background-card',
      text: 'text-text-primary',
      glow: 'hover:shadow-lg',
    },
  }

  const currentStyle = themeStyles[currentTheme] || themeStyles.default

  return (
    <>
      {/* Page Blink Style */}
      <style>{`
        .page-blink {
          animation: pageBlink 0.3s ease-in-out;
        }
      `}</style>

      <AnimatePresence mode="wait">
        {isVisible && (
          <motion.header
            key="navbar"
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            transition={{ 
              duration: 0.8,
              ease: [0.4, 0, 0.2, 1],
            }}
            className={cn(
              'fixed top-0 left-0 right-0 z-50',
              'transition-all duration-300',
              scrolled ? 'glass-dark' : 'bg-transparent',
              isAnimating && 'pointer-events-none'
            )}
          >
            <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16 md:h-20">
                {/* Left - SyncPlay Logo */}
                <Link 
                  to="/" 
                  onClick={() => handleNavigation('/', 'default')}
                  className="group relative"
                >
                  <motion.div 
                    className="flex items-center space-x-2"
                    whileHover={{ scale: 1.02 }}
                    transition={{ duration: 0.2 }}
                  >
                    <img 
                      src="/logos/syncplay-logo.png" 
                      alt="SyncPlay" 
                      className="h-8 w-auto opacity-90 group-hover:opacity-100 transition-all duration-300"
                      onError={(e) => {
                        e.target.style.display = 'none'
                        e.target.nextSibling.style.display = 'block'
                      }}
                    />
                    <span className="hidden text-2xl font-bold bg-gradient-to-r from-movie to-music bg-clip-text text-transparent">
                      SyncPlay
                    </span>
                  </motion.div>
                </Link>

                {/* Center - Navigation Items */}
                <nav className="hidden md:flex items-center space-x-1">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path
                    
                    return (
                      <motion.button
                        key={item.path}
                        onClick={() => handleNavigation(item.path, item.theme)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        className={cn(
                          'relative px-5 py-2 rounded-2xl',
                          'transition-all duration-300',
                          'flex items-center space-x-2',
                          'border border-transparent',
                          isActive ? [
                            currentStyle.border,
                            currentStyle.bg,
                            currentStyle.text,
                          ] : [
                            'text-text-tertiary',
                            'hover:text-text-primary',
                            'hover:border-border/50',
                            'hover:bg-background-card/50',
                            currentStyle.glow,
                          ]
                        )}
                      >
                        {/* Icon */}
                        <span className="text-xl">{item.icon}</span>
                        
                        {/* Label */}
                        <span className="text-sm font-medium">{item.label}</span>

                        {/* Active Indicator */}
                        {isActive && (
                          <motion.div
                            layoutId="activeNavIndicator"
                            className={cn(
                              'absolute -bottom-0.5 left-1/2 transform -translate-x-1/2',
                              'w-1 h-1 rounded-full',
                              `bg-${item.theme}`
                            )}
                            transition={{ duration: 0.3 }}
                          />
                        )}
                      </motion.button>
                    )
                  })}
                </nav>

                {/* Right - Bell + Profile */}
                <div className="flex items-center space-x-3">
                  {/* Notification Bell */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      'relative p-2.5 rounded-xl',
                      'transition-all duration-300',
                      'text-text-tertiary hover:text-text-primary',
                      'border border-transparent hover:border-border/50',
                      'hover:bg-background-card/50',
                      currentStyle.glow
                    )}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
                      />
                    </svg>
                    
                    {/* Notification Badge */}
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
                  </motion.button>

                  {/* Profile / Sign In */}
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      'w-9 h-9 rounded-xl',
                      'transition-all duration-300',
                      'border border-transparent',
                      'bg-gradient-to-br from-movie to-music',
                      'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]',
                      'flex items-center justify-center'
                    )}
                  >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" 
                      />
                    </svg>
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.header>
        )}
      </AnimatePresence>
    </>
  )
}