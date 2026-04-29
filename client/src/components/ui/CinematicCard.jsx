import { Card } from './card'
import { cn } from '@/lib/utils'

export function CinematicCard({ 
  theme = 'movie',
  className,
  children,
  ...props 
}) {
  return (
    <Card
      className={cn(
        'bg-elevated border-border overflow-hidden',
        theme === 'movie' && 'hover:shadow-movie-glow',
        theme === 'music' && 'hover:shadow-music-glow',
        'transition-all duration-300 hover:scale-[1.02]',
        className
      )}
      {...props}
    >
      {children}
    </Card>
  )
}