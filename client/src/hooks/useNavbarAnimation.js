import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export function useNavbarAnimation() {
  const [isVisible, setIsVisible] = useState(true)
  const [currentTheme, setCurrentTheme] = useState('default')
  const location = useLocation()
  const navigationTimerRef = useRef(null)
  const isNavigatingRef = useRef(false)

  // Cleanup function
  const cleanup = () => {
    if (navigationTimerRef.current) {
      clearTimeout(navigationTimerRef.current)
      navigationTimerRef.current = null
    }
  }

  const navigateWithAnimation = (navigate, to) => {
    // Don't navigate if already on that page or already navigating
    if (location.pathname === to || isNavigatingRef.current) return

    // Cleanup any pending navigation
    cleanup()
    
    // Set navigating flag
    isNavigatingRef.current = true

    // Hide navbar
    setIsVisible(false)

    // Wait for navbar to hide, then navigate
    navigationTimerRef.current = setTimeout(() => {
      // Force navigation
      navigate(to)
      
      // Show navbar after navigation (guaranteed delay)
      navigationTimerRef.current = setTimeout(() => {
        setIsVisible(true)
        isNavigatingRef.current = false
        navigationTimerRef.current = null
      }, 150) // Increased delay to ensure page load
    }, 150)
  }

  // Determine theme from path
  useEffect(() => {
    if (location.pathname.includes('/movies')) {
      setCurrentTheme('movie')
    } else if (location.pathname.includes('/music')) {
      setCurrentTheme('music')
    } else if (location.pathname.includes('/friends')) {
      setCurrentTheme('friends')
    } else {
      setCurrentTheme('default')
    }
    
    // Log for debugging
    console.log('Theme updated:', location.pathname, currentTheme)
  }, [location.pathname]) // Use pathname instead of whole location

  // Cleanup on unmount
  useEffect(() => {
    return cleanup
  }, [])

  return { isVisible, currentTheme, navigateWithAnimation }
}