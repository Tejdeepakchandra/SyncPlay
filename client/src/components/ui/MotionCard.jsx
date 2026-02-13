import { motion } from 'framer-motion'
import { cardHover, musicCardHover } from '@/lib/animations'
import { cn } from '@/lib/utils'

export function MotionCard({ 
  theme = 'movie',
  className,
  children,
  ...props 
}) {
  
  const hoverAnimation = theme === 'movie' 
    ? cardHover.whileHover 
    : musicCardHover.whileHover
  
  return (
    <motion.div
      className={cn(
        'bg-background-card border border-border-subtle rounded-xl overflow-hidden',
        className
      )}
      whileHover={hoverAnimation}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      {...props}
    >
      {children}
    </motion.div>
  )
}