import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings,
  Edit2,
  Film,
  Users,
  Clock,
  Shield,
  Bell,
  Palette,
  ChevronRight,
  X,
  Check,
  Sparkles,
  Heart,
  Zap,
  Award,
  Share2,
  Play,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useThemeStore, themes } from "@/stores/themeStore";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";

const EMOJI_OPTIONS = ["😎", "🧑", "👩", "🦊", "🐱", "🎮", "🎵", "🎬", "🚀", "⭐", "🔥", "💎", "🌈", "🎯", "🦄", "🐼"];

function ThemePicker() {
  const { theme: currentTheme, setTheme } = useThemeStore();
  const { updateProfile } = useAuth();

  const handleThemeChange = async (themeId) => {
    document.documentElement.classList.add("theme-transition");
    setTheme(themeId);
    try {
      await updateProfile({ preferences: { theme: themeId } });
    } catch {
      // Keep local theme even if persistence fails.
    }
    toast.success(`${themes.find((t) => t.id === themeId)?.emoji} ${themes.find((t) => t.id === themeId)?.name} applied`);
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
              isActive ? "border-primary/40 bg-primary/10" : "border-border bg-card/30 hover:bg-card/50"
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
}

export default function Profile() {
  const navigate = useNavigate();
  const { user, clerkUser, isLoading, clerkLoaded, sessionLoaded, dbLoading, signOut, updateProfile, isAuthenticated } = useAuth();

  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(null);

  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editEmoji, setEditEmoji] = useState("🧑");
  const [saving, setSaving] = useState(false);

  const [notificationOverrides, setNotificationOverrides] = useState({});
  const [privacyOverrides, setPrivacyOverrides] = useState({});
  const [friendCount, setFriendCount] = useState(null);
  const [profileCounts, setProfileCounts] = useState({ activity: 0, achievements: 0, favorites: 0, moments: 0 });

  const notifications = useMemo(
    () => ({
      roomInvites: true,
      friendRequests: true,
      messages: true,
      marketing: false,
      ...(user?.preferences?.notifications || {}),
      ...notificationOverrides,
    }),
    [user?.preferences?.notifications, notificationOverrides]
  );

  const privacy = useMemo(
    () => ({
      showOnline: true,
      showActivity: true,
      allowInvites: true,
      ...(user?.preferences?.privacy || {}),
      ...privacyOverrides,
    }),
    [user?.preferences?.privacy, privacyOverrides]
  );

  const currentProfile = {
    display_name: user?.displayName || user?.name || clerkUser?.fullName || "User",
    username: user?.username || clerkUser?.username || user?.email?.split("@")[0] || "user",
    avatar_emoji: user?.avatar_emoji || "🧑",
    bio: user?.bio || "",
    is_online: user?.isOnline ?? true,
  };

  const profileNavItems = useMemo(
    () => [
      {
        key: "activity",
        path: "/profile/activity",
        label: "Activity",
        desc: "Watch, social and timeline history",
        icon: Clock,
        gradient: "bg-secondary",
        count: profileCounts.activity,
      },
      {
        key: "achievements",
        path: "/profile/achievements",
        label: "Achievements",
        desc: "Milestones and badges unlocked",
        icon: Award,
        gradient: "bg-friends",
        count: profileCounts.achievements,
      },
      {
        key: "favorites",
        path: "/profile/favorites",
        label: "Favorites",
        desc: "Saved rooms, moments, activities",
        icon: Heart,
        gradient: "bg-accent",
        count: profileCounts.favorites,
      },
      {
        key: "moments",
        path: "/profile/moments",
        label: "Moments",
        desc: "Session highlights & captured clips",
        icon: Play,
        gradient: "bg-primary",
        count: profileCounts.moments,
      },
    ],
    [profileCounts]
  );

  const stats = useMemo(
    () => [
      { label: "Rooms Created", value: String(user?.stats?.roomsCreated ?? 0), icon: Film, color: "text-primary", bg: "bg-primary/10" },
      { label: "Hours Watched", value: String(Math.round((user?.stats?.watchTimeMinutes ?? 0) / 60)), icon: Clock, color: "text-secondary", bg: "bg-secondary/10" },
      { label: "Friends", value: friendCount ?? "—", icon: Users, color: "text-friends", bg: "bg-friends/10" },
      { label: "Streak", value: String(user?.stats?.watchedStreakDays ?? 0), icon: Zap, color: "text-destructive", bg: "bg-destructive/10" },
    ],
    [user?.stats?.roomsCreated, user?.stats?.watchTimeMinutes, friendCount, user?.stats?.watchedStreakDays]
  );

  useEffect(() => {
    if (!clerkLoaded || !sessionLoaded || !isAuthenticated) return;

    let cancelled = false;

    const loadProfileCounts = async (isRetry = false) => {
      try {
        const [summaryRes, activityRes, achievementsRes, favoritesRes, momentsRes] = await Promise.all([
          api.get("/friends/summary"),
          api.get("/users/me/activity", { params: { page: 1, limit: 1, category: "all" } }),
          api.get("/users/me/achievements"),
          api.get("/users/me/favorites"),
          api.get("/moments/profile/moments").catch(() => ({ data: { data: { total: 0 } } })),
        ]);

        if (cancelled) return;

        const friends = summaryRes?.data?.data?.friendsCount;
        setFriendCount(Number.isFinite(friends) ? friends : null);

        const favorites = favoritesRes?.data?.data?.favorites || { rooms: [], moments: [], activities: [] };
        const momentsData = momentsRes?.data?.data;
        const momentsCount = momentsData?.total ?? (Array.isArray(momentsData) ? momentsData.length : 0);
        setProfileCounts({
          activity: activityRes?.data?.data?.summary?.total ?? 0,
          achievements: achievementsRes?.data?.data?.summary?.unlocked ?? 0,
          favorites: (favorites.rooms?.length || 0) + (favorites.moments?.length || 0) + (favorites.activities?.length || 0),
          moments: momentsCount,
        });
      } catch {
        if (!isRetry && !cancelled) {
          window.setTimeout(() => {
            loadProfileCounts(true).catch(() => null);
          }, 350);
        }
      }
    };

    loadProfileCounts(false).catch(() => null);

    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, sessionLoaded, isAuthenticated]);

  const openEdit = () => {
    setEditName(currentProfile.display_name);
    setEditBio(currentProfile.bio || "");
    setEditEmoji(currentProfile.avatar_emoji);
    setEditOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast.error("Display name cannot be empty");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        displayName: editName.trim(),
        bio: editBio.trim(),
        avatar_emoji: editEmoji,
      });
      setEditOpen(false);
      toast.success("Profile updated");
    } catch {
      toast.error("Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const updateNotificationSetting = async (key, value, label) => {
    const nextNotifications = { ...notifications, [key]: value };
    setNotificationOverrides((prev) => ({ ...prev, [key]: value }));
    try {
      await updateProfile({ preferences: { notifications: nextNotifications } });
      toast(`${label} ${value ? "enabled" : "disabled"}`);
    } catch {
      setNotificationOverrides((prev) => ({ ...prev, [key]: !value }));
      toast.error("Failed to save notification setting");
    }
  };

  const updatePrivacySetting = async (key, value, label) => {
    const nextPrivacy = { ...privacy, [key]: value };
    setPrivacyOverrides((prev) => ({ ...prev, [key]: value }));
    try {
      await updateProfile({ preferences: { privacy: nextPrivacy } });
      toast(`${label} ${value ? "enabled" : "disabled"}`);
    } catch {
      setPrivacyOverrides((prev) => ({ ...prev, [key]: !value }));
      toast.error("Failed to save privacy setting");
    }
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
    toast.success("Profile link copied");
  };

  if (!isLoading && !user && !clerkUser) {
    return (
      <main className="pb-12 flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
          <h2 className="font-display text-xl font-bold text-foreground mb-2">Sign in to view your profile</h2>
          <p className="text-sm text-muted-foreground mb-6">Track your rooms, achievements, and favorites.</p>
          <Button onClick={() => navigate("/sign-in")} className="bg-primary text-primary-foreground">Sign In</Button>
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
            {!clerkLoaded && <div>Initializing auth...</div>}
            {clerkLoaded && dbLoading && <div>Fetching profile data...</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="pb-12 pt-2 md:pt-3">
      <div className="container mx-auto px-4 lg:px-8 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl bg-card border border-border mb-6"
        >
          <div className="h-32 bg-[radial-gradient(circle_at_20%_15%,hsl(var(--primary)/0.45),transparent_40%),radial-gradient(circle_at_80%_10%,hsl(var(--accent)/0.3),transparent_42%),radial-gradient(circle_at_50%_120%,hsl(var(--secondary)/0.25),transparent_55%)]" />

          <div className="px-5 md:px-6 pb-6 -mt-12 relative">
            <div className="flex flex-wrap items-end gap-3 md:gap-4 mb-5">
              <motion.div initial={{ scale: 0.85 }} animate={{ scale: 1 }} transition={{ delay: 0.15 }} className="relative">
                <div className="w-24 h-24 rounded-2xl bg-card/85 backdrop-blur-xl flex items-center justify-center text-5xl border-4 border-background shadow-xl">
                  {currentProfile.avatar_emoji}
                </div>
                <button onClick={openEdit} className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary flex items-center justify-center border-2 border-background shadow-lg shadow-primary/25">
                  <Edit2 className="w-3.5 h-3.5 text-primary-foreground" />
                </button>
                {currentProfile.is_online && <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-secondary border-2 border-background" />}
              </motion.div>

              <div className="flex-1 min-w-0 pb-1">
                <h1 className="font-display text-2xl font-bold text-foreground">{currentProfile.display_name}</h1>
                <p className="text-sm text-muted-foreground">@{currentProfile.username}</p>
              </div>

              <div className="w-full sm:w-auto flex items-center justify-end gap-2 pb-1">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleShareProfile} className="w-9 h-9 rounded-xl bg-muted/30 border border-border flex items-center justify-center hover:bg-muted/50 transition-colors">
                  <Share2 className="w-4 h-4 text-muted-foreground" />
                </motion.button>
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={openEdit} className="px-3.5 sm:px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/20 whitespace-nowrap">
                  <span className="sm:hidden">Edit</span>
                  <span className="hidden sm:inline">Edit Profile</span>
                </motion.button>
              </div>
            </div>

            {currentProfile.bio && <p className="text-sm text-muted-foreground mb-5">{currentProfile.bio}</p>}

            <div className="grid grid-cols-4 gap-3">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.08 }}
                  whileHover={{ scale: 1.03, y: -2 }}
                  className="bg-muted/30 border border-border p-3 rounded-xl text-center"
                >
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center mx-auto mb-2`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <p className="font-display text-lg font-bold text-foreground">{stat.value}</p>
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {profileNavItems.map((navItem, i) => (
            <motion.button
              key={navItem.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.24 + i * 0.06 }}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                navigate(navItem.path, { state: { profileNavDirection: "forward" } });
              }}
              className="relative bg-card border border-border p-4 rounded-2xl text-left overflow-hidden group transition-all hover:border-primary/20"
            >
              <motion.div layoutId={`profile-card-${navItem.key}`} className={`w-9 h-9 rounded-xl ${navItem.gradient} flex items-center justify-center mb-3`}>
                <navItem.icon className="w-4 h-4 text-primary-foreground" />
              </motion.div>
              <p className="text-sm font-semibold text-foreground">{navItem.label}</p>
              <p className="text-[11px] text-muted-foreground">{navItem.desc}</p>
              <p className="text-xs font-semibold text-foreground mt-1">{navItem.count}</p>
              <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/35 group-hover:text-primary/65 group-hover:translate-x-0.5 transition-all" />
            </motion.button>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <h3 className="font-display text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            Settings
          </h3>

          <div className="space-y-2">
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
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="pt-4 mt-4 border-t border-border space-y-3">
                      {[
                        { key: "roomInvites", label: "Room Invites" },
                        { key: "friendRequests", label: "Friend Requests" },
                        { key: "messages", label: "New Messages" },
                        { key: "marketing", label: "Updates & News" },
                      ].map((settingItem) => (
                        <div key={settingItem.key} className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{settingItem.label}</span>
                          <Switch checked={notifications[settingItem.key]} onCheckedChange={(v) => updateNotificationSetting(settingItem.key, v, settingItem.label)} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
                  <p className="text-xs text-muted-foreground">Control who sees your presence and invites</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen === "privacy" ? "rotate-90" : ""}`} />
              </div>

              <AnimatePresence>
                {settingsOpen === "privacy" && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="pt-4 mt-4 border-t border-border space-y-3">
                      {[
                        { key: "showOnline", label: "Show Online Status" },
                        { key: "showActivity", label: "Show Activity" },
                        { key: "allowInvites", label: "Allow Room Invites" },
                      ].map((settingItem) => (
                        <div key={settingItem.key} className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{settingItem.label}</span>
                          <Switch checked={privacy[settingItem.key]} onCheckedChange={(v) => updatePrivacySetting(settingItem.key, v, settingItem.label)} />
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
                  <p className="text-xs text-muted-foreground">Theme personalization</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen === "appearance" ? "rotate-90" : ""}`} />
              </div>

              <AnimatePresence>
                {settingsOpen === "appearance" && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="pt-4 mt-4 border-t border-border">
                      <ThemePicker />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={handleSignOut} className="bg-card border border-border p-4 cursor-pointer hover:border-destructive/20 transition-colors group rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <LogOut className="w-4 h-4 text-destructive" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">Sign Out</p>
                  <p className="text-xs text-muted-foreground">{clerkUser?.emailAddresses?.[0]?.emailAddress || ""}</p>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <AnimatePresence>
          {editOpen && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setEditOpen(false)} />

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative bg-card border border-border p-6 w-full max-w-sm z-10 rounded-2xl"
              >
                <button onClick={() => setEditOpen(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
                  <X className="w-5 h-5" />
                </button>

                <h2 className="font-display text-lg font-bold text-foreground mb-5">Edit Profile</h2>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Avatar</label>
                    <div className="flex flex-wrap gap-2">
                      {EMOJI_OPTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => setEditEmoji(emoji)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-all ${
                            editEmoji === emoji ? "bg-primary/20 border-2 border-primary scale-110" : "bg-muted/50 border border-border hover:bg-muted"
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
