import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Navbar } from '@/components/navigation/Navbar'
import { MobileNav } from '@/components/navigation/MobileNav'
import { cn } from '@/lib/utils'

export function AppLayout() {
  const location = useLocation()
  const isLanding = location.pathname === '/'

  return (
    <div className="min-h-screen bg-background bg-cinematic">
      <Navbar />
      
      <main
        className={cn(
          'transition-all duration-300 w-full',
          'pt-16 md:pt-20',
          'pb-24 md:pb-12',
          isLanding && 'pt-0 md:pt-0'
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
            className="w-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      
      <MobileNav />
    </div>
  )
}