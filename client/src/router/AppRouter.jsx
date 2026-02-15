import { Routes, Route } from "react-router-dom";
import { AppLayout } from "@/layouts/AppLayout";

// Page imports
import Index from "@/pages/Index";
import Movies from "@/pages/Movies";
import MovieRoom from "@/pages/MovieRoom";
import MusicPage from "@/pages/Music";
import MusicRoom from "@/pages/MusicRoom";
import Friends from "@/pages/Friends";
import NotFound from "@/pages/NotFound";

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Index />} />
        <Route path="/movies" element={<Movies />} />
        <Route path="/room/:roomId" element={<MovieRoom />} />
        <Route path="/music" element={<MusicPage />} />
        <Route path="/music/room/:roomId" element={<MusicRoom />} />
        <Route path="/friends" element={<Friends />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}