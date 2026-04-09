import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link as LinkIcon,
  Plus,
  Headphones,
  Play,
  TrendingUp,
  Sparkles,
  Radio,
  Disc3,
  Search,
  Users,
  Heart,
  Clock,
  Flame,
  SkipForward,
  SkipBack,
  ListMusic,
  Mic2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import CreateRoomDialog from "@/components/CreateRoomDialog";
import JoinRoomDialog from "@/components/JoinRoomDialog";
import { toast } from "sonner";

const liveRooms = [
  {
    name: "Lo-Fi Chill Zone",
    host: "Jordan",
    listeners: 23,
    emoji: "🎧",
    genre: "Lo-Fi",
    id: "lofi-1",
    waveColor: "from-secondary to-[hsl(170,80%,50%)]",
    hostEmoji: "🧑‍🦱",
    nowPlaying: "Moonlight Sonata - Lo-Fi Mix",
    progress: 62,
    reactions: ["🔥", "💚", "✨"],
  },
  {
    name: "Rock Classics",
    host: "Mike",
    listeners: 11,
    emoji: "🎸",
    genre: "Rock",
    id: "rock-1",
    waveColor: "from-destructive to-accent",
    hostEmoji: "🧔",
    nowPlaying: "Bohemian Rhapsody - Queen",
    progress: 34,
    reactions: ["🤘", "🔥", "💥"],
  },
  {
    name: "K-Pop Party",
    host: "Sarah",
    listeners: 31,
    emoji: "💜",
    genre: "K-Pop",
    id: "kpop-1",
    waveColor: "from-accent to-primary",
    hostEmoji: "👩",
    nowPlaying: "Dynamite - BTS",
    progress: 78,
    reactions: ["💜", "😍", "🎤"],
  },
  {
    name: "Jazz & Soul",
    host: "Chris",
    listeners: 8,
    emoji: "🎷",
    genre: "Jazz",
    id: "jazz-1",
    waveColor: "from-[hsl(35,90%,58%)] to-[hsl(15,80%,50%)]",
    hostEmoji: "🧑‍💻",
    nowPlaying: "Blue in Green - Miles Davis",
    progress: 45,
    reactions: ["🎹", "🥂", "✨"],
  },
  {
    name: "EDM Rave Room",
    host: "Alex",
    listeners: 42,
    emoji: "🔊",
    genre: "EDM",
    id: "edm-1",
    waveColor: "from-primary to-accent",
    hostEmoji: "🧑",
    nowPlaying: "Levels - Avicii",
    progress: 88,
    reactions: ["🔥", "💫", "🎉"],
  },
];

const trendingPlaylists = [
  { name: "Focus Beats", tracks: 24, emoji: "🧠", color: "from-secondary to-[hsl(170,80%,50%)]", bg: "hsl(155 80% 45% / 0.06)" },
  { name: "Late Night Vibes", tracks: 18, emoji: "🌙", color: "from-accent to-primary", bg: "hsl(270 60% 60% / 0.06)" },
  { name: "Workout Mix", tracks: 32, emoji: "💪", color: "from-destructive to-accent", bg: "hsl(0 84% 60% / 0.06)" },
  { name: "Throwback Hits", tracks: 40, emoji: "📻", color: "from-primary to-[hsl(210,100%,60%)]", bg: "hsl(195 100% 50% / 0.06)" },
  { name: "Chill Acoustic", tracks: 15, emoji: "🎸", color: "from-[hsl(35,90%,58%)] to-secondary", bg: "hsl(43 76% 52% / 0.06)" },
  { name: "EDM Festival", tracks: 28, emoji: "🔊", color: "from-primary to-accent", bg: "hsl(230 80% 55% / 0.06)" },
];

const recentSessions = [
  { name: "Sunday Lo-Fi Stream", host: "Jordan", listeners: 12, emoji: "☕", genre: "Lo-Fi", id: "rec-1", time: "2h ago", tracks: 18 },
  { name: "Throwback Thursday", host: "You", listeners: 6, emoji: "📻", genre: "Retro", id: "rec-2", time: "1d ago", tracks: 24 },
  { name: "Acoustic Morning", host: "Emma", listeners: 4, emoji: "🎸", genre: "Acoustic", id: "rec-3", time: "2d ago", tracks: 12 },
];

const popularCommunities = [
  { name: "Lo-Fi Nation", members: 2340, emoji: "🎧", genre: "Lo-Fi", id: "com-1", online: 89, rating: 4.9 },
  { name: "Rock Republic", members: 1580, emoji: "🎸", genre: "Rock", id: "com-2", online: 45, rating: 4.7 },
  { name: "K-Pop Universe", members: 3100, emoji: "💜", genre: "K-Pop", id: "com-3", online: 156, rating: 4.8 },
];

const EqBars = ({ color = "bg-secondary" }) => (
  <div className="flex items-end gap-[2px] h-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className={`eq-bar ${color}`} />
    ))}
  </div>
);

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const item = {
  hidden: { opacity: 0, y: 20, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 200, damping: 20 } },
};

const MusicPage = () => {
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [hoveredRoom, setHoveredRoom] = useState(null);
  const [tab, setTab] = useState("live");
  const [searchQuery, setSearchQuery] = useState("");
  const [likedRooms, setLikedRooms] = useState(new Set());

  const handlePlaylistClick = (name) => {
    toast(`🎵 Starting "${name}" room...`, {
      description: "Creating a room with this playlist.",
    });
    setTimeout(() => {
      const roomId = name.toLowerCase().replace(/\s+/g, "-");
      navigate(`/music/room/${roomId}`);
    }, 800);
  };

  const toggleLike = (id) => {
    const wasLiked = likedRooms.has(id);
    setLikedRooms((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    toast(wasLiked ? "Removed from favorites" : "Added to favorites", { duration: 1500 });
  };

  const tabs = [
    { key: "live", label: "Live Now", icon: Flame, count: liveRooms.length },
    { key: "communities", label: "Communities", icon: Users, count: popularCommunities.length },
    { key: "recent", label: "Recent", icon: Clock, count: recentSessions.length },
  ];

  return (
    <>
      <main className="pb-12">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-3xl glass-panel p-8 md:p-12 mb-10"
          >
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0 w-[30%] h-[200%] bg-gradient-to-r from-transparent via-secondary/5 to-transparent animate-spotlight" />
            </div>

            <div className="relative z-10">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 text-xs font-medium text-secondary mb-5"
              >
                <Sparkles className="w-3 h-3" />
                Listen Together, Vibe Together
              </motion.div>

              <h1 className="font-display text-4xl md:text-6xl font-bold mb-4 leading-tight">
                <span className="text-gradient-music">Music</span>
              </h1>
              <p className="text-muted-foreground text-lg md:text-xl max-w-xl leading-relaxed">
                Listen together in real-time with collaborative playlists and voice chat.
              </p>

              <div className="flex items-center gap-6 mt-6 mb-8">
                {[
                  { label: "Live Sessions", value: liveRooms.length, icon: Flame },
                  {
                    label: "Listening",
                    value: `${liveRooms.reduce((a, r) => a + r.listeners, 0)}+`,
                    icon: Headphones,
                  },
                  { label: "Playlists", value: trendingPlaylists.length, icon: ListMusic },
                ].map((stat, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="flex items-center gap-2"
                  >
                    <stat.icon className="w-3.5 h-3.5 text-secondary" />
                    <span className="text-sm font-semibold text-foreground">{stat.value}</span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">{stat.label}</span>
                  </motion.div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <motion.button
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setCreateOpen(true)}
                  className="gradient-music text-secondary-foreground font-semibold px-6 py-3 rounded-xl flex items-center gap-2 text-sm shadow-lg shadow-secondary/20"
                >
                  <Plus className="w-4 h-4" />
                  Create Session
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

            <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden lg:block">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                className="w-32 h-32 rounded-full border-4 border-muted/30 flex items-center justify-center opacity-20"
              >
                <div className="w-20 h-20 rounded-full border-2 border-muted/20 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-secondary/30" />
                </div>
              </motion.div>
            </div>
          </motion.div>

          <div className="flex items-center gap-1 p-1 rounded-2xl bg-glass/50 backdrop-blur-sm border border-glass-border w-fit mb-4">
            {tabs.map((t) => (
              <motion.button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors duration-200 ${
                  tab === t.key ? "text-secondary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {tab === t.key && (
                  <motion.div
                    layoutId="musicTabBg"
                    className="absolute inset-0 gradient-music rounded-xl shadow-lg shadow-secondary/20"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      tab === t.key ? "bg-secondary-foreground/20" : "bg-muted"
                    }`}
                  >
                    {t.count}
                  </span>
                </span>
              </motion.button>
            ))}
          </div>

          <div className="relative mb-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search sessions, genres, artists..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md h-11 pl-11 pr-4 rounded-xl bg-glass/60 border-glass-border backdrop-blur-sm text-sm placeholder:text-muted-foreground focus:border-secondary/40 focus:ring-secondary/20"
            />
          </div>

          <AnimatePresence mode="wait">
            {tab === "live" && (
              <motion.div
                key="live"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
                  {liveRooms
                    .filter(
                      (r) =>
                        !searchQuery ||
                        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        r.genre.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((room) => (
                      <motion.div
                        key={room.id}
                        variants={item}
                        onMouseEnter={() => setHoveredRoom(room.id)}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={() => navigate(`/music/room/${room.id}`)}
                        className="glass-panel cursor-pointer group relative overflow-hidden"
                      >
                        <div className={`h-40 bg-gradient-to-br ${room.waveColor} relative flex items-center justify-center`}>
                          <span className="text-6xl opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-500">{room.emoji}</span>

                          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-secondary/90 backdrop-blur-sm px-2.5 py-1 rounded-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-secondary-foreground" />
                            <span className="text-[10px] font-bold text-secondary-foreground tracking-wider">LIVE</span>
                          </div>

                          <div className="absolute top-3 right-3 flex items-center">
                            <div className="flex -space-x-2">
                              {[room.hostEmoji, "👤", "👤"].map((e, i) => (
                                <div
                                  key={i}
                                  className="w-6 h-6 rounded-full bg-background/80 backdrop-blur-sm border border-background/50 flex items-center justify-center text-xs"
                                >
                                  {e}
                                </div>
                              ))}
                            </div>
                            <span className="ml-2 text-[10px] font-medium text-foreground/80 bg-background/40 backdrop-blur-sm px-1.5 py-0.5 rounded-full">+{room.listeners}</span>
                          </div>

                          <AnimatePresence>
                            {hoveredRoom === room.id && (
                              <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center gap-4"
                              >
                                <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }} className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center">
                                  <SkipBack className="w-4 h-4 text-foreground" />
                                </motion.div>
                                <motion.div
                                  initial={{ scale: 0.5 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0.5 }}
                                  transition={{ delay: 0.05 }}
                                  className="w-14 h-14 rounded-full gradient-music flex items-center justify-center shadow-lg shadow-secondary/30"
                                >
                                  <Play className="w-6 h-6 text-secondary-foreground ml-0.5" />
                                </motion.div>
                                <motion.div
                                  initial={{ scale: 0.5 }}
                                  animate={{ scale: 1 }}
                                  exit={{ scale: 0.5 }}
                                  transition={{ delay: 0.1 }}
                                  className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center"
                                >
                                  <SkipForward className="w-4 h-4 text-foreground" />
                                </motion.div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        <div className="p-4">
                          <div className="flex items-start justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-sm truncate group-hover:text-secondary transition-colors">{room.name}</h4>
                              <p className="text-xs text-muted-foreground">by {room.host} · {room.genre}</p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLike(room.id);
                              }}
                              className="flex-shrink-0 ml-2 mt-0.5"
                            >
                              <Heart
                                className={`w-4 h-4 transition-colors ${
                                  likedRooms.has(room.id)
                                    ? "text-destructive fill-destructive"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              />
                            </button>
                          </div>

                          <div className="mt-3 p-2.5 rounded-xl bg-muted/30 border border-glass-border">
                            <div className="flex items-center gap-2 mb-2">
                              <EqBars color="bg-secondary" />
                              <p className="text-[11px] text-foreground/80 truncate flex-1">{room.nowPlaying}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1 rounded-full bg-muted/50">
                                <motion.div
                                  className="h-full rounded-full gradient-music"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${room.progress}%` }}
                                  transition={{ delay: 0.3, duration: 1, ease: "easeOut" }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground">{room.progress}%</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Headphones className="w-3 h-3" /> {room.listeners} listening
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
                        </div>
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}

            {tab === "communities" && (
              <motion.div
                key="communities"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-14">
                  {popularCommunities
                    .filter((c) => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((comm) => (
                      <motion.div
                        key={comm.id}
                        variants={item}
                        onClick={() => toast(`🎵 Joining ${comm.name}...`, { description: "Opening community page." })}
                        className="glass-panel cursor-pointer group overflow-hidden"
                      >
                        <div className="p-5">
                          <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-secondary/20 to-accent/20 flex items-center justify-center text-3xl group-hover:scale-110 transition-transform duration-300">
                              {comm.emoji}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-foreground text-sm truncate group-hover:text-secondary transition-colors">{comm.name}</h4>
                              <p className="text-xs text-muted-foreground">{comm.genre}</p>
                            </div>
                            <div className="flex items-center gap-1 bg-secondary/10 px-2 py-1 rounded-lg">
                              <Mic2 className="w-3 h-3 text-secondary" />
                              <span className="text-xs font-semibold text-secondary">{comm.rating}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Users className="w-3 h-3" /> {comm.members.toLocaleString()}
                              </span>
                              <span className="text-xs text-secondary flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                                {comm.online} online
                              </span>
                            </div>
                            <motion.div
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              className="px-3 py-1.5 rounded-lg gradient-music text-secondary-foreground text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity"
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
                <motion.div variants={container} initial="hidden" animate="show" className="space-y-3 max-w-2xl mb-14">
                  {recentSessions
                    .filter((r) => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((session) => (
                      <motion.div
                        key={session.id}
                        variants={item}
                        onClick={() => navigate(`/music/room/${session.id}`)}
                        className="glass-panel p-4 flex items-center gap-4 cursor-pointer group"
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary/20 to-accent/20 flex items-center justify-center text-2xl flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                          {session.emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground text-sm truncate group-hover:text-secondary transition-colors">{session.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {session.host} · {session.genre} · {session.tracks} tracks
                          </p>
                        </div>
                        <span className="text-xs text-muted-foreground flex-shrink-0">{session.time}</span>
                        <div className="flex-shrink-0">
                          <div className="w-8 h-8 rounded-full gradient-music flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play className="w-3.5 h-3.5 text-secondary-foreground ml-0.5" />
                          </div>
                        </div>
                      </motion.div>
                    ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.section
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-50px" }}
            className="mb-14"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <TrendingUp className="w-4 h-4 text-secondary" />
              <h2 className="font-display text-xl font-bold text-foreground">Popular Playlists</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {trendingPlaylists.map((pl) => (
                <motion.div
                  key={pl.name}
                  variants={item}
                  whileHover={{ scale: 1.05, y: -4 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handlePlaylistClick(pl.name)}
                  className="glass-panel p-5 cursor-pointer group transition-all duration-300"
                  style={{ background: pl.bg }}
                >
                  <div
                    className={`w-12 h-12 rounded-xl bg-gradient-to-br ${pl.color} flex items-center justify-center mb-3 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}
                  >
                    <span className="text-xl">{pl.emoji}</span>
                  </div>
                  <p className="text-sm font-bold text-foreground mb-0.5">{pl.name}</p>
                  <p className="text-[11px] text-muted-foreground">{pl.tracks} tracks</p>
                </motion.div>
              ))}
            </div>
          </motion.section>

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
                { step: "01", title: "Create a Room", desc: "Pick a vibe and set the mood", icon: Radio },
                { step: "02", title: "Add Music", desc: "Build a queue collaboratively", icon: Disc3 },
                { step: "03", title: "Listen Together", desc: "Perfectly synced with voice chat", icon: Headphones },
              ].map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.15 }}
                  className="glass-panel p-6 group hover:border-secondary/20 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-3xl font-display font-bold text-gradient-music opacity-40">{s.step}</span>
                    <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center group-hover:bg-secondary/20 transition-colors">
                      <s.icon className="w-5 h-5 text-secondary" />
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

      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} type="music" />
      <JoinRoomDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
};

export default MusicPage;