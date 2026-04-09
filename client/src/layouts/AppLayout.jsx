import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '@/components/navigation/Navbar'
import MobileNav from '@/components/navigation/MobileNav'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const location = useLocation()
  const isLanding = location.pathname === '/'
  // Hide navbar when in a room (movie room or music room)
  const isInRoom = location.pathname.includes('/room/') || location.pathname.includes('/music/room/')

  return (
    <div className={cn('bg-background', isInRoom ? 'h-screen overflow-hidden' : 'min-h-screen')}>
      {!isInRoom && <Navbar />}
      
      <main
        className={cn(
          'transition-all duration-300',
          isInRoom ? 'h-full overflow-hidden' : 'pb-24 md:pb-12',
          !isInRoom && 'pt-16 md:pt-20',
          isLanding && 'pt-0 md:pt-0'
        )}
      >
        <Outlet />
      </main>
      
      {!isInRoom && <MobileNav />}
    </div>
  )
}