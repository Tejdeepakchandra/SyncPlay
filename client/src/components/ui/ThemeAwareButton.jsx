import { Button } from './button'
import { cn } from '@/lib/utils'

export function ThemeAwareButton({ 
  variant = 'default', 
  size = 'default',
  theme = 'movie',
  className,
  children,
  ...props 
}) {
  const themeStyles = {
    movie: 'bg-movie hover:bg-movie-hover text-white',
    music: 'bg-music hover:bg-music-hover text-white',
    friends: 'bg-friends hover:bg-friends-hover text-background',
  }

  return (
    <Button
      className={cn(
        variant === 'default' && themeStyles[theme],
        'transition-all duration-200 hover:scale-105',
        className
      )}
      size={size}
      {...props}
    >
      {children}
    </Button>
  )
}