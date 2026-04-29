export const navItems = [
  {
    path: '/movie',
    label: 'Movies',
    icon: '🎬',
    theme: 'movie'
  },
  {
    path: '/music',
    label: 'Music',
    icon: '🎵',
    theme: 'music'
  },
  {
    path: '/friends',
    label: 'Friends',
    icon: '👥',
    theme: 'friends'
  }
]

export const routeThemeMap = {
  '/movie': 'movie',
  '/music': 'music',
  '/friends': 'friends',
  '/': 'default'
}

export const getThemeFromPath = (pathname) => {
  if (pathname.includes('/movie')) return 'movie'
  if (pathname.includes('/music')) return 'music'
  if (pathname.includes('/friends')) return 'friends'
  return 'default'
}