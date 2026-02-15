import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '@/components/navigation/Navbar'
import MobileNav from '@/components/navigation/MobileNav'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const location = useLocation()
  const isLanding = location.pathname === '/'

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main
        className={cn(
          'transition-all duration-300',
          'pt-16 md:pt-20',
          'pb-24 md:pb-12',
          isLanding && 'pt-0 md:pt-0'
        )}
      >
        <Outlet />
      </main>
      
      <MobileNav />
    </div>
  )
}