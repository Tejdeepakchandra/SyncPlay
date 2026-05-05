import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  Users,
  Clock,
  Film,
  MessageCircle,
  ExternalLink,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import api from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

function formatWatchTime(minutes) {
  if (!minutes || minutes < 1) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, clerkUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFriend, setIsFriend] = useState(false);

  useEffect(() => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    api
      .get(`/users/${userId}`)
      .then((res) => {
        setProfile(res?.data?.data || null);
      })
      .catch((err) => {
        setError(err?.response?.data?.message || "User not found");
      })
      .finally(() => setLoading(false));
  }, [userId]);

  // Check friendship status
  useEffect(() => {
    if (!isAuthenticated || !userId || !clerkUser?.id) return;
    if (userId === clerkUser.id) {
      setIsFriend(false); // Can't be friends with yourself
      return;
    }

    api
      .get("/friends")
      .then((res) => {
        const friends = res?.data?.data?.friends || [];
        const found = friends.some(
          (f) => f?.friendProfile?.id === userId
        );
        setIsFriend(found);
      })
      .catch(() => setIsFriend(false));
  }, [isAuthenticated, userId, clerkUser?.id]);

  const handleMessage = () => {
    if (!isAuthenticated) {
      toast.error("Sign in to message this user");
      return;
    }
    navigate(`/messages?partner=${userId}`);
  };

  const handleInvite = async () => {
    const roomCode = String(localStorage.getItem("syncplay:last-room-code") || "").trim().toUpperCase();
    if (!roomCode) {
      toast.error("No active room found", {
        description: "Open a room first, then invite friends from here.",
      });
      return;
    }
    try {
      await api.post(`/rooms/${roomCode}/invite`, { userIds: [userId] });
      toast.success(`Invite sent to ${profile?.display_name || "user"}`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to send invite");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground mb-2">User not found</h2>
            <p className="text-sm text-muted-foreground mb-6">{error || "This profile doesn't exist or has been removed."}</p>
            <Button onClick={() => navigate(-1)} variant="outline">
              <ChevronLeft className="w-4 h-4 mr-1" /> Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isOwnProfile = clerkUser?.id === userId;

  return (
    <div className="relative">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full blur-3xl bg-primary/20" />
        <div className="absolute top-56 -left-20 h-72 w-72 rounded-full blur-3xl bg-secondary/15" />
      </div>

      <div className="container mx-auto px-4 max-w-2xl relative z-10">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl border border-border/70 bg-[linear-gradient(140deg,hsl(var(--card)/0.98),hsl(var(--muted)/0.14))] p-6 md:p-8 shadow-xl shadow-black/10 mb-6"
        >
          <div className="flex flex-col items-center text-center">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-4xl mb-4 relative">
              {profile.avatar_emoji || "🧑"}
              {profile.is_online && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-secondary border-[3px] border-card" />
              )}
            </div>

            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-1">
              {profile.display_name}
            </h1>
            <p className="text-sm text-muted-foreground mb-1">@{profile.username}</p>

            {/* Online status */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
              <span className={`h-2 w-2 rounded-full ${profile.is_online ? "bg-secondary" : "bg-muted-foreground/40"}`} />
              {profile.is_online ? "Online now" : "Offline"}
              {isFriend && (
                <span className="ml-2 inline-flex items-center gap-1 text-secondary">
                  <UserCheck className="w-3 h-3" /> Friend
                </span>
              )}
            </div>

            {/* Bio */}
            {profile.bio && (
              <p className="text-sm text-foreground/80 max-w-sm mb-5">{profile.bio}</p>
            )}

            {/* Action buttons */}
            {isAuthenticated && !isOwnProfile && (
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleMessage}
                  className="rounded-xl gap-2 h-10 px-5 bg-[linear-gradient(90deg,hsl(var(--primary)),hsl(var(--secondary)))] text-primary-foreground shadow-lg"
                >
                  <MessageCircle className="w-4 h-4" />
                  Message
                </Button>
                <Button
                  onClick={handleInvite}
                  variant="outline"
                  className="rounded-xl gap-2 h-10 px-5 border-border/70"
                >
                  <ExternalLink className="w-4 h-4" />
                  Invite to Room
                </Button>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 mb-6"
        >
          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Film className="w-5 h-5 text-primary" />
            </div>
            <p className="text-xl font-bold text-foreground">{profile.stats?.roomsCreated || 0}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Rooms Created</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center mx-auto mb-2">
              <Users className="w-5 h-5 text-secondary" />
            </div>
            <p className="text-xl font-bold text-foreground">{profile.stats?.roomsJoined || 0}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Rooms Joined</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <p className="text-xl font-bold text-foreground">
              {formatWatchTime(profile.stats?.watchTimeMinutes || 0)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">Watch Time</p>
          </div>
        </motion.div>

        {/* Info callout — context-aware */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-border/60 bg-card/40 p-5 text-center"
        >
          {isFriend ? (
            <>
              <UserCheck className="w-5 h-5 text-secondary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                You and{" "}
                <span className="text-foreground font-medium">{profile.display_name}</span>{" "}
                are friends! Check their stories on the{" "}
                <button onClick={() => navigate("/friends")} className="text-primary hover:underline font-medium">Friends page</button>.
              </p>
            </>
          ) : isOwnProfile ? (
            <>
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                This is your profile.{" "}
                <button onClick={() => navigate("/profile")} className="text-primary hover:underline font-medium">View full profile</button>
              </p>
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 text-primary mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                This is a limited public profile. Add{" "}
                <span className="text-foreground font-medium">{profile.display_name}</span>{" "}
                as a friend to see their stories and activity.
              </p>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
