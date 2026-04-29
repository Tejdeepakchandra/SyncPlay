import { useEffect, useMemo, useState } from "react";
import { Bell, Clock, Film, Music, Sparkles, Users } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/services/api";
import { useAuth } from "@/hooks/useAuth";
import { ActivityItemCard } from "@/components/profile/cards/ActivityItemCard";
import { ProfileFilterTabs } from "@/components/profile/ProfileFilterTabs";
import { ProfileLoadMoreFooter } from "@/components/profile/ProfileLoadMoreFooter";
import { ProfilePageHeader } from "@/components/profile/ProfilePageHeader";
import { relativeTime } from "@/lib/profileUi";

const PAGE_SIZE = 16;

const activityCategoryMeta = {
  movie: { label: "Movie", icon: Film, className: "text-primary", badgeClass: "bg-primary/15 text-primary border-primary/30" },
  music: { label: "Music", icon: Music, className: "text-secondary", badgeClass: "bg-secondary/15 text-secondary border-secondary/30" },
  social: { label: "Social", icon: Users, className: "text-accent", badgeClass: "bg-accent/15 text-accent border-accent/30" },
  system: { label: "System", icon: Bell, className: "text-muted-foreground", badgeClass: "bg-muted/30 text-muted-foreground border-border" },
};

export default function ProfileActivity() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clerkLoaded, sessionLoaded, isAuthenticated } = useAuth();
  const authReady = clerkLoaded && sessionLoaded && isAuthenticated;

  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activityFilter, setActivityFilter] = useState("all");
  const [savingIds, setSavingIds] = useState(new Set());
  const [savedIds, setSavedIds] = useState(new Set());

  const [activityData, setActivityData] = useState({
    summary: { total: 0, movie: 0, music: 0, social: 0, system: 0 },
    timeline: [],
    pagination: { page: 1, totalPages: 1, hasNextPage: false, totalItems: 0 },
  });

  const chips = useMemo(
    () => [
      { key: "all", label: "All", count: activityData.summary?.total ?? 0 },
      { key: "movie", label: "Movie", count: activityData.summary?.movie ?? 0 },
      { key: "music", label: "Music", count: activityData.summary?.music ?? 0 },
      { key: "social", label: "Social", count: activityData.summary?.social ?? 0 },
      { key: "system", label: "System", count: activityData.summary?.system ?? 0 },
    ],
    [activityData.summary]
  );

  useEffect(() => {
    if (!authReady) return;

    let mounted = true;

    (async () => {
      const favoritesRes = await api.get("/users/me/favorites").catch(() => null);
      if (!mounted) return;
      const existing = favoritesRes?.data?.data?.favorites?.activities || [];
      setSavedIds(new Set(existing.map((entry) => String(entry.activityId))));
    })();

    return () => {
      mounted = false;
    };
  }, [authReady]);

  const fetchTimeline = async ({ page, append, filter, retry = false }) => {
    if (!authReady) return;

    if (append) setLoadingMore(true);
    else setInitialLoading(true);

    try {
      const res = await api.get("/users/me/activity", {
        params: {
          page,
          limit: PAGE_SIZE,
          category: filter,
        },
      });

      const data = res?.data?.data || {};
      const nextTimeline = data.timeline || [];
      const nextPagination = data.pagination || { page: 1, totalPages: 1, hasNextPage: false, totalItems: nextTimeline.length };

      setActivityData((prev) => ({
        summary: data.summary || prev.summary,
        timeline: append ? [...prev.timeline, ...nextTimeline] : nextTimeline,
        pagination: nextPagination,
      }));
    } catch {
      if (!retry) {
        window.setTimeout(() => {
          fetchTimeline({ page, append, filter, retry: true }).catch(() => null);
        }, 350);
      } else {
        toast.error("Failed to load activity");
      }
    } finally {
      if (append) setLoadingMore(false);
      else setInitialLoading(false);
    }
  };

  useEffect(() => {
    if (!authReady) return;
    fetchTimeline({ page: 1, append: false, filter: activityFilter }).catch(() => null);
  }, [activityFilter, authReady]);

  const openRoomDetails = (item) => {
    const roomCode = item?.room?.roomCode;
    if (!roomCode) {
      toast("No room linked to this activity");
      return;
    }

    navigate(`/profile/room/${encodeURIComponent(roomCode)}`, {
      state: {
        profileNavDirection: "forward",
        from: `${location.pathname}${location.search}`,
      },
    });
  };

  const addFavoriteActivity = async (item) => {
    const activityId = String(item.id || "");
    if (!activityId || savedIds.has(activityId)) return;

    setSavingIds((prev) => new Set(prev).add(activityId));

    try {
      const res = await api.post("/users/me/favorites/activities", {
        item: {
          activityId,
          label: item.title,
          type: item.type,
        },
      });

      const serverFavorites = res?.data?.data?.favorites?.activities || [];
      if (serverFavorites.length) {
        setSavedIds(new Set(serverFavorites.map((entry) => String(entry.activityId))));
      } else {
        setSavedIds((prev) => new Set(prev).add(activityId));
      }

      toast.success("Saved to favorites");
    } catch {
      toast.error("Failed to save favorite");
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    }
  };

  const loadNextPage = () => {
    if (!activityData.pagination?.hasNextPage || loadingMore) return;
    const nextPage = Number(activityData.pagination.page || 1) + 1;
    fetchTimeline({ page: nextPage, append: true, filter: activityFilter }).catch(() => null);
  };

  return (
    <main className="pb-12 pt-2 md:pt-3">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <ProfilePageHeader
          onBack={() => navigate("/profile", { state: { profileNavDirection: "back" } })}
          layoutId="profile-card-activity"
          icon={Clock}
          title="Activity Feed"
          subtitle="Modern timeline with instant load, pagination, and full room analytics."
          glowClass="bg-secondary/20"
          iconBgClass="bg-secondary"
        />

        <ProfileFilterTabs
          tabs={chips}
          activeKey={activityFilter}
          onChange={setActivityFilter}
          columnsClass="grid-cols-2 md:grid-cols-5"
        />

        <section className="rounded-3xl border border-border bg-card p-3 md:p-4">
          {initialLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="h-[98px] rounded-2xl border border-border bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : activityData.timeline.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-10 text-center">
              <Sparkles className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No activity yet in this category</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {activityData.timeline.map((item, index) => {
                  const meta = activityCategoryMeta[item.category] || activityCategoryMeta.system;
                  const hasRoom = Boolean(item.room?.roomCode);
                  const activityId = String(item.id || "");
                  const isSaving = savingIds.has(activityId);
                  const isSaved = savedIds.has(activityId);

                  return (
                    <ActivityItemCard
                      key={item.id}
                      item={item}
                      meta={meta}
                      hasRoom={hasRoom}
                      isSaving={isSaving}
                      isSaved={isSaved}
                      delay={Math.min(index * 0.015, 0.18)}
                      onDetails={() => openRoomDetails(item)}
                      onSave={() => addFavoriteActivity(item)}
                    />
                  );
                })}
              </div>

              <ProfileLoadMoreFooter
                shown={activityData.timeline.length}
                total={activityData.pagination?.totalItems || activityData.timeline.length}
                canLoadMore={Boolean(activityData.pagination?.hasNextPage)}
                loadingMore={loadingMore}
                onLoadMore={loadNextPage}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
