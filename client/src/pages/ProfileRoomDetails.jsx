import { useEffect, useMemo, useState } from "react";
import { Clock3, Film, MessageSquare, Music, Shield, Sparkles, Users } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ProfilePageHeader } from "@/components/profile/ProfilePageHeader";
import { formatMinutes, normalizeRoomType, relativeTime } from "@/lib/profileUi";
import api from "@/services/api";

export default function ProfileRoomDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();

  const roomCode = useMemo(() => {
    try {
      return decodeURIComponent(String(params.roomCode || "")).trim().toUpperCase();
    } catch {
      return String(params.roomCode || "").trim().toUpperCase();
    }
  }, [params.roomCode]);

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    if (!roomCode) {
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    (async () => {
      try {
        const res = await api.get(`/users/me/activity/room/${encodeURIComponent(roomCode)}`);
        if (!mounted) return;
        const data = res?.data?.data || {};
        setRoom(data.room || null);
        setParticipants(data.participants || []);
      } catch {
        if (!mounted) return;
        setRoom(null);
        setParticipants([]);
        toast.error("Failed to load room details");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [roomCode]);

  const goBack = () => {
    if (location.state?.from) {
      navigate(location.state.from, { state: { profileNavDirection: "back" } });
      return;
    }

    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/profile/activity", { state: { profileNavDirection: "back" } });
  };

  const openRoom = () => {
    const code = room?.roomCode || roomCode;
    if (!code) {
      toast("No room available");
      return;
    }

    if (normalizeRoomType(room?.type) === "music") {
      navigate(`/music/room/${code}`);
      return;
    }

    navigate(`/room/${code}`);
  };

  const privacyLabel = room?.settings?.privacy || "public";

  return (
    <main className="pb-12 pt-2 md:pt-3">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <ProfilePageHeader
          onBack={goBack}
          layoutId={`profile-room-details-${roomCode || "unknown"}`}
          icon={Users}
          title={room?.name || "Room details"}
          subtitle={roomCode ? `Full analytics for ${roomCode}` : "Full room analytics"}
          accentLabel="Room"
          glowClass="bg-primary/20"
          iconBgClass="bg-primary"
        />

        {loading ? (
          <section className="rounded-3xl border border-border bg-card p-4 md:p-5 space-y-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-16 rounded-xl border border-border bg-muted/20 animate-pulse" />
            ))}
          </section>
        ) : !room ? (
          <section className="rounded-3xl border border-border bg-card p-10 text-center">
            <Sparkles className="w-7 h-7 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Room details are not available for this room.</p>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="rounded-3xl border border-border bg-card p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-primary/80 mb-1">Room analytics</p>
                  <h2 className="font-display text-xl md:text-2xl font-bold text-foreground">{room.name}</h2>
                  <p className="text-sm text-muted-foreground">{room.roomCode}</p>
                </div>

                <button
                  onClick={openRoom}
                  className="h-10 px-4 rounded-xl border border-primary/35 text-sm font-semibold text-primary bg-primary/10 hover:bg-primary/20"
                >
                  Open Room
                </button>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Type</p>
                  <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5 capitalize">
                    {normalizeRoomType(room.type) === "music" ? <Music className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                    {room.type}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Status</p>
                  <p className="text-sm font-semibold text-foreground capitalize">{room.status}</p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Privacy</p>
                  <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5 capitalize">
                    <Shield className="w-3.5 h-3.5" />
                    {privacyLabel}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Participants</p>
                  <p className="text-sm font-semibold text-foreground">{room.participantCount}</p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Room Time</p>
                  <p className="text-sm font-semibold text-foreground">{formatMinutes(room.stats?.totalRoomMinutes)}</p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Total Watch Time</p>
                  <p className="text-sm font-semibold text-foreground">{formatMinutes(room.stats?.totalWatchTimeMinutes)}</p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Messages</p>
                  <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5" />
                    {room.stats?.messages || 0}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-3">
                  <p className="text-[11px] text-muted-foreground">Moments</p>
                  <p className="text-sm font-semibold text-foreground">{room.stats?.moments || 0}</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-4 md:p-5">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-foreground">Participants and time spent</h3>
                <p className="text-xs text-muted-foreground">Who joined and how long they stayed in this room session.</p>
              </div>

              {participants.length === 0 ? (
                <div className="rounded-xl border border-border bg-muted/20 p-5 text-sm text-muted-foreground text-center">
                  No participants recorded.
                </div>
              ) : (
                <div className="space-y-2">
                  {participants.map((participant) => (
                    <div
                      key={`${participant.userId}-${participant.joinedAt}`}
                      className="rounded-xl border border-border bg-[linear-gradient(130deg,hsl(var(--card)/0.92),hsl(var(--background)/0.7))] p-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full border border-border bg-muted/30 overflow-hidden flex items-center justify-center text-sm">
                          {participant.avatar ? (
                            <img src={participant.avatar} alt={participant.displayName} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <span>{participant.avatarEmoji || "🧑"}</span>
                          )}
                        </div>
                        <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                            {participant.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate capitalize">
                            {participant.role} • joined {participant.joinedAt ? relativeTime(participant.joinedAt) : "unknown"}
                        </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-foreground inline-flex items-center gap-1">
                          <Clock3 className="w-3.5 h-3.5" />
                          {formatMinutes(participant.timeSpentMinutes)}
                        </p>
                        {participant.lastActive && (
                          <p className="text-[11px] text-muted-foreground">active {relativeTime(participant.lastActive)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {participants.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs uppercase tracking-[0.14em] text-primary/80 mb-2">All participants</p>
                  <div className="flex flex-wrap gap-2">
                    {participants.map((participant) => (
                      <div
                        key={`avatar-${participant.userId}-${participant.joinedAt}`}
                        className="w-10 h-10 rounded-full border border-border bg-muted/30 overflow-hidden flex items-center justify-center"
                        title={participant.displayName}
                      >
                        {participant.avatar ? (
                          <img src={participant.avatar} alt={participant.displayName} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <span className="text-sm">{participant.avatarEmoji || "🧑"}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
