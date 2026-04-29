import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";

// Page imports
import Index from "@/pages/Index";
import Movies from "@/pages/Movies";
import MovieRoom from "@/pages/MovieRoom";
import MusicPage from "@/pages/Music";
import MusicRoom from "@/pages/MusicRoom";
import Friends from "@/pages/Friends";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import ProfileActivity from "@/pages/ProfileActivity";
import ProfileAchievements from "@/pages/ProfileAchievements";
import ProfileFavorites from "@/pages/ProfileFavorites";
import ProfileRoomDetails from "@/pages/ProfileRoomDetails";
import ProfileMomentsPage from "@/pages/ProfileMoments";
import SignIn from "@/pages/SignIn";
import SignUp from "@/pages/Signup";
import NotFound from "@/pages/NotFound";

export function AppRouter() {
  return (
    <Routes>
      {/* Auth pages - OUTSIDE AppLayout to avoid interference with Clerk UI */}
      <Route path="/sign-in/*" element={<SignIn />} />
      <Route path="/sign-up/*" element={<SignUp />} />
      
      {/* App pages - INSIDE AppLayout */}
      <Route element={<AppLayout />}>
        {/* Public routes */}
        <Route path="/" element={<Index />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/room/:roomCode" element={<MovieRoom />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/music/room/:roomCode" element={<MusicRoom />} />
        <Route path="/friends" element={<Friends />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/friend" element={<Navigate to="/friends" replace />} />
        <Route path="/Friends" element={<Navigate to="/friends" replace />} />

        {/* Protected routes - require authentication */}
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/activity" element={<ProfileActivity />} />
        <Route path="/profile/achievements" element={<ProfileAchievements />} />
        <Route path="/profile/favorites" element={<ProfileFavorites />} />
        <Route path="/profile/moments" element={<ProfileMomentsPage />} />
        <Route path="/profile/room/:roomCode" element={<ProfileRoomDetails />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}