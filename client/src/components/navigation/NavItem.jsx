import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export function NavItem({ 
  to, 
  icon, 
  label, 
  theme = 'movie',
  isMobile = false 
}) {
  const themeStyles = {
    movie: {
      active: 'text-movie border-movie',
      hover: 'group-hover:text-movie',
      glow: 'group-hover:shadow-[0_0_15px_rgba(37,99,235,0.5)]',
      border: 'border-movie',
      bg: 'bg-movie/10'
    },
    music: {
      active: 'text-music border-music',
      hover: 'group-hover:text-music',
      glow: 'group-hover:shadow-[0_0_15px_rgba(22,163,74,0.5)]',
      border: 'border-music',
      bg: 'bg-music/10'
    },
    friends: {
      active: 'text-friends border-friends',
      hover: 'group-hover:text-friends',
      glow: 'group-hover:shadow-[0_0_15px_rgba(212,175,55,0.5)]',
      border: 'border-friends',
      bg: 'bg-friends/10'
    }
  }

  const style = themeStyles[theme] || themeStyles.movie

  return (
    <NavLink to={to} className="group">
      {({ isActive }) => (
        <motion.div
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'relative px-4 py-2 rounded-xl transition-all duration-200',
            'flex items-center space-x-2',
            // Base state (dimmed)
            'text-secondary opacity-70',
            // Hover state (brighten + glow)
            style.hover,
            style.glow,
            'hover:opacity-100 hover:bg-surface/50',
            // Active state
            isActive && [
              'opacity-100',
              style.active,
              style.bg,
              'border-b-2',
              style.border
            ]
          )}
        >
          {/* Icon with animation */}
          <motion.span 
            className="text-xl"
            animate={isActive ? { rotate: [0, -10, 10, 0] } : {}}
            transition={{ duration: 0.3 }}
          >
            {icon}
          </motion.span>
          
          {/* Label */}
          <span className="text-sm font-medium">{label}</span>
          
          {/* Active indicator dot (mobile) */}
          {isActive && isMobile && (
            <motion.div
              layoutId="activeDot"
              className={cn(
                'absolute -bottom-1 left-1/2 w-1 h-1 rounded-full',
                style.bg
              )}
              style={{ x: '-50%' }}
            />
          )}
        </motion.div>
      )}
    </NavLink>
  )
}