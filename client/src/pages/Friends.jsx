import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserPlus,
  Search,
  Camera,
  MessageCircle,
  MoreHorizontal,
  Check,
  X,
  Bell,
  UserMinus,
  Copy,
  ExternalLink,
  Sparkles,
  Globe,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { StoriesRow } from "@/components/StoriesRow";
import { StoryViewer } from "@/components/StoryViewer";
import { CreateStoryDialog } from "@/components/CreateStoryDialog";
import { useStoriesRealtime } from "@/hooks/useStoriesRealtime";
import { getSocket } from "@/services/socket";

const TABS = ["friends", "requests", "discover"];
const FRIENDS_CACHE_KEY = "syncplay:friends:overview:v1";

const container = {
  hidden: { opacity: 1 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, delayChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 220, damping: 22 } },
};

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function isTransientAuthRace(error) {
  const status = error?.response?.status;
  const message = String(error?.response?.data?.message || "").toLowerCase();
  return status === 401 && message.includes("authentication required");
}

async function withOneAuthRetry(requestFn) {
  try {
    return await requestFn();
  } catch (error) {
    if (!isTransientAuthRace(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 450));
    return requestFn();
  }
}

export default function Friends() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading, clerkLoaded, sessionLoaded, clerkUser } = useAuth();

  const [tab, setTab] = useState("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [moreMenuOpen, setMoreMenuOpen] = useState(null);

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [suggestedUsers, setSuggestedUsers] = useState([]);
  const [sentRequests, setSentRequests] = useState(new Set());
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [storiesByUser, setStoriesByUser] = useState([]);
  const [storyViewerGroupIndex, setStoryViewerGroupIndex] = useState(null);
  const [createStoryOpen, setCreateStoryOpen] = useState(false);
  const [creatingStory, setCreatingStory] = useState(false);
  const hasLoadedFriendsRef = useRef(false);
  const viewedStoryIdsRef = useRef(new Set());
  const pendingStoryViewIdsRef = useRef(new Set());

  const hydrateFriendsFromCache = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(FRIENDS_CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw);

      if (!cached || typeof cached !== "object") return false;

      const nextFriends = Array.isArray(cached.friends) ? cached.friends : [];
      const nextRequests = Array.isArray(cached.requests) ? cached.requests : [];
      const nextSuggested = Array.isArray(cached.suggestedUsers) ? cached.suggestedUsers : [];
      const nextSentIds = Array.isArray(cached.sentRequestIds) ? cached.sentRequestIds : [];

      setFriends(nextFriends);
      setRequests(nextRequests);
      setSuggestedUsers(nextSuggested);
      setSentRequests(new Set(nextSentIds));
      hasLoadedFriendsRef.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;

    const handleOutsideClick = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.closest('[data-friend-menu-root="true"]')) {
        setMoreMenuOpen(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [moreMenuOpen]);

  const fetchStories = useCallback(async () => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    const response = await withOneAuthRetry(() => api.get("/stories"));
    const stories = response?.data?.data?.stories || [];
    const locallyViewedStoryIds = viewedStoryIdsRef.current;

    const grouped = [];
    const byUser = new Map();

    stories.forEach((story) => {
      const normalizedStory = {
        ...story,
        has_viewed: Boolean(story.has_viewed) || locallyViewedStoryIds.has(story.id),
      };
      const key = normalizedStory.user_id;
      if (!byUser.has(key)) {
        const group = { user: normalizedStory.user, stories: [] };
        byUser.set(key, group);
        grouped.push(group);
      }
      byUser.get(key).stories.push(normalizedStory);
    });

    grouped.forEach((group) => {
      group.stories.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });

    grouped.sort((a, b) => {
      const aHasUnviewed = a.stories.some((story) => !story.has_viewed);
      const bHasUnviewed = b.stories.some((story) => !story.has_viewed);
      if (aHasUnviewed !== bHasUnviewed) return aHasUnviewed ? -1 : 1;
      const aLatest = a.stories[a.stories.length - 1];
      const bLatest = b.stories[b.stories.length - 1];
      return new Date(bLatest.created_at).getTime() - new Date(aLatest.created_at).getTime();
    });

    setStoriesByUser(grouped);
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id]);

  const fetchFriendsData = useCallback(async () => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    const response = await withOneAuthRetry(() => api.get("/friends"));
    const data = response?.data?.data || {};

    const nextFriends = data.friends || [];
    const nextRequests = data.requests || [];
    const nextSuggested = data.suggestedUsers || [];
    const nextSentIds = data.sentRequestIds || [];

    setFriends(nextFriends);
    setRequests(nextRequests);
    setSuggestedUsers(nextSuggested);
    setSentRequests(new Set(nextSentIds));

    try {
      sessionStorage.setItem(
        FRIENDS_CACHE_KEY,
        JSON.stringify({
          friends: nextFriends,
          requests: nextRequests,
          suggestedUsers: nextSuggested,
          sentRequestIds: nextSentIds,
          at: Date.now(),
        })
      );
    } catch {
      // Non-blocking cache write.
    }

    hasLoadedFriendsRef.current = true;
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id]);

  const fetchFriendsDataWithRetry = useCallback(async (attempts = 4) => {
    let lastError = null;

    for (let i = 0; i < attempts; i += 1) {
      try {
        await fetchFriendsData();
        return;
      } catch (error) {
        lastError = error;
        const retryable = isTransientAuthRace(error) || !error?.response;
        if (!retryable || i >= attempts - 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 350 + i * 250));
      }
    }

    if (lastError) throw lastError;
  }, [fetchFriendsData]);

  const loadFriendsData = useCallback(async ({ showLoader = true, silent = false, attempts = 4 } = {}) => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    const shouldShowLoader = showLoader && !hasLoadedFriendsRef.current;
    if (shouldShowLoader) {
      setLoadingFriends(true);
    }

    try {
      await fetchFriendsDataWithRetry(attempts);
    } catch (error) {
      if (!silent && !isTransientAuthRace(error)) {
        toast.error(error?.response?.data?.message || "Failed to load friends");
      }
    } finally {
      if (shouldShowLoader) {
        setLoadingFriends(false);
      }
    }
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, fetchFriendsDataWithRetry]);

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) {
      setLoadingFriends(false);
      return;
    }

    hydrateFriendsFromCache();
    loadFriendsData({ showLoader: true, silent: true, attempts: 5 });
    fetchStories().catch(() => null);
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, loadFriendsData, fetchStories, hydrateFriendsFromCache]);

  useEffect(() => {
    if (location.pathname !== "/friends") return;
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    let cancelled = false;

    const refreshOnEnter = async () => {
      setSearchQuery("");
      hydrateFriendsFromCache();
      try {
        await loadFriendsData({ showLoader: true, silent: true, attempts: 5 });
        fetchStories().catch(() => null);
      } finally {
        window.setTimeout(() => {
          if (cancelled) return;
          loadFriendsData({ showLoader: false, silent: true, attempts: 2 }).catch(() => null);
          fetchStories().catch(() => null);
        }, 650);
      }
    };

    refreshOnEnter();
    return () => {
      cancelled = true;
    };
  }, [location.pathname, isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, loadFriendsData, fetchStories, hydrateFriendsFromCache]);

  useStoriesRealtime({
    enabled: isAuthenticated && clerkLoaded && sessionLoaded && !!clerkUser?.id,
    onCreated: fetchStories,
    onUpdated: fetchStories,
    onDeleted: fetchStories,
  });

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    const refreshAll = () => {
      loadFriendsData({ showLoader: false, silent: true, attempts: 2 }).catch(() => null);
      fetchStories().catch(() => null);
    };

    const intervalId = window.setInterval(refreshAll, 6000);

    const handleFocus = () => refreshAll();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, loadFriendsData, fetchStories]);

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;

    const socket = getSocket();

    const handleFriendsChanged = () => {
      loadFriendsData({ showLoader: false, silent: true, attempts: 3 }).catch(() => null);
      fetchStories().catch(() => null);
    };

    const handlePresenceStatus = (payload) => {
      const targetUserId = String(payload?.userId || "").trim();
      if (!targetUserId) return;

      const isOnline = !!payload?.isOnline;
      const status = isOnline ? "In a room" : "Offline";

      setFriends((prev) =>
        prev.map((row) =>
          row?.friendProfile?.id === targetUserId
            ? {
                ...row,
                friendProfile: {
                  ...row.friendProfile,
                  is_online: isOnline,
                  status,
                },
              }
            : row
        )
      );

      setRequests((prev) =>
        prev.map((row) =>
          row?.requester?.id === targetUserId
            ? {
                ...row,
                requester: {
                  ...row.requester,
                  is_online: isOnline,
                  status,
                },
              }
            : row
        )
      );

      setSuggestedUsers((prev) =>
        prev.map((row) =>
          row?.id === targetUserId
            ? {
                ...row,
                is_online: isOnline,
                status,
              }
            : row
        )
      );
    };

    socket.on("friends:changed", handleFriendsChanged);
    socket.on("presence:user-status", handlePresenceStatus);

    return () => {
      socket.off("friends:changed", handleFriendsChanged);
      socket.off("presence:user-status", handlePresenceStatus);
    };
  }, [isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, loadFriendsData, fetchStories]);

  useEffect(() => {
    if (!isAuthenticated || !clerkLoaded || !sessionLoaded || !clerkUser?.id) return;
    if (tab === "friends") {
      loadFriendsData({ showLoader: false, silent: true, attempts: 2 }).catch(() => null);
      fetchStories().catch(() => null);
      return;
    }
    if (tab === "requests" || tab === "discover") {
      loadFriendsData({ showLoader: false, silent: true, attempts: 2 }).catch(() => null);
    }
  }, [tab, isAuthenticated, clerkLoaded, sessionLoaded, clerkUser?.id, loadFriendsData, fetchStories]);

  const handleAcceptRequest = async (friendshipId, name) => {
    try {
      await api.patch(`/friends/requests/${friendshipId}/accept`);
      toast.success(`${name} is now your friend!`);
      await fetchFriendsData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to accept request");
    }
  };

  const handleDeclineRequest = async (friendshipId, name) => {
    try {
      await api.delete(`/friends/requests/${friendshipId}/decline`);
      toast(`Declined request from ${name}`, { duration: 1800 });
      await fetchFriendsData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to decline request");
    }
  };

  const handleAddFriend = async (targetUserId, name) => {
    try {
      await api.post("/friends/requests", { targetUserId });
      toast.success(`Friend request sent to ${name}!`);
      setSentRequests((prev) => new Set(prev).add(targetUserId));
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send request");
    }
  };

  const handleUndoRequest = async (targetUserId) => {
    try {
      await api.delete(`/friends/requests/${targetUserId}`);
      setSentRequests((prev) => {
        const next = new Set(prev);
        next.delete(targetUserId);
        return next;
      });
      toast("Request canceled", { duration: 1600 });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to cancel request");
    }
  };

  const handleRemoveFriend = async (friendshipId, name) => {
    try {
      await api.delete(`/friends/${friendshipId}`);
      toast(`Removed ${name} from friends`, { duration: 1800 });
      setMoreMenuOpen(null);
      await fetchFriendsData();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to remove friend");
    }
  };

  const handleOpenDM = (friendId) => {
    navigate(`/messages?partner=${friendId}`);
  };

  const handleCopyProfile = () => {
    navigator.clipboard.writeText(`${window.location.origin}/profile`);
    toast.success("Profile link copied!");
    setMoreMenuOpen(null);
  };

  const handleInviteToRoom = async (friend) => {
    const targetUserId = friend?.id;
    const targetName = friend?.display_name || friend?.username || "friend";
    const roomCode = String(localStorage.getItem("syncplay:last-room-code") || "").trim().toUpperCase();

    if (!targetUserId) {
      toast.error("Invalid friend profile");
      return;
    }

    if (!roomCode) {
      toast.error("No active room found", {
        description: "Open a room first, then invite friends from here.",
      });
      return;
    }

    try {
      await api.post(`/rooms/${roomCode}/invite`, { userIds: [targetUserId] });
      toast.success(`Invite sent to ${targetName}`);
      setMoreMenuOpen(null);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send invite");
    }
  };

  const handleCreateStory = async ({ mode, files, caption, textContent, backgroundColor }) => {
    try {
      setCreatingStory(true);

      if (mode === "media") {
        const uploadFiles = Array.isArray(files) ? files.filter(Boolean) : [];
        if (uploadFiles.length === 0) {
          toast.error("Please select at least one photo or video");
          return;
        }

        for (const mediaFile of uploadFiles) {
          const formData = new FormData();
          formData.append("media", mediaFile);
          if (caption) formData.append("caption", caption);

          await api.post("/stories", formData, {
            headers: {
              "Content-Type": "multipart/form-data",
            },
          });
        }

        toast.success(uploadFiles.length === 1 ? "Story shared" : `${uploadFiles.length} stories shared`);
      } else {
        const formData = new FormData();
        formData.append("textContent", textContent || "");
        formData.append("backgroundColor", backgroundColor || "#111827");

        await api.post("/stories", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        toast.success("Story shared");
      }

      setCreateStoryOpen(false);
      await fetchStories();
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to share story");
    } finally {
      setCreatingStory(false);
    }
  };

  const handleViewStory = async (storyId) => {
    if (!storyId) return;
    if (viewedStoryIdsRef.current.has(storyId)) return;
    if (pendingStoryViewIdsRef.current.has(storyId)) return;

    viewedStoryIdsRef.current.add(storyId);
    pendingStoryViewIdsRef.current.add(storyId);

    setStoriesByUser((prev) =>
      prev.map((group) => ({
        ...group,
        stories: group.stories.map((story) =>
          story.id === storyId
            ? {
                ...story,
                has_viewed: true,
              }
            : story
        ),
      }))
    );

    try {
      await api.post(`/stories/${storyId}/view`);
    } catch {
      // Non-blocking for UX.
    } finally {
      pendingStoryViewIdsRef.current.delete(storyId);
    }
  };

  const handleDeleteStory = async (storyId) => {
    if (!storyId) return;

    setStoriesByUser((prev) =>
      prev
        .map((group) => ({
          ...group,
          stories: group.stories.filter((story) => story.id !== storyId),
        }))
        .filter((group) => group.stories.length > 0)
    );

    try {
      await api.delete(`/stories/${storyId}`);
      viewedStoryIdsRef.current.delete(storyId);
      pendingStoryViewIdsRef.current.delete(storyId);
      toast.success("Story deleted");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to delete story");
      await fetchStories();
    }
  };

  const handleReactStory = async (storyId, reaction) => {
    try {
      await api.post(`/stories/${storyId}/reactions`, { reaction });
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to react to story");
    }
  };

  const handleReplyStory = async (storyId, text) => {
    try {
      await api.post(`/stories/${storyId}/replies`, { text });
      toast.success("Reply sent");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to reply to story");
      throw error;
    }
  };

  const filteredFriends = useMemo(
    () => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return friends;

      return friends.filter((f) => {
        const displayName = f.friendProfile?.display_name || "";
        const username = f.friendProfile?.username || "";
        return displayName.toLowerCase().includes(q) || username.toLowerCase().includes(q);
      });
    },
    [friends, searchQuery]
  );

  const allOnlineFriends = friends.filter((f) => f.friendProfile?.is_online);
  const onlineFriends = filteredFriends.filter((f) => f.friendProfile?.is_online);
  const offlineFriends = filteredFriends.filter((f) => !f.friendProfile?.is_online);
  const activeStoriesCount = storiesByUser.reduce((count, group) => count + group.stories.length, 0);
  const incomingRequestsCount = requests.length;

  if (!isLoading && !isAuthenticated) {
    return (
      <div className="container mx-auto px-4 lg:px-8 max-w-3xl">
        <main className="pb-12 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground mb-2">Sign in to see your friends</h2>
            <p className="text-sm text-muted-foreground mb-6">Connect with people and watch together.</p>
            <Button onClick={() => navigate("/sign-in")} className="bg-primary text-primary-foreground">
              Sign In
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl bg-primary/20" />
        <div className="absolute top-56 -left-20 h-72 w-72 rounded-full blur-3xl bg-secondary/15" />
      </div>

      <div className="container mx-auto px-4 lg:px-8 max-w-4xl relative z-10">
        <div className="mb-8 rounded-3xl border border-border/70 bg-[linear-gradient(140deg,hsl(var(--card)/0.98),hsl(var(--muted)/0.14))] p-6 md:p-7 shadow-xl shadow-black/10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold mb-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Social Hub
              </p>
              <h1 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
                <span className="text-foreground">Your </span>
                <span className="text-gradient-friends">Circle</span>
              </h1>
              <p className="text-muted-foreground text-sm mt-2 max-w-lg">Catch stories, chat with your people, and jump into rooms together in real time.</p>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <Button onClick={() => setCreateStoryOpen(true)} className="rounded-xl gap-2 h-11 px-4 bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] text-primary-foreground shadow-lg">
                <Camera className="w-4 h-4" />
                Create Story
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3 mt-5">
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.12em]">Online</p>
              <p className="text-xl font-bold text-foreground mt-1">{allOnlineFriends.length}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.12em]">Stories</p>
              <p className="text-xl font-bold text-foreground mt-1">{activeStoriesCount}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.12em]">Requests</p>
              <p className="text-xl font-bold text-foreground mt-1">{incomingRequestsCount}</p>
            </div>
          </div>
        </div>

        <StoriesRow
          storiesByUser={storiesByUser}
          currentUserId={clerkUser?.id || null}
          currentUserName={clerkUser?.fullName || clerkUser?.username || "You"}
          onOpenStoryByUserId={(userId) => {
            const idx = storiesByUser.findIndex((group) => group.user.id === userId);
            if (idx >= 0) setStoryViewerGroupIndex(idx);
          }}
          onCreateStory={() => setCreateStoryOpen(true)}
        />

      <div className="flex gap-1.5 p-1.5 bg-card/60 border border-border/70 rounded-2xl mb-5 backdrop-blur">
        {TABS.map((t) => {
          const count = t === "friends" ? friends.length : t === "requests" ? requests.length : undefined;
          const active = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-3 text-sm font-medium transition-all relative rounded-xl capitalize">
              {active && <motion.div layoutId="friends-tab" className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] rounded-xl" />}
              <span className={`relative z-10 ${active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t}
                {typeof count === "number" && count > 0 && (
                  <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>{count}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mb-8">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or username..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-11 bg-card/70 border-border/70 rounded-2xl h-12 focus-visible:ring-primary/40"
        />
      </div>

      <AnimatePresence mode="wait">
        {tab === "friends" && (
          <motion.div key="friends" variants={container} initial="hidden" animate="show" exit={{ opacity: 0 }} className="space-y-2">
            {loadingFriends && friends.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">Loading...</div>
            ) : (
              <>
                {onlineFriends.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Online</p>}
                {onlineFriends.map((friendRow) => {
                  const friend = friendRow.friendProfile;
                  return (
                    <motion.div key={friendRow.id} variants={item} className="bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.08))] border border-border/70 rounded-2xl p-4 flex items-center gap-4 hover:border-primary/40 transition-colors shadow-lg shadow-black/5">
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl relative">{friend.avatar_emoji || "🧑"}
                        {friend.is_online ? <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-secondary border-2 border-card" /> : null}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{friend.display_name}</p>
                        <p className="text-xs text-muted-foreground">@{friend.username}</p>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => handleOpenDM(friend.id)}>
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      <div className="relative" data-friend-menu-root="true">
                        <Button size="icon" variant="ghost" onClick={() => setMoreMenuOpen(moreMenuOpen === friendRow.id ? null : friendRow.id)}>
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                        <AnimatePresence>
                          {moreMenuOpen === friendRow.id && (
                            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl p-1 z-30" onMouseDown={(e) => e.stopPropagation()}>
                              <button onClick={() => handleInviteToRoom(friend)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/50 rounded-lg">
                                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" /> Invite to Room
                              </button>
                              <button onClick={handleCopyProfile} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-muted/50 rounded-lg">
                                <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Copy Profile Link
                              </button>
                              <div className="my-1 h-px bg-border" />
                              <button onClick={() => handleRemoveFriend(friendRow.id, friend.display_name)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 rounded-lg">
                                <UserMinus className="w-3.5 h-3.5" /> Remove Friend
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}

                {offlineFriends.length > 0 && <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-6 mb-2">Offline</p>}
                {offlineFriends.map((friendRow) => {
                  const friend = friendRow.friendProfile;
                  return (
                    <motion.div key={friendRow.id} variants={item} className="bg-card/40 border border-border/60 rounded-2xl p-4 flex items-center gap-4 opacity-70 hover:opacity-85 transition-opacity">
                      <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center text-2xl">{friend.avatar_emoji || "🧑"}</div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm truncate">{friend.display_name}</p>
                        <p className="text-xs text-muted-foreground">{friend.status || "Offline"}</p>
                      </div>
                    </motion.div>
                  );
                })}

                {filteredFriends.length === 0 && (
                  <motion.div variants={item} className="text-center py-20">
                    <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                    <p className="text-muted-foreground">No friends found</p>
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}

        {tab === "requests" && (
          <motion.div key="requests" variants={container} initial="hidden" animate="show" exit={{ opacity: 0 }} className="space-y-3">
            {requests.length === 0 ? (
              <motion.div variants={item} className="text-center py-20">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No pending requests</p>
              </motion.div>
            ) : (
              requests.map((req) => (
                <motion.div key={req.id} variants={item} className="bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--primary)/0.06))] border border-border/70 rounded-2xl p-4 flex items-center gap-4 shadow-lg shadow-black/5">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center text-2xl">{req.requester.avatar_emoji || "🧑"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-sm">{req.requester.display_name}</p>
                    <p className="text-xs text-muted-foreground">@{req.requester.username} • {timeAgo(req.created_at)}</p>
                  </div>
                  <Button size="sm" className="h-9 rounded-xl bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] text-primary-foreground" onClick={() => handleAcceptRequest(req.id, req.requester.display_name)}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Accept
                  </Button>
                  <Button size="icon" variant="ghost" className="h-9 w-9" onClick={() => handleDeclineRequest(req.id, req.requester.display_name)}>
                    <X className="w-4 h-4" />
                  </Button>
                </motion.div>
              ))
            )}
          </motion.div>
        )}

        {tab === "discover" && (
          <motion.div key="discover" variants={container} initial="hidden" animate="show" exit={{ opacity: 0 }}>
            <motion.div variants={item} className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">Suggested for you</p>
            </motion.div>
            {suggestedUsers.length === 0 ? (
              <motion.div variants={item} className="text-center py-20">
                <Globe className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No suggestions available</p>
              </motion.div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {suggestedUsers.map((suggested) => (
                  <motion.div key={suggested.id} variants={item} className="bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--muted)/0.12))] border border-border/70 rounded-2xl p-5 flex flex-col items-center text-center hover:border-primary/35 transition-colors shadow-lg shadow-black/5">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center text-2xl mb-3">{suggested.avatar_emoji || "🧑"}</div>
                    <p className="font-semibold text-foreground text-sm">{suggested.display_name}</p>
                    <p className="text-xs text-muted-foreground mb-3">@{suggested.username}</p>
                    {sentRequests.has(suggested.id) ? (
                      <Button size="sm" variant="outline" className="w-full" onClick={() => handleUndoRequest(suggested.id)}>
                        <Check className="w-3.5 h-3.5 mr-1" /> Request Sent
                      </Button>
                    ) : (
                      <Button size="sm" className="w-full bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] text-primary-foreground" onClick={() => handleAddFriend(suggested.id, suggested.display_name)}>
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Add Friend
                      </Button>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {storyViewerGroupIndex !== null && storiesByUser[storyViewerGroupIndex] && (
        <StoryViewer
          storiesByUser={storiesByUser}
          startGroupIndex={storyViewerGroupIndex}
          currentUserId={clerkUser?.id || null}
          onClose={() => setStoryViewerGroupIndex(null)}
          onViewStory={handleViewStory}
          onReactStory={handleReactStory}
          onReplyStory={handleReplyStory}
          onDeleteStory={handleDeleteStory}
        />
      )}

      <CreateStoryDialog
        open={createStoryOpen}
        onClose={() => setCreateStoryOpen(false)}
        onSubmit={handleCreateStory}
        submitting={creatingStory}
      />
      </div>
    </div>
  );
}