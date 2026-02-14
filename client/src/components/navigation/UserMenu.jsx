import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@clerk/clerk-react'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const { isSignedIn, user, signOut } = useAuth()
  const [isOpen, setIsOpen] = useState(false)

  if (!isSignedIn) {
    return (
      <div className="flex items-center space-x-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            'px-4 py-2 rounded-xl transition-all duration-200',
            'text-secondary opacity-70 hover:opacity-100',
            'hover:bg-surface/50 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]'
          )}
        >
          Sign In
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="px-4 py-2 bg-movie text-white rounded-xl hover:bg-movie-hover transition-all duration-200 shadow-lg hover:shadow-movie-glow"
        >
          Sign Up
        </motion.button>
      </div>
    )
  }

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <img
          src={user?.imageUrl || '/default-avatar.png'}
          alt="Profile"
          className="w-10 h-10 rounded-xl border-2 border-transparent hover:border-movie transition-all duration-200"
        />
        {/* Online indicator */}
        <span className="absolute bottom-0 right-0 w-3 h-3 bg-success border-2 border-surface rounded-full" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-48 glass border border-border rounded-xl shadow-xl overflow-hidden"
          >
            <div className="p-2">
              <Link 
                to="/profile" 
                className="block px-4 py-2 text-sm hover:bg-surface rounded-lg transition"
                onClick={() => setIsOpen(false)}
              >
                Profile
              </Link>
              <Link 
                to="/settings" 
                className="block px-4 py-2 text-sm hover:bg-surface rounded-lg transition"
                onClick={() => setIsOpen(false)}
              >
                Settings
              </Link>
              <hr className="my-2 border-border" />
              <button
                onClick={() => {
                  signOut()
                  setIsOpen(false)
                }}
                className="w-full text-left px-4 py-2 text-sm text-error hover:bg-surface rounded-lg transition"
              >
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}