import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export function NotificationBell() {
  const [hasNotifications, setHasNotifications] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative p-2 rounded-xl transition-all duration-200',
          'text-secondary opacity-70 hover:opacity-100',
          'hover:bg-surface/50 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]',
          isOpen && 'bg-surface opacity-100'
        )}
      >
        {/* Bell Icon */}
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
          />
        </svg>

        {/* Notification Badge */}
        {hasNotifications && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute top-1 right-1 w-2 h-2 bg-error rounded-full"
          />
        )}
      </motion.button>

      {/* Dropdown Panel (optional) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-64 glass border border-border rounded-xl shadow-xl overflow-hidden"
          >
            <div className="p-4">
              <h3 className="text-sm font-semibold mb-2">Notifications</h3>
              <p className="text-xs text-secondary">No new notifications</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}