import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'

export function useNavbarAnimation() {
  const [isVisible, setIsVisible] = useState(true)
  const [isAnimating, setIsAnimating] = useState(false)
  const [currentTheme, setCurrentTheme] = useState('default')
  const location = useLocation()

  const navigateWithAnimation = useCallback((newTheme) => {
    setIsAnimating(true)
    setIsVisible(false)
    setCurrentTheme(newTheme)

    // Wait for navbar to hide
    setTimeout(() => {
      // Page blink effect
      document.body.classList.add('page-blink')
      
      setTimeout(() => {
        document.body.classList.remove('page-blink')
        
        // Show navbar with new theme
        setIsVisible(true)
        
        setTimeout(() => {
          setIsAnimating(false)
        }, 800) // Match navbar show animation
      }, 300) // Blink duration
    }, 800) // Match navbar hide animation
  }, [])

  // Determine theme from path
  useEffect(() => {
    if (location.pathname.includes('/movie')) setCurrentTheme('movie')
    else if (location.pathname.includes('/music')) setCurrentTheme('music')
    else if (location.pathname.includes('/friends')) setCurrentTheme('friends')
    else setCurrentTheme('default')
  }, [location])

  return { isVisible, isAnimating, currentTheme, navigateWithAnimation }
}