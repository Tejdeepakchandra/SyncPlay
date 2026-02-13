import { motion } from 'framer-motion'
import { buttonHover, musicButtonHover } from '@/lib/animations'
import { cn } from '@/lib/utils'

export function MotionButton({ 
  theme = 'movie',
  variant = 'primary',
  size = 'default',
  className,
  children,
  ...props 
}) {
  
  const baseStyles = 'font-semibold rounded-xl transition-all duration-250'
  
  const sizeStyles = {
    default: 'px-6 py-3 text-base',
    sm: 'px-4 py-2 text-sm',
    lg: 'px-8 py-4 text-lg',
  }
  
  const themeStyles = {
    movie: {
      primary: 'bg-movie-gradient text-white',
      secondary: 'bg-background-card border border-border hover:border-border-hover text-text-primary',
    },
    music: {
      primary: 'bg-music-gradient text-white',
      secondary: 'bg-background-card border border-border hover:border-border-hover text-text-primary',
    },
  }
  
  const hoverAnimation = theme === 'movie' ? buttonHover.whileHover : musicButtonHover.whileHover
  
  return (
    <motion.button
      className={cn(
        baseStyles,
        sizeStyles[size],
        themeStyles[theme][variant],
        className
      )}
      whileHover={hoverAnimation}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      {...props}
    >
      {children}
    </motion.button>
  )
}