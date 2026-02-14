import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export function Logo() {
  return (
    <Link to="/" className="relative group">
      <motion.div 
        className="flex items-center space-x-2"
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      >
        {/* Transparent PNG Logo - Replace with your actual logo */}
        <img 
          src="/logos/syncplay-logo.png" 
          alt="SyncPlay" 
          className="h-8 w-auto opacity-90 group-hover:opacity-100 transition-opacity"
          onError={(e) => {
            // Fallback if image doesn't exist
            e.target.style.display = 'none'
            e.target.nextSibling.style.display = 'block'
          }}
        />
        {/* Text fallback */}
        <span className="hidden text-2xl font-bold bg-gradient-to-r from-movie to-music bg-clip-text text-transparent">
          SyncPlay
        </span>
      </motion.div>
    </Link>
  )
}