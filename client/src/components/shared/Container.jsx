import { cn } from '@/lib/utils'

export function Container({ children, className, ...props }) {
  return (
    <div
      className={cn(
        'w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}