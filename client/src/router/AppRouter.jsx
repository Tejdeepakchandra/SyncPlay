import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";

// Page imports
import Index from "@/pages/Index";
import Movies from "@/pages/Movies";
import MovieRoom from "@/pages/MovieRoom";
import MusicPage from "@/pages/Music";
import MusicRoom from "@/pages/MusicRoom";
import Friends from "@/pages/Friends";
import Profile from "@/pages/Profile";
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
        <Route path="/room/:roomId" element={<MovieRoom />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/music/room/:roomId" element={<MusicRoom />} />
        <Route path="/friends" element={<Friends />} />

        {/* Protected routes - require authentication */}
        <Route path="/profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}