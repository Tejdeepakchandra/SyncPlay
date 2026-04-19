import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Music,
  Link as LinkIcon,
  Plus,
  Search,
  Sparkles,
  Headphones,
  Play,
  Radio,
  AudioWaveform,
  Clock3,
  Mic2,
  Flame,
  Star,
  Disc3,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import CreateRoomDialog from "@/components/CreateRoomDialog";
import JoinRoomDialog from "@/components/JoinRoomDialog";
import api from "@/services/api";
import { getSocket } from "@/services/socket";
import { useAuth } from "@/hooks/useAuth";
import RoomFeedTicker from "@/components/discovery/RoomFeedTicker";
import ThemeParticleBackground from "@/components/discovery/ThemeParticleBackground";

const vibePills = [
  { icon: AudioWaveform, label: "Shared queue" },
  { icon: Mic2, label: "Voice rooms" },
  { icon: Radio, label: "Live reactions" },
  { icon: Clock3, label: "Background playback" },
];

const MUSIC_GENRES = ["lofi", "edm", "pop", "rock", "jazz", "hiphop", "classical", "kpop"];
const LANGUAGES = ["english", "hindi", "korean", "japanese", "spanish", "tamil", "telugu"];
const MUSIC_EXPERIENCE_BLOCKS = [
  { icon: Flame, title: "Crowd Energy", desc: "Live reactions and dynamic room vibe." },
  { icon: Star, title: "Personalized Feed", desc: "Friend hosts and matched genres rank first." },
  { icon: Disc3, title: "Continuous Play", desc: "Smooth transitions with background-safe playback." },
];

const ROOM_ACTION_GUIDE = [
  {
    title: "Queue Together",
    desc: "Add tracks collaboratively and shape the room vibe live.",
    icon: AudioWaveform,
  },
  {
    title: "Talk + Listen",
    desc: "Voice chat stays in sync with playback for everyone.",
    icon: Mic2,
  },
  {
    title: "Keep It Flowing",
    desc: "Use controls, handoffs, and reactions without breaking flow.",
    icon: Disc3,
  },
];

const cardItem = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 180, damping: 22 } },
};

function CoverTile({ room }) {
  if (room?.cover?.coverUrl) {
    return (
      <div className="h-32 rounded-xl overflow-hidden border border-border mb-3 bg-muted/30">
        <img src={room.cover.coverUrl} alt={room.name} className="w-full h-full object-cover" loading="lazy" />
      </div>
    );
  }

  return (
    <div className="h-32 rounded-xl border border-border mb-3 bg-[linear-gradient(135deg,hsl(var(--secondary)/0.3),hsl(var(--accent)/0.25),hsl(var(--background)/0.4))] flex items-center justify-center">
      <Music className="w-12 h-12 text-foreground/50" />
    </div>
  );
}

function PreferenceChips({ title, options, selected, onToggle, tone = "secondary" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = selected.includes(option);
          const activeClass = tone === "secondary"
            ? "bg-secondary/20 border-secondary/40 text-secondary"
            : "bg-primary/20 border-primary/40 text-primary";
          return (
            <button
              key={option}
              onClick={() => onToggle(option)}
              className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${active ? activeClass : "bg-background/60 border-border text-muted-foreground hover:text-foreground"}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function MusicPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, updateProfile } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [musicGenres, setMusicGenres] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [newRoomIds, setNewRoomIds] = useState(new Set());
  const [isDesktopParallax, setIsDesktopParallax] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const initializedPrefsRef = useRef(false);
  const heroRef = useRef(null);
  const previousRoomIdsRef = useRef(new Set());
  const hasHydratedRoomsRef = useRef(false);
  const clearNewRoomsTimeoutRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroParallaxY = useTransform(scrollYProgress, [0, 1], [0, -34]);
  const heroParallaxScale = useTransform(scrollYProgress, [0, 1], [1, 0.97]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const onChange = (event) => setIsDesktopParallax(event.matches);

    setIsDesktopParallax(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, []);

  useEffect(() => {
    if (initializedPrefsRef.current) return;
    if (!user) return;

    const prefMusicGenres = Array.isArray(user?.preferences?.discovery?.musicGenres)
      ? user.preferences.discovery.musicGenres.map((g) => String(g).toLowerCase())
      : [];
    const prefLanguages = Array.isArray(user?.preferences?.discovery?.languages)
      ? user.preferences.discovery.languages.map((l) => String(l).toLowerCase())
      : [];

    setMusicGenres(prefMusicGenres);
    setLanguages(prefLanguages);
    initializedPrefsRef.current = true;
  }, [user]);

  useEffect(() => {
    if (!isAuthenticated || !initializedPrefsRef.current) return;

    const timeoutId = window.setTimeout(() => {
      updateProfile({
        preferences: {
          discovery: {
            musicGenres,
            languages,
          },
        },
      }).catch(() => {});
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, musicGenres, languages, updateProfile]);

  const fetchRooms = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get("/rooms", {
        params: {
          type: "music",
          status: "active,lobby",
          limit: 36,
          personalized: true,
          preferredGenres: musicGenres.join(","),
          preferredLanguages: languages.join(","),
        },
      });
      const nextRooms = Array.isArray(res?.data?.data?.rooms) ? res.data.data.rooms : [];

      const nextIds = new Set(nextRooms.map((room) => room?.roomCode).filter(Boolean));
      const prevIds = previousRoomIdsRef.current;

      if (hasHydratedRoomsRef.current) {
        const incomingIds = [...nextIds].filter((id) => !prevIds.has(id));
        if (incomingIds.length > 0) {
          if (clearNewRoomsTimeoutRef.current) {
            window.clearTimeout(clearNewRoomsTimeoutRef.current);
          }
          setNewRoomIds(new Set(incomingIds));
          clearNewRoomsTimeoutRef.current = window.setTimeout(() => {
            setNewRoomIds(new Set());
          }, 2200);
        }
      }

      previousRoomIdsRef.current = nextIds;
      hasHydratedRoomsRef.current = true;
      setRooms(nextRooms);
    } catch {
      if (!silent) setRooms([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [musicGenres, languages]);

  useEffect(() => {
    return () => {
      if (clearNewRoomsTimeoutRef.current) {
        window.clearTimeout(clearNewRoomsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    fetchRooms(false);
  }, [fetchRooms]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchRooms(true);
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [fetchRooms]);

  useEffect(() => {
    const socket = getSocket();
    const handleDiscoveryRefresh = (payload) => {
      const roomType = String(payload?.type || "").toLowerCase();
      if (roomType && roomType !== "music") return;
      fetchRooms(true);
    };

    socket.on("discovery:rooms-updated", handleDiscoveryRefresh);
    return () => {
      socket.off("discovery:rooms-updated", handleDiscoveryRefresh);
    };
  }, [fetchRooms]);

  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((room) => {
      return (
        room?.name?.toLowerCase().includes(q) ||
        room?.host?.name?.toLowerCase().includes(q) ||
        room?.media?.title?.toLowerCase().includes(q)
      );
    });
  }, [rooms, query]);

  const spotlightRoom = filteredRooms[0] || null;
  const trendingRooms = filteredRooms.slice(0, 4);

  const toggleMusicGenre = (genre) => {
    setMusicGenres((prev) => (prev.includes(genre) ? prev.filter((g) => g !== genre) : [...prev, genre]));
  };

  const toggleLanguage = (language) => {
    setLanguages((prev) => (prev.includes(language) ? prev.filter((l) => l !== language) : [...prev, language]));
  };

  return (
    <>
      <main className="pb-12 w-full overflow-x-hidden relative">
        <ThemeParticleBackground theme="music" />
        <div className="container mx-auto px-4 lg:px-8 relative z-10">
          <RoomFeedTicker roomType="music" className="mb-4" />

          <motion.section
            ref={heroRef}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
            style={{
              y: isDesktopParallax ? heroParallaxY : 0,
              scale: isDesktopParallax ? heroParallaxScale : 1,
            }}
            className="relative overflow-hidden rounded-[2rem] border border-secondary/30 bg-[radial-gradient(circle_at_20%_20%,hsl(var(--secondary)/0.38),transparent_45%),radial-gradient(circle_at_85%_10%,hsl(var(--accent)/0.24),transparent_50%),radial-gradient(circle_at_50%_110%,hsl(var(--primary)/0.18),transparent_55%),hsl(var(--card)/0.7)] p-6 md:p-8 lg:p-10 mb-7"
          >
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(112deg,transparent_10%,hsl(var(--secondary)/0.09)_48%,transparent_88%)] animate-spotlight" />
            <motion.div
              className="absolute -top-14 left-8 w-36 h-36 rounded-full bg-secondary/25 blur-3xl pointer-events-none"
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.75, 0.4] }}
              transition={{ duration: 5.2, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              className="absolute -bottom-16 right-6 w-44 h-44 rounded-full bg-accent/25 blur-3xl pointer-events-none"
              animate={{ scale: [1.12, 1, 1.12], opacity: [0.5, 0.3, 0.5] }}
              transition={{ duration: 6.4, repeat: Infinity, ease: "easeInOut" }}
            />

            <div className="relative z-10 grid lg:grid-cols-[1.2fr_0.8fr] gap-7 items-center">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-3 py-1.5 text-xs font-semibold text-secondary mb-4">
                  <Sparkles className="w-3 h-3" />
                  Hyper-live music discovery
                </div>
                <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-3">
                  <span className="text-gradient-music">Music</span>
                </h1>
                <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed mb-6">
                  Sessions now refresh in real time and rank to your vibe: friend hosts, genres, and preferred languages.
                </p>

                <div className="flex flex-wrap gap-2.5 mb-7">
                  {vibePills.map((pill) => (
                    <span key={pill.label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/40 px-3 py-1.5 text-xs text-foreground/90">
                      <pill.icon className="w-3.5 h-3.5 text-secondary" />
                      {pill.label}
                    </span>
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
                    Create Music Session
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setJoinOpen(true)}
                    className="glass-panel px-6 py-3 rounded-xl flex items-center gap-2 text-sm font-medium text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <LinkIcon className="w-4 h-4" />
                    Join with Link
                  </motion.button>
                </div>
              </div>

              <div className="glass-panel p-4 md:p-5 rounded-2xl">
                <p className="text-xs uppercase tracking-[0.22em] text-secondary/85 mb-2">Live Snapshot</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-border bg-background/50 p-3">
                    <p className="text-[11px] text-muted-foreground">Active sessions</p>
                    <p className="font-display text-2xl font-bold text-foreground">{rooms.length}</p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/50 p-3">
                    <p className="text-[11px] text-muted-foreground">Listening now</p>
                    <p className="font-display text-2xl font-bold text-foreground">
                      {rooms.reduce((sum, room) => sum + Number(room?.participantCount || 0), 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background/50 p-3">
                    <p className="text-[11px] text-muted-foreground">Refresh</p>
                    <p className="font-display text-lg font-bold text-secondary inline-flex items-center gap-1.5">
                      <Radio className="w-4 h-4" />
                      Live
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Auto updates via socket + polling fallback.</p>
              </div>
            </div>
          </motion.section>

          <div className="glass-panel rounded-2xl p-4 mb-5">
            <div className="grid gap-4 md:grid-cols-2">
              <PreferenceChips title="Music genres you prefer" options={MUSIC_GENRES} selected={musicGenres} onToggle={toggleMusicGenre} tone="secondary" />
              <PreferenceChips title="Preferred languages" options={LANGUAGES} selected={languages} onToggle={toggleLanguage} tone="primary" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">Live Music Sessions</h2>
            <span className="text-xs text-muted-foreground">Friend-hosted and matched sessions rank higher</span>
          </div>

          {trendingRooms.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="grid md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6"
            >
              {trendingRooms.map((room, idx) => (
                <motion.button
                  key={`trend-${room.roomCode}`}
                  whileHover={{ y: -3, scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => navigate(`/music/room/${room.roomCode}`)}
                  className="text-left rounded-xl border border-border bg-[linear-gradient(140deg,hsl(var(--secondary)/0.16),hsl(var(--card)/0.55))] p-3"
                >
                  <p className="text-[10px] uppercase tracking-[0.15em] text-secondary/85 mb-1">Top Session #{idx + 1}</p>
                  <p className="text-sm font-semibold text-foreground truncate">{room.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{room.media?.title || "Starting soon"}</p>
                </motion.button>
              ))}
            </motion.section>
          )}

          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search session, host, or track"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full h-11 pl-11 pr-4 rounded-xl bg-glass/60 border-glass-border backdrop-blur-sm text-sm"
            />
          </div>

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-3 mb-6"
          >
            {MUSIC_EXPERIENCE_BLOCKS.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className="rounded-xl border border-border bg-card/50 p-4"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary/20 border border-secondary/30 text-secondary flex items-center justify-center mb-3">
                  <item.icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid md:grid-cols-3 gap-3 mb-6"
          >
            {ROOM_ACTION_GUIDE.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className="rounded-xl border border-secondary/20 bg-[linear-gradient(145deg,hsl(var(--secondary)/0.14),hsl(var(--card)/0.48))] p-4"
              >
                <div className="w-9 h-9 rounded-lg bg-secondary/20 border border-secondary/35 text-secondary flex items-center justify-center mb-3">
                  <item.icon className="w-4 h-4" />
                </div>
                <p className="text-sm font-semibold text-foreground mb-1">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.section>

          {spotlightRoom && (
            <motion.section
              variants={cardItem}
              initial="hidden"
              animate="show"
              className="mb-5 rounded-2xl border border-secondary/25 bg-[linear-gradient(145deg,hsl(var(--secondary)/0.17),hsl(var(--background)/0.55))] p-4 md:p-5"
            >
              <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-secondary/85 mb-1">Spotlight Session</p>
                  <h3 className="text-lg md:text-xl font-semibold text-foreground">{spotlightRoom.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    Hosted by {spotlightRoom.host?.name || "Host"} · {spotlightRoom.participantCount} listening
                  </p>
                  {spotlightRoom.media?.title && (
                    <p className="text-xs text-foreground/80 mt-2">Now playing: {spotlightRoom.media.title}</p>
                  )}
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate(`/music/room/${spotlightRoom.roomCode}`)}
                  className="self-start md:self-center gradient-music text-secondary-foreground rounded-xl px-5 py-2.5 text-sm font-semibold inline-flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Listen Now
                </motion.button>
              </div>
            </motion.section>
          )}

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-16">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-56 rounded-2xl border border-border bg-card/40 animate-pulse" />
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="glass-panel rounded-2xl p-8 text-center mb-16">
              <Music className="w-10 h-10 text-secondary/70 mx-auto mb-3" />
              <h3 className="font-display text-xl font-bold text-foreground mb-2">No live music sessions yet</h3>
              <p className="text-sm text-muted-foreground mb-5">Create one and start listening together right now.</p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => setCreateOpen(true)} className="gradient-music text-secondary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold">
                  Create Session
                </button>
                <button onClick={() => setJoinOpen(true)} className="glass-panel px-5 py-2.5 rounded-xl text-sm font-medium text-foreground">
                  Join by Code
                </button>
              </div>
            </div>
          ) : (
            <motion.section
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-16"
            >
              {filteredRooms.map((room) => (
                <motion.article
                  key={room.roomCode}
                  variants={cardItem}
                  initial={false}
                  animate={
                    newRoomIds.has(room.roomCode)
                      ? { opacity: [0.55, 1], y: [16, 0], scale: [0.96, 1] }
                      : { opacity: 1, y: 0, scale: 1 }
                  }
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -6 }}
                  onClick={() => navigate(`/music/room/${room.roomCode}`)}
                  className="group cursor-pointer rounded-2xl border border-border bg-card/55 p-4 backdrop-blur-sm hover:border-secondary/30 transition-colors overflow-hidden"
                >
                  <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-r from-secondary/0 via-secondary/10 to-accent/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CoverTile room={room} />

                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-foreground truncate group-hover:text-secondary transition-colors">{room.name}</h3>
                      <p className="text-xs text-muted-foreground">{room.host?.avatarEmoji || "🧑"} {room.host?.name || "Host"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {newRoomIds.has(room.roomCode) && (
                        <span className="text-[10px] px-2 py-1 rounded-full bg-primary/20 border border-primary/40 text-primary font-semibold uppercase tracking-wide">
                          New
                        </span>
                      )}
                      <span className="text-[10px] px-2 py-1 rounded-full bg-secondary/15 border border-secondary/30 text-secondary font-semibold uppercase tracking-wide">
                        {room.status}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background/45 p-3 mb-3">
                    <p className="text-[11px] text-muted-foreground mb-1">Current track</p>
                    <p className="text-sm text-foreground truncate">{room.media?.title || "Queue is ready for first track"}</p>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-muted-foreground">Live energy</p>
                      <p className="text-[11px] text-secondary font-semibold">
                        {Math.min(100, Math.max(18, Math.round((Number(room?.ranking?.score || 0) * 1.2) + Number(room?.participantCount || 0) * 4)))}%
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden border border-border/70">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, Math.max(18, Math.round((Number(room?.ranking?.score || 0) * 1.2) + Number(room?.participantCount || 0) * 4)))}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-secondary via-primary to-accent"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {room?.ranking?.friendHostBoost > 0 && (
                      <span className="text-[10px] px-2 py-1 rounded-full border border-secondary/40 bg-secondary/15 text-secondary">Friend host</span>
                    )}
                    {(room?.ranking?.matchedGenres || []).slice(0, 2).map((genre) => (
                      <span key={genre} className="text-[10px] px-2 py-1 rounded-full border border-secondary/35 bg-secondary/12 text-secondary">{genre}</span>
                    ))}
                    {(room?.ranking?.matchedLanguages || []).slice(0, 1).map((language) => (
                      <span key={language} className="text-[10px] px-2 py-1 rounded-full border border-accent/35 bg-accent/12 text-accent">{language}</span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Headphones className="w-3.5 h-3.5" />
                      {room.participantCount} listening
                    </span>
                    <span>{room.privacy || "public"}</span>
                  </div>
                </motion.article>
              ))}
            </motion.section>
          )}
        </div>
      </main>

      <CreateRoomDialog open={createOpen} onClose={() => setCreateOpen(false)} type="music" />
      <JoinRoomDialog open={joinOpen} onClose={() => setJoinOpen(false)} theme="music" />
    </>
  );
}
