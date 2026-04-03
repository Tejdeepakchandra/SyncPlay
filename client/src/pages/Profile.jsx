import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Edit2, Film, Users, Clock, Shield, Bell,
  Palette, ChevronRight, X, Check, Sparkles, Heart,
  Zap, Award, Share2, Play, LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useThemeStore, themes } from "@/stores/themeStore";
import { useAuth } from "@/hooks/useAuth";

// ── Theme Picker Component ──
const ThemePicker = () => {
  const { theme: currentTheme, setTheme } = useThemeStore();

  const handleThemeChange = (themeId) => {
    document.documentElement.classList.add("theme-transition");
    setTheme(themeId);
    toast.success(`${themes.find((t) => t.id === themeId)?.emoji} Theme changed to ${themes.find((t) => t.id === themeId)?.name}!`, { duration: 1500 });
    setTimeout(() => document.documentElement.classList.remove("theme-transition"), 500);
  };

  return (
    <div className="space-y-2">
      {themes.map((t) => {
        const isActive = currentTheme === t.id;
        return (
          <motion.button
            key={t.id}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleThemeChange(t.id)}
            className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left ${
              isActive
                ? "border-primary/40 bg-primary/10"
                : "border-border bg-card/30 hover:bg-card/50"
            }`}
          >
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className="w-5 h-5 rounded-full border-2 border-background shadow-sm" style={{ backgroundColor: t.preview.bg }} />
              <div className="w-5 h-5 rounded-full border-2 border-background shadow-sm -ml-1.5" style={{ backgroundColor: t.preview.primary }} />
              <div className="w-5 h-5 rounded-full border-2 border-background shadow-sm -ml-1.5" style={{ backgroundColor: t.preview.secondary }} />
              <div className="w-5 h-5 rounded-full border-2 border-background shadow-sm -ml-1.5" style={{ backgroundColor: t.preview.accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <span>{t.emoji}</span> {t.name}
              </p>
              <p className="text-[11px] text-muted-foreground">{t.description}</p>
            </div>
            {isActive && (
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <Check className="w-3.5 h-3.5 text-primary-foreground" />
              </motion.div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
};

const EMOJI_OPTIONS = ["😎", "🧑", "👩", "🦊", "🐱", "🎮", "🎵", "🎬", "🚀", "⭐", "🔥", "💎", "🌈", "🎯", "🦄", "🐼"];

export default function Profile() {
  const navigate = useNavigate();
  const { user, clerkUser, isLoading, clerkLoaded, sessionLoaded, dbLoading, signOut } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(null);
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editEmoji, setEditEmoji] = useState("🧑");
  const [saving, setSaving] = useState(false);

  const [notifications, setNotifications] = useState({ roomInvites: true, friendRequests: true, messages: true, marketing: false });
  const [privacy, setPrivacy] = useState({ showOnline: true, showActivity: true, allowInvites: true });

  const stats = [
    { label: "Rooms Created", value: "—", icon: Film, color: "text-primary", bg: "bg-primary/10" },
    { label: "Hours Watched", value: "—", icon: Clock, color: "text-secondary", bg: "bg-secondary/10" },
    { label: "Friends", value: "—", icon: Users, color: "text-friends", bg: "bg-friends/10" },
    { label: "Streak", value: "—", icon: Zap, color: "text-destructive", bg: "bg-destructive/10" },
  ];

  const profileNavItems = [
    { key: "moments", label: "Moments", desc: "Captured highlights", icon: Play, route: "/moments", gradient: "bg-primary", count: "—" },
    { key: "activity", label: "Activity", desc: "Watch & listen history", icon: Clock, route: "/activity", gradient: "bg-secondary", count: "—" },
    { key: "achievements", label: "Achievements", desc: "Unlocked badges", icon: Award, route: "/achievements", gradient: "bg-friends", count: "—" },
    { key: "favorites", label: "Favorites", desc: "Top genres", icon: Heart, route: "/favorites", gradient: "bg-accent", count: "—" },
  ];

  const currentProfile = {
    display_name: user?.name || clerkUser?.fullName || "User",
    username: clerkUser?.username || user?.email?.split("@")[0] || "user",
    avatar_emoji: "🧑",
    bio: "",
    is_online: true
  };

  const openEdit = () => {
    setEditName(currentProfile.display_name);
    setEditBio(currentProfile.bio || "");
    setEditEmoji(currentProfile.avatar_emoji);
    setEditOpen(true);
  };

  const handleSaveProfile = () => {
    if (!editName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }
    setSaving(true);
    // In a real app this would call an API
    setTimeout(() => {
      setSaving(false);
      setEditOpen(false);
      toast.success("Profile updated!");
    }, 500);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
      toast.success("Signed out successfully");
    } catch {
      toast.error("Failed to sign out");
    }
  };

  const handleShareProfile = () => {
    navigator.clipboard.writeText(`${window.location.origin}/profile`);
    toast.success("Profile link copied!");
  };

  // Auth guard
  if (!isLoading && !user && !clerkUser) {
    return (
      <main className="pb-12 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">Sign in to view your profile</h2>
          <p className="text-sm text-muted-foreground mb-6">Create rooms, add friends, and track your watch history.</p>
          <Button onClick={() => navigate("/sign-in")} className="bg-primary text-primary-foreground">
            Sign In
          </Button>
        </div>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="pb-12 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto mb-4" />
          <div className="text-muted-foreground">Loading your profile...</div>
          <div className="text-xs text-muted-foreground/60 mt-2">
            {!clerkLoaded && <div>Initializing Clerk...</div>}
            {clerkLoaded && dbLoading && <div>Fetching profile data...</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-12">
      <div className="container mx-auto px-4 lg:px-8 max-w-3xl">

        {/* ── Profile Header Card ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl bg-card border border-border mb-6"
        >
          <div className="h-32 bg-gradient-to-br from-primary/30 via-accent/20 to-secondary/30 relative">
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div className="absolute inset-0 w-[30%] h-[200%] bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-pulse" />
            </div>
          </div>

          <div className="px-6 pb-6 -mt-12 relative">
            <div className="flex items-end gap-4 mb-5">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="relative"
              >
                <div className="w-24 h-24 rounded-2xl bg-card/80 backdrop-blur-xl flex items-center justify-center text-5xl border-4 border-background shadow-xl">
                  {currentProfile.avatar_emoji}
                </div>
                <button
                  onClick={openEdit}
                  className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-lg shadow-primary/20"
                >
                  <Edit2 className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
                {currentProfile.is_online && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-secondary border-2 border-background" />
                )}
              </motion.div>

              <div className="flex-1 pb-1">
                <h1 className="font-display text-2xl font-bold text-foreground">{currentProfile.display_name}</h1>
                <p className="text-sm text-muted-foreground">@{currentProfile.username}</p>
              </div>

              <div className="flex items-center gap-2 pb-1">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleShareProfile}
                  className="w-9 h-9 rounded-xl bg-muted/30 border border-border flex items-center justify-center hover:bg-muted/40 transition-colors"
                >
                  <Share2 className="w-4 h-4 text-muted-foreground" />
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={openEdit}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/20"
                >
                  Edit Profile
                </motion.button>
              </div>
            </div>

            {currentProfile.bio && <p className="text-sm text-muted-foreground mb-5">{currentProfile.bio}</p>}

            <div className="grid grid-cols-4 gap-3">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  onClick={() => {
                    if (stat.label === "Friends") navigate("/friends");
                    else if (stat.label === "Rooms Created") navigate("/movies");
                  }}
                  className="bg-muted/30 border border-border p-3 rounded-xl text-center cursor-pointer group"
                >
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <p className="font-display text-lg font-bold text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* ── Navigation Buttons ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="grid grid-cols-2 gap-3 mb-6"
        >
          {profileNavItems.map((navItem, i) => (
            <motion.button
              key={navItem.key}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.06 }}
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(navItem.route)}
              className="relative bg-card border border-border p-4 rounded-2xl text-left overflow-hidden group hover:border-primary/20 transition-all"
            >
              <div className={`w-9 h-9 rounded-xl ${navItem.gradient} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <navItem.icon className="w-4 h-4 text-primary-foreground" />
              </div>
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{navItem.label}</p>
              <p className="text-[11px] text-muted-foreground">{navItem.desc}</p>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/30 group-hover:text-primary/60 group-hover:translate-x-0.5 transition-all" />
            </motion.button>
          ))}
        </motion.div>

        {/* ── Settings ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          <h3 className="font-display text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Settings
          </h3>
          <div className="space-y-2">
            {/* Notifications */}
            <div
              onClick={() => setSettingsOpen(settingsOpen === "notifications" ? null : "notifications")}
              className="bg-card border border-border p-4 cursor-pointer hover:border-primary/20 transition-colors group rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Bell className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Notifications</p>
                  <p className="text-xs text-muted-foreground">Manage alerts</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen === "notifications" ? "rotate-90" : ""}`} />
              </div>
              <AnimatePresence>
                {settingsOpen === "notifications" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="pt-4 mt-4 border-t border-border space-y-3">
                      {[
                        { key: "roomInvites", label: "Room Invites" },
                        { key: "friendRequests", label: "Friend Requests" },
                        { key: "messages", label: "New Messages" },
                        { key: "marketing", label: "Updates & News" },
                      ].map((settingItem) => (
                        <div key={settingItem.key} className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{settingItem.label}</span>
                          <Switch
                            checked={notifications[settingItem.key]}
                            onCheckedChange={(v) => { setNotifications((prev) => ({ ...prev, [settingItem.key]: v })); toast(`${settingItem.label} ${v ? "enabled" : "disabled"}`, { duration: 1500 }); }}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Privacy */}
            <div
              onClick={() => setSettingsOpen(settingsOpen === "privacy" ? null : "privacy")}
              className="bg-card border border-border p-4 cursor-pointer hover:border-primary/20 transition-colors group rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                  <Shield className="w-4 h-4 text-secondary" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Privacy</p>
                  <p className="text-xs text-muted-foreground">Control who sees you</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen === "privacy" ? "rotate-90" : ""}`} />
              </div>
              <AnimatePresence>
                {settingsOpen === "privacy" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="pt-4 mt-4 border-t border-border space-y-3">
                      {[
                        { key: "showOnline", label: "Show Online Status" },
                        { key: "showActivity", label: "Show Activity" },
                        { key: "allowInvites", label: "Allow Room Invites" },
                      ].map((settingItem) => (
                        <div key={settingItem.key} className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{settingItem.label}</span>
                          <Switch
                            checked={privacy[settingItem.key]}
                            onCheckedChange={(v) => { setPrivacy((prev) => ({ ...prev, [settingItem.key]: v })); toast(`${settingItem.label} ${v ? "enabled" : "disabled"}`, { duration: 1500 }); }}
                          />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Appearance */}
            <div
              onClick={() => setSettingsOpen(settingsOpen === "appearance" ? null : "appearance")}
              className="bg-card border border-border p-4 cursor-pointer hover:border-primary/20 transition-colors group rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Palette className="w-4 h-4 text-accent" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Appearance</p>
                  <p className="text-xs text-muted-foreground">Theme & display</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen === "appearance" ? "rotate-90" : ""}`} />
              </div>
              <AnimatePresence>
                {settingsOpen === "appearance" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="pt-4 mt-4 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-3">Choose a theme</p>
                      <ThemePicker />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Sign Out */}
            <motion.div
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSignOut}
              className="bg-card border border-border p-4 cursor-pointer hover:border-destructive/20 transition-colors group rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <LogOut className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Sign Out</p>
                  <p className="text-xs text-muted-foreground">{clerkUser?.emailAddresses[0]?.emailAddress || ""}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* ── Edit Profile Dialog ── */}
        <AnimatePresence>
          {editOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setEditOpen(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-card border border-border p-6 w-full max-w-sm z-10 rounded-2xl"
              >
                <button onClick={() => setEditOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <h2 className="font-display text-lg font-bold text-foreground mb-5">Edit Profile</h2>
                <div className="space-y-4">
                  {/* Avatar Emoji Picker */}
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Avatar</label>
                    <div className="flex flex-wrap gap-2">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setEditEmoji(emoji)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                            editEmoji === emoji
                              ? "bg-primary/20 border-2 border-primary scale-110"
                              : "bg-muted/50 border border-border hover:bg-muted"
                          }`}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Display Name</label>
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="bg-card/60 border-border" maxLength={50} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">Bio</label>
                    <Input value={editBio} onChange={(e) => setEditBio(e.target.value)} className="bg-card/60 border-border" placeholder="Tell us about yourself..." maxLength={160} />
                  </div>
                  <Button onClick={handleSaveProfile} disabled={saving} className="w-full bg-primary text-primary-foreground font-semibold shadow-lg shadow-primary/20">
                    {saving ? "Saving..." : <><Check className="w-4 h-4 mr-1" /> Save Changes</>}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
