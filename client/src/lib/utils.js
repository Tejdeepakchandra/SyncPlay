import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

/**
 * Format seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00'
  
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

/**
 * Generate unique room code
 */
export function generateRoomCode(prefix = 'WATCH') {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `${prefix}-${code}`
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * Validate YouTube URL
 */
export function isValidYouTubeUrl(url) {
  const pattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/
  return pattern.test(url)
}

/**
 * Extract YouTube Video ID
 */
export function getYouTubeVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/
  const match = url.match(regExp)
  return (match && match[2].length === 11) ? match[2] : null
}

/**
 * Truncate text
 */
export function truncate(str, length = 50) {
  if (!str) return ''
  if (str.length <= length) return str
  return str.slice(0, length) + '...'
}

/**
 * Get random avatar color (for guests)
 */
export function getAvatarColor(username) {
  const colors = [
    '#2563EB', '#16A34A', '#D4AF37', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#F59E0B', '#6366F1', '#14B8A6'
  ]
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}