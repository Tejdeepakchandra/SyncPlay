import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { LandingPage } from '@/pages/LandingPage'
import { MoviePage } from '@/pages/MoviePage'
import { MusicPage } from '@/pages/MusicPage'
import { FriendsPage } from '@/pages/FriendsPage'
import { NotFound } from '@/pages/NotFound'

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<LandingPage />} />
        <Route path="/movie" element={<MoviePage />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/friends" element={<FriendsPage />} />
      </Route>
      
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}