import { useEffect, useMemo, useState } from "react";
import { Bookmark, Check, Film, Heart, Star, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/services/api";
import { FavoriteRoomCard } from "@/components/profile/cards/FavoriteRoomCard";
import { ProfileFilterTabs } from "@/components/profile/ProfileFilterTabs";
import { ProfileLoadMoreFooter } from "@/components/profile/ProfileLoadMoreFooter";
import { ProfilePageHeader } from "@/components/profile/ProfilePageHeader";
import { normalizeRoomType, relativeTime } from "@/lib/profileUi";

const PAGE_SIZE = 12;

export default function ProfileFavorites() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("rooms");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [removingKeys, setRemovingKeys] = useState(new Set());
  const [favorites, setFavorites] = useState({ rooms: [], moments: [], activities: [] });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get("/users/me/favorites");
        setFavorites(res?.data?.data?.favorites || { rooms: [], moments: [], activities: [] });
      } catch {
        toast.error("Failed to load favorites");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [tab]);

  const activeItems = useMemo(() => {
    if (tab === "moments") return favorites.moments || [];
    if (tab === "activities") return favorites.activities || [];
    return favorites.rooms || [];
  }, [favorites, tab]);

  const visibleItems = useMemo(() => activeItems.slice(0, visibleCount), [activeItems, visibleCount]);

  const openRoom = (roomCode, type) => {
    if (!roomCode) {
      toast("No room available");
      return;
    }

    if (normalizeRoomType(type) === "music") {
      navigate(`/music/room/${roomCode}`);
      return;
    }

    navigate(`/room/${roomCode}`);
  };

  const openRoomDetails = (roomCode) => {
    if (!roomCode) {
      toast("No room available");
      return;
    }

    const query = new URLSearchParams({
      from: "favorites",
      tab,
    });

    navigate(`/profile/room/${encodeURIComponent(roomCode)}?${query.toString()}`, {
      state: {
        profileNavDirection: "forward",
        from: `${location.pathname}${location.search}`,
      },
    });
  };

  const removeFavorite = async (bucket, itemKey) => {
    const key = `${bucket}:${itemKey}`;
    setRemovingKeys((prev) => new Set(prev).add(key));
    try {
      const encodedKey = encodeURIComponent(itemKey);
      const res = await api.delete(`/users/me/favorites/${bucket}/${encodedKey}`);
      setFavorites(res?.data?.data?.favorites || favorites);
      toast.success("Removed from favorites");
    } catch {
      toast.error("Failed to remove favorite");
    } finally {
      setRemovingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  return (
    <main className="pb-12 pt-2 md:pt-3">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <ProfilePageHeader
          onBack={() => navigate("/profile", { state: { profileNavDirection: "back" } })}
          layoutId="profile-card-favorites"
          icon={Heart}
          title="Favorites"
          subtitle="Your saved rooms, moments, and activity highlights with better control."
          glowClass="bg-accent/20"
          iconBgClass="bg-accent"
        />

        <ProfileFilterTabs
          tabs={[
            { key: "rooms", label: "Rooms", count: favorites.rooms?.length || 0, icon: Film },
            { key: "moments", label: "Moments", count: favorites.moments?.length || 0, icon: Bookmark },
            { key: "activities", label: "Activities", count: favorites.activities?.length || 0, icon: Star },
          ]}
          activeKey={tab}
          onChange={setTab}
          columnsClass="grid-cols-3"
        />

        <section className="rounded-3xl border border-border bg-card p-3 md:p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-20 rounded-2xl border border-border bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
              No favorites in this section yet.
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {tab === "rooms" && visibleItems.map((room) => {
                  const removeKey = `rooms:${room.roomCode}`;
                  const isRemoving = removingKeys.has(removeKey);

                  return (
                    <FavoriteRoomCard
                      key={`${room.roomCode}-${room.addedAt}`}
                      room={room}
                      isRemoving={isRemoving}
                      onDetails={() => openRoomDetails(room.roomCode)}
                      onOpen={() => openRoom(room.roomCode, room.type)}
                      onRemove={() => removeFavorite("rooms", room.roomCode)}
                    />
                  );
                })}

                {tab === "moments" && visibleItems.map((moment) => {
                  const removeKey = `moments:${moment.momentId}`;
                  const isRemoving = removingKeys.has(removeKey);

                  return (
                    <div key={`${moment.momentId}-${moment.addedAt}`} className="rounded-2xl border border-border bg-[linear-gradient(130deg,hsl(var(--card)/0.92),hsl(var(--background)/0.7))] p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-foreground truncate">{moment.title || "Moment"}</p>
                          <p className="text-xs text-muted-foreground">Room: {moment.roomCode || "No room"}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">Saved {relativeTime(moment.addedAt)}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          {moment.roomCode && (
                            <button onClick={() => openRoomDetails(moment.roomCode)} className="h-8 px-3 rounded-lg border border-primary/35 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20">Details</button>
                          )}
                          <button
                            onClick={() => removeFavorite("moments", moment.momentId)}
                            disabled={isRemoving}
                            className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                          >
                            {isRemoving ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                            {isRemoving ? "Removing" : "Remove"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {tab === "activities" && visibleItems.map((activity) => {
                  const removeKey = `activities:${activity.activityId}`;
                  const isRemoving = removingKeys.has(removeKey);

                  return (
                    <div key={`${activity.activityId}-${activity.addedAt}`} className="rounded-2xl border border-border bg-[linear-gradient(130deg,hsl(var(--card)/0.92),hsl(var(--background)/0.7))] p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[15px] font-semibold text-foreground truncate">{activity.label}</p>
                          <p className="text-xs text-muted-foreground">{activity.type}</p>
                          <p className="text-[11px] text-muted-foreground mt-1">Saved {relativeTime(activity.addedAt)}</p>
                        </div>

                        <button
                          onClick={() => removeFavorite("activities", activity.activityId)}
                          disabled={isRemoving}
                          className="h-8 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 inline-flex items-center gap-1"
                        >
                          {isRemoving ? <Check className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                          {isRemoving ? "Removing" : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <ProfileLoadMoreFooter
                shown={visibleItems.length}
                total={activeItems.length}
                canLoadMore={visibleItems.length < activeItems.length}
                loadingMore={false}
                onLoadMore={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
