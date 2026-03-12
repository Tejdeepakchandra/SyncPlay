import { useState, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  Film, Link as LinkIcon, Plus, Users, Clock, TrendingUp, Play, Star,
  ChevronRight, Sparkles, Search, Grid3X3, Eye,
  Flame, Heart
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";

import CreateRoomDialog from "@/components/CreateRoomDialog";
import JoinRoomDialog from "@/components/JoinRoomDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Mock data (replace with real API calls)
const recentRooms = [
  { name: "Friday Movie Night", host: "Alex", viewers: 4, genre: "Action", time: "2h ago", emoji: "🎬", id: "recent-1", rating: 4.8 },
  { name: "Horror Marathon", host: "Sarah", viewers: 6, genre: "Horror", time: "5h ago", emoji: "👻", id: "recent-2", rating: 4.5 },
  { name: "Studio Ghibli Night", host: "You", viewers: 3, genre: "Animation", time: "1d ago", emoji: "🌸", id: "recent-3", rating: 4.9 },
];

const trendingGenres = [
  { name: "Action", emoji: "💥", rooms: 24, color: "from-primary to-[hsl(210,100%,60%)]", bg: "hsl(195 100% 50% / 0.08)" },
  { name: "Comedy", emoji: "😂", rooms: 18, color: "from-secondary to-[hsl(170,80%,50%)]", bg: "hsl(155 80% 45% / 0.08)" },
  { name: "Horror", emoji: "👻", rooms: 12, color: "from-accent to-[hsl(290,60%,60%)]", bg: "hsl(270 60% 60% / 0.08)" },
  { name: "Sci-Fi", emoji: "🚀", rooms: 15, color: "from-[hsl(195,100%,50%)] to-[hsl(240,80%,60%)]", bg: "hsl(220 80% 55% / 0.08)" },
  { name: "Romance", emoji: "💕", rooms: 9, color: "from-[hsl(340,80%,55%)] to-accent", bg: "hsl(340 80% 55% / 0.08)" },
  { name: "Anime", emoji: "⚔️", rooms: 21, color: "from-primary to-accent", bg: "hsl(230 80% 55% / 0.08)" },
];

const liveRooms = [
  { name: "Avengers Watch Party", host: "Jordan", viewers: 12, emoji: "🦸", genre: "Action", isLive: true, id: "live-0", progress: 45, hostEmoji: "🧑‍🦱", reactions: ["🔥", "😍", "💯"] },
  { name: "Anime Chill Zone", host: "Mike", viewers: 8, emoji: "⚔️", genre: "Anime", isLive: true, id: "live-1", progress: 72, hostEmoji: "🧔", reactions: ["❤️", "🎌", "✨"] },
  { name: "Classic Cinema Club", host: "Emma", viewers: 5, emoji: "🎞️", genre: "Classic", isLive: true, id: "live-2", progress: 23, hostEmoji: "👧", reactions: ["👏", "🍿", "🎬"] },
];

const popularRooms = [
  { name: "Sci-Fi Sundays", host: "Community", viewers: 32, emoji: "🚀", genre: "Sci-Fi", id: "pop-1", rating: 4.9, members: 156 },
  { name: "Indie Film Club", host: "Community", viewers: 14, emoji: "🎥", genre: "Indie", id: "pop-2", rating: 4.7, members: 89 },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 }
  }
};

const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 200, damping: 20 } }
};

const Movies = () => {
  const navigate = useNavigate();
  const { user: _user } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [hoveredLive, setHoveredLive] = useState(null);
  const [tab, setTab] = useState("live");
  const [searchQuery, setSearchQuery] = useState("");
  const [likedRooms, setLikedRooms] = useState(new Set());
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);

  const handleGenreClick = (genre) => {
    toast(`🎬 Browsing ${genre} rooms...`, { description: `Showing ${genre} movie rooms.`, duration: 2000 });
  };

  const toggleLike = (id) => {
    setLikedRooms(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const tabs = [
    { key: "live", label: "Live Now", icon: Flame, count: liveRooms.length },
    { key: "popular", label: "Popular", icon: TrendingUp, count: popularRooms.length },
    { key: "recent", label: "Recent", icon: Clock, count: recentRooms.length },
  ];

  return (
    <>
      <main className="pb-12">
        <div className="container mx-auto px-4 lg:px-8">

          {/* Hero Section */}
          <motion.div ref={heroRef} style={{ opacity: heroOpacity, scale: heroScale }} className="mb-10">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="relative overflow-hidden rounded-3xl glass-panel p-8 md:p-12"
            >
              {/* Spotlight effect */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute inset-0 w-[30%] h-[200%] bg-gradient-to-r from-transparent via-primary/5 to-transparent animate-spotlight" />
              </div>

              <div className="relative z-10">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary mb-5"
                >
                  <Sparkles className="w-3 h-3" />
                  Watch Together, Feel Together
                </motion.div>
                <h1 className="font-display text-4xl md:text-6xl font-bold mb-4 leading-tight">
                  <span className="text-gradient-movie">Movies</span>
                </h1>
                <p className="text-muted-foreground text-lg md:text-xl max-w-xl leading-relaxed">
                  Create a theatre-like room or join one with friends. Watch anything together in perfect sync.
                </p>

                {/* Stats */}
                <div className="flex items-center gap-6 mt-6 mb-8">
                  {[
                    { label: "Live Rooms", value: liveRooms.length, icon: Flame },
                    { label: "Watching", value: "52+", icon: Eye },
                    { label: "Genres", value: trendingGenres.length, icon: Grid3X3 },
                  ].map((stat, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 + i * 0.1 }}
                      className="flex items-center gap-2"
                    >
                      <stat.icon className="w-3.5 h-3.5 text-primary" />
                      <span className="text-sm font-semibold text-foreground">{stat.value}</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">{stat.label}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Action buttons */}
                <div className="flex flex-wrap gap-3">
                  <motion.button
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setCreateOpen(true)}
                    className="gradient-movie text-primary-foreground font-semibold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-primary/20"
                  >
                    <Plus className="w-4 h-4" />
                    Create Room
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.03, y: -2 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setJoinOpen(true)}
                    className="glass-panel px-6 py-3 rounded-xl flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Join with Link
                  </motion.button>
                </div>
              </div>

              {/* Decorative emojis */}
              <div className="absolute right-8 top-8 hidden lg:block">
                <motion.div animate={{ y: [0, -12, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="text-6xl opacity-20">🎬</motion.div>
              </div>
              <div className="absolute right-28 bottom-6 hidden lg:block">
                <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }} className="text-4xl opacity-15">🍿</motion.div>
              </div>
            </motion.div>
          </motion.div>

          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-glass/50 backdrop-blur-sm border border-glass-border w-fit mb-4">
            {tabs.map((t) => (
              <motion.button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
                  tab === t.key ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {tab === t.key && (
                  <motion.div
                    layoutId="movieTabBg"
                    className="absolute inset-0 gradient-movie rounded-xl shadow-lg shadow-primary/20"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  {t.count != null && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      tab === t.key ? "bg-primary-foreground/20" : "bg-muted"
                    }`}>
                      {t.count}
                    </span>
                  )}
                </span>
              </motion.button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search rooms, genres, hosts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md h-11 pl-11 pr-4 rounded-xl bg-glass/60 border-glass-border backdrop-blur-sm text-sm placeholder:text-muted-foreground focus:border-primary/40 focus:ring-primary/20"
            />
          </div>

          {/* Tab Content */}
          <AnimatePresence mode="wait">
            {tab === "live" && (
              <motion.div
                key="live"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14"
                >
                  {liveRooms
                    .filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.genre.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((room) => (
                      <motion.div
                        key={room.id}
                        variants={item}
                        onMouseEnter={() => setHoveredLive(room.id)}
                        onMouseLeave={() => setHoveredLive(null)}
                        onClick={() => navigate(`/room/${room.id}`)}
                        className="glass-panel cursor-pointer group relative overflow-hidden"
                      >
                        {/* Card top */}
                        <div className={`h-44 bg-gradient-to-br ${
                          trendingGenres.find(g => g.name === room.genre)?.color || 'from-primary to-accent'
                        } relative flex items-center justify-center`}>
                          <span className="text-7xl opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-500">{room.emoji}</span>
                          
                          {/* LIVE badge */}
                          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-destructive/90 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-destructive-foreground" />
                            <span className="text-[10px] font-bold text-destructive-foreground tracking-wider">LIVE</span>
                          </div>

                          {/* Viewer avatars */}
                          <div className="absolute top-3 right-3 flex items-center">
                            <div className="flex -space-x-2">
                              {[room.hostEmoji, "👤", "👤"].map((e, i) => (
                                <div key={i} className="w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm border border-background/50 flex items-center justify-center text-xs">
                                  {e}
                                </div>
                              ))}
                            </div>
                            <span className="ml-2 text-[10px] font-medium text-foreground/80 bg-background/40 backdrop-blur-sm px-1.5 py-0.5 rounded-full">+{room.viewers}</span>
                          </div>

                          {/* Progress bar */}
                          <div className="absolute bottom-0 left-0 right-0 h-1 bg-background/30">
                            <motion.div
                              className="h-full bg-primary"
                              initial={{ width: 0 }}
                              animate={{ width: `${room.progress}%` }}
                              transition={{ delay: 0.3, duration: 1, ease: "easeOut" }}
                            />
                          </div>

                          {/* Hover overlay */}
                          <AnimatePresence>
                            {hoveredLive === room.id && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center"
                              >
                                <motion.div
                                  initial={{ scale: 0.5 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0.5 }}
                                  className="w-14 h-14 rounded-full gradient-movie flex items-center justify-center shadow-lg shadow-primary/30"
                                >
                                  <Play className="w-6 h-6 text-primary-foreground ml-0.5" />
                                </motion.div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Card bottom */}
                        <div className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-sm mb-0.5 truncate group-hover:text-primary transition-colors">{room.name}</h4>
                              <p className="text-xs text-muted-foreground">by {room.host} · {room.genre}</p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleLike(room.id); }}
                              className="flex-shrink-0 ml-2"
                            >
                              <Heart className={`w-4 h-4 transition-colors ${
                                likedRooms.has(room.id) ? "text-destructive fill-destructive" : "text-muted-foreground hover:text-foreground"
                              }`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Users className="w-3 h-3" /> {room.viewers} watching
                            </span>
                            <div className="flex items-center gap-1">
                              {room.reactions.map((r, i) => (
                                <motion.span
                                  key={i}
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ delay: 0.5 + i * 0.1 }}
                                  className="text-xs"
                                >
                                  {r}
                                </motion.span>
                              ))}
                            </div>
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-muted/50">
                              <div className="h-full rounded-full gradient-movie" style={{ width: `${room.progress}%` }} />
                            </div>
                            <span className="text-[10px] text-muted-foreground">{room.progress}%</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}

            {tab === "popular" && (
              <motion.div
                key="popular"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14"
                >
                  {popularRooms
                    .filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((room) => (
                      <motion.div
                        key={room.id}
                        variants={item}
                        onClick={() => navigate(`/room/${room.id}`)}
                        className="glass-panel cursor-pointer group overflow-hidden"
                      >
                        <div className="p-5">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
                              {room.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">{room.name}</h4>
                              <p className="text-xs text-muted-foreground">{room.genre} · {room.host}</p>
                            </div>
                            <div className="flex items-center gap-1 bg-primary/10 px-2 py-1 rounded-lg">
                              <Star className="w-3 h-3 text-primary fill-primary" />
                              <span className="text-xs font-semibold text-primary">{room.rating}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="w-3 h-3" /> {room.viewers} live
                              </span>
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Heart className="w-3 h-3" /> {room.members}
                              </span>
                            </div>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-3 py-1.5 rounded-lg gradient-movie text-primary-foreground text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              Join
                            </motion.div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}

            {tab === "recent" && (
              <motion.div
                key="recent"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div
                  variants={container}
                  initial="hidden"
                  animate="show"
                  className="space-y-3 max-w-2xl mb-14"
                >
                  {recentRooms
                    .filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((room) => (
                      <motion.div
                        key={room.name}
                        variants={item}
                        onClick={() => navigate(`/room/${room.id}`)}
                        className="glass-panel p-4 flex items-center gap-4 cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                          {room.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">{room.name}</p>
                            <div className="flex items-center gap-0.5">
                              <Star className="w-3 h-3 text-primary fill-primary" />
                              <span className="text-[10px] text-primary font-medium">{room.rating}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {room.host} · {room.genre} · {room.viewers} viewers
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{room.time}</span>
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full gradient-movie flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-3.5 h-3.5 text-primary-foreground ml-0.5" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Trending Genres */}
          <motion.section
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            className="mb-14"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <TrendingUp className="w-4 h-4 text-primary" />
              <h2 className="font-display text-xl font-bold text-foreground">Trending Genres</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {trendingGenres.map((genre) => (
                <motion.div
                  key={genre.name}
                  variants={item}
                  whileHover={{ scale: 1.05, y: -4 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleGenreClick(genre.name)}
                  className="glass-panel p-5 cursor-pointer text-center group transition-all duration-300"
                  style={{ background: genre.bg }}
                >
                  <motion.span
                    className="text-3xl block mb-3"
                    whileHover={{ scale: 1.2, rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.4 }}
                  >
                    {genre.emoji}
                  </motion.span>
                  <p className="text-sm font-bold text-foreground mb-0.5">{genre.name}</p>
                  <p className="text-[11px] text-muted-foreground">{genre.rooms} rooms</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* How it Works */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl"
          >
            <h3 className="font-display text-xl font-bold text-foreground mb-8">How it works</h3>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                { step: "01", title: "Create a Room", desc: "Name it, set privacy & choose a vibe", icon: Plus },
                { step: "02", title: "Invite Friends", desc: "Share a link — no sign-up needed", icon: Users },
                { step: "03", title: "Watch Together", desc: "Perfectly synced with live chat", icon: Play },
              ].map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="glass-panel p-6 group hover:border-primary/20 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl font-display font-bold text-gradient-movie opacity-40">{s.step}</span>
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <s.icon className="w-5 h-5 text-primary" />
                    </div>
                  </div>
                  <p className="font-semibold text-foreground text-sm mb-1">{s.title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </main>
      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} type="movie" />
      <JoinRoomDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
};

export default Movies;