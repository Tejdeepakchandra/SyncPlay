import { useEffect, useMemo, useState } from "react";
import { Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/services/api";
import { AchievementCard } from "@/components/profile/cards/AchievementCard";
import { ProfileFilterTabs } from "@/components/profile/ProfileFilterTabs";
import { ProfileLoadMoreFooter } from "@/components/profile/ProfileLoadMoreFooter";
import { ProfilePageHeader } from "@/components/profile/ProfilePageHeader";

const PAGE_SIZE = 8;

export default function ProfileAchievements() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [data, setData] = useState({
    summary: { unlocked: 0, total: 0, completionPercent: 0 },
    metrics: {},
    achievements: [],
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get("/users/me/achievements");
        if (!mounted) return;
        setData({
          summary: res?.data?.data?.summary || { unlocked: 0, total: 0, completionPercent: 0 },
          metrics: res?.data?.data?.metrics || {},
          achievements: res?.data?.data?.achievements || [],
        });
      } catch {
        if (mounted) toast.error("Failed to load achievements");
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredAchievements = useMemo(() => {
    const list = data.achievements || [];
    if (activeFilter === "unlocked") return list.filter((item) => item.unlocked);
    if (activeFilter === "locked") return list.filter((item) => !item.unlocked);
    return list;
  }, [data.achievements, activeFilter]);

  const visibleAchievements = useMemo(() => filteredAchievements.slice(0, visibleCount), [filteredAchievements, visibleCount]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeFilter]);

  return (
    <main className="pb-12 pt-2 md:pt-3">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <ProfilePageHeader
          onBack={() => navigate("/profile", { state: { profileNavDirection: "back" } })}
          layoutId="profile-card-achievements"
          icon={Award}
          title="Achievements"
          subtitle="Track progress, milestones, and unlock streak-based trophies."
          glowClass="bg-primary/20"
          iconBgClass="bg-friends"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Unlocked</p>
            <p className="font-display text-lg font-bold text-foreground">{data.summary?.unlocked || 0}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Completion</p>
            <p className="font-display text-lg font-bold text-foreground">{data.summary?.completionPercent || 0}%</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Watch Hours</p>
            <p className="font-display text-lg font-bold text-foreground">{data.metrics?.watchHours || 0}h</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[11px] text-muted-foreground">Friends</p>
            <p className="font-display text-lg font-bold text-foreground">{data.metrics?.friends || 0}</p>
          </div>
        </div>

        <ProfileFilterTabs
          tabs={[
            { key: "all", label: "All" },
            { key: "unlocked", label: "Unlocked" },
            { key: "locked", label: "Locked" },
          ]}
          activeKey={activeFilter}
          onChange={setActiveFilter}
          columnsClass="grid-cols-3"
        />

        <section className="rounded-3xl border border-border bg-card p-3 md:p-4">
          {loading ? (
            <div className="grid md:grid-cols-2 gap-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-28 rounded-2xl border border-border bg-muted/20 animate-pulse" />
              ))}
            </div>
          ) : visibleAchievements.length === 0 ? (
            <div className="rounded-2xl border border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
              No achievements found for this filter.
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                {visibleAchievements.map((achievement) => (
                  <AchievementCard key={achievement.id} achievement={achievement} />
                ))}
              </div>

              <ProfileLoadMoreFooter
                shown={visibleAchievements.length}
                total={filteredAchievements.length}
                canLoadMore={visibleAchievements.length < filteredAchievements.length}
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
