import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import Navbar from '@/components/navigation/Navbar'
import MobileNav from '@/components/navigation/MobileNav'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { getSocket } from '@/services/socket'
import api from '@/services/api'
import { isApiAuthReady } from '@/services/useApiAuth'
import { toast } from 'sonner'

export function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const { isAuthenticated, clerkLoaded, sessionLoaded, clerkUser } = useAuth()
  const isLanding = location.pathname === '/'
  const isDiscoveryPage = location.pathname === '/movies' || location.pathname === '/music'
  const isProfilePage = location.pathname === '/profile' || location.pathname.startsWith('/profile/')
  const profileDirection =
    location.state?.profileNavDirection || (navigationType === 'POP' ? 'back' : 'forward')
  // Hide navbar when in a room (movie room or music room)
  const isInRoom = /^\/room\/[^/]+$/i.test(location.pathname) || /^\/music\/room\/[^/]+$/i.test(location.pathname)
  const seenMessageIdsRef = useRef(new Set())
  const [unreadDmCount, setUnreadDmCount] = useState(0)

  const refreshUnreadDmCount = useCallback(async () => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) {
      setUnreadDmCount(0)
      return
    }

    // Wait for auth interceptor to be attached
    if (!isApiAuthReady()) return

    try {
      const res = await api.get('/dm/conversations')
      const conversations = res?.data?.data?.conversations || []
      const unread = conversations.reduce((sum, c) => sum + Number(c?.unread_count || 0), 0)
      setUnreadDmCount(unread)
    } catch {
      // Keep current value on transient failures.
    }
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id])

  useEffect(() => {
    refreshUnreadDmCount()
  }, [refreshUnreadDmCount, location.pathname])

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return

    const socket = getSocket()
    const onDmNew = ({ message }) => {
      if (!message?.id) return
      if (message.own) return

      if (seenMessageIdsRef.current.has(message.id)) return
      seenMessageIdsRef.current.add(message.id)

      const onMessagesPage = location.pathname.startsWith('/messages')
      if (onMessagesPage) {
        refreshUnreadDmCount()
        return
      }

      setUnreadDmCount((prev) => prev + 1)

      const senderName = String(message.sender_name || message.sender_display_name || 'New message')
      const avatarUrl = String(message.sender_avatar_url || '')
      const messageText = String(message.text || '').slice(0, 120)

      toast(senderName, {
        description: messageText,
        duration: 2000,
        icon: avatarUrl ? (
          <img src={avatarUrl} alt={senderName} className='h-8 w-8 rounded-full object-cover' />
        ) : (
          <span className='inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground'>
            {senderName.slice(0, 1).toUpperCase()}
          </span>
        ),
        action: {
          label: 'Open',
          onClick: () => navigate(`/messages?partner=${message.sender_id}`),
        },
      })
    }

    socket.on('dm:new', onDmNew)
    return () => {
      socket.off('dm:new', onDmNew)
    }
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, location.pathname, navigate, refreshUnreadDmCount])

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return

    const intervalId = window.setInterval(() => {
      refreshUnreadDmCount()
    }, 10000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, refreshUnreadDmCount])

  return (
    <div className={cn('bg-background w-full overflow-x-hidden', isInRoom ? 'h-screen overflow-hidden' : 'min-h-screen')}>
      {!isInRoom && <Navbar unreadDmCount={unreadDmCount} />}
      
      <main
        className={cn(
          'transition-all duration-300 w-full overflow-x-hidden',
          isInRoom ? 'h-full overflow-hidden' : 'pb-24 md:pb-12',
          !isInRoom && 'pt-16 md:pt-20',
          isLanding && 'pt-0 md:pt-0'
        )}
      >
        {isDiscoveryPage || isProfilePage ? (
          <LayoutGroup id='app-route-transitions'>
            <AnimatePresence mode='wait' initial={false}>
              <motion.div
                key={location.pathname}
                initial={
                  isProfilePage
                    ? {
                        opacity: 0,
                        x: profileDirection === 'back' ? -22 : 22,
                        filter: 'blur(4px)',
                      }
                    : { opacity: 0, y: 16, filter: 'blur(6px)' }
                }
                animate={{ opacity: 1, x: 0, y: 0, filter: 'blur(0px)' }}
                exit={
                  isProfilePage
                    ? {
                        opacity: 0,
                        x: profileDirection === 'back' ? 16 : -16,
                        filter: 'blur(3px)',
                      }
                    : { opacity: 0, y: -10, filter: 'blur(4px)' }
                }
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </LayoutGroup>
        ) : (
          <Outlet />
        )}
      </main>
      
      {!isInRoom && <MobileNav unreadDmCount={unreadDmCount} />}
    </div>
  )
}