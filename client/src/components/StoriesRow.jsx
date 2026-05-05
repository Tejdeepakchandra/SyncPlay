import { Plus } from "lucide-react";
import { motion } from "framer-motion";
import { resolveMediaUrl } from "@/utils/mediaUrl";

const stripVariants = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.08 },
  },
};

const bubbleVariants = {
  hidden: { opacity: 1, y: 0, scale: 1 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 24 },
  },
};

function StoryBubble({ group, onOpen, showAddBadge = false, onAddStory }) {
  const latest = group.stories[0];
  const unviewed = group.stories.some((story) => !story.has_viewed);

  return (
    <motion.button
      type="button"
      className="flex-shrink-0 text-center w-[82px] group"
      onClick={onOpen}
      aria-label={`Open ${group.user.display_name} story`}
      variants={bubbleVariants}
      whileHover={{ y: -4, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div
        className={`mx-auto w-16 h-16 rounded-full p-[2px] ${
          unviewed
            ? "bg-[conic-gradient(from_180deg_at_50%_50%,hsl(var(--primary)),hsl(var(--secondary)),hsl(var(--primary)))]"
            : "bg-border"
        }`}
      >
        <div className="w-full h-full rounded-full bg-card flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-95 relative">
          {latest?.media_url && latest.type !== "text" ? (
            <img
              src={resolveMediaUrl(latest.media_url)}
              alt={group.user.display_name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center text-lg font-bold"
              style={{ backgroundColor: latest?.background_color || "#1f2937" }}
            >
              {group.user.display_name?.slice(0, 1)?.toUpperCase() || "U"}
            </div>
          )}

          {showAddBadge && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddStory?.();
              }}
              className="absolute -right-0.5 -bottom-0.5 h-5 w-5 rounded-full bg-primary text-primary-foreground border-2 border-card grid place-items-center"
              aria-label="Add story"
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground truncate">{group.user.display_name}</p>
    </motion.button>
  );
}

function YourStoryBubble({ hasStory, currentUserName, onOpenYourStory, onCreateStory }) {
  const initial = (currentUserName || "Y").slice(0, 1).toUpperCase();

  return (
    <motion.button
      type="button"
      onClick={hasStory ? onOpenYourStory : onCreateStory}
      className="flex-shrink-0 text-center w-[82px] group"
      aria-label={hasStory ? "Open your story" : "Create your story"}
      variants={bubbleVariants}
      whileHover={{ y: -4, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <div
        className={`mx-auto w-16 h-16 rounded-full p-[2px] relative ${
          hasStory
            ? "bg-[conic-gradient(from_180deg_at_50%_50%,hsl(var(--primary)),hsl(var(--secondary)),hsl(var(--primary)))]"
            : "bg-border"
        }`}
      >
        <div className="w-full h-full rounded-full bg-card flex items-center justify-center overflow-hidden">
          <div className="w-full h-full flex items-center justify-center text-xl font-semibold bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.16),hsl(var(--card))_68%)]">
            {initial}
          </div>
        </div>
        <span className="absolute -right-1 -bottom-1 h-6 w-6 rounded-full bg-primary text-primary-foreground border-2 border-card grid place-items-center shadow-md shadow-primary/40">
          <Plus className="w-3.5 h-3.5" />
        </span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Your Story</p>
    </motion.button>
  );
}

export function StoriesRow({
  storiesByUser,
  currentUserId,
  currentUserName,
  onOpenStoryByUserId,
  onCreateStory,
}) {
  const activeStories = storiesByUser.reduce((count, group) => count + group.stories.length, 0);
  const ownGroup = storiesByUser.find((group) => group.user.id === currentUserId) || null;
  const friendGroups = storiesByUser.filter((group) => group.user.id !== currentUserId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-7"
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <p className="text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">Stories</p>
        <p className="text-xs text-muted-foreground">{activeStories} active</p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,hsl(var(--card)/0.96),hsl(var(--muted)/0.12))] p-3">
        <motion.div className="flex items-center gap-3 overflow-x-auto pb-2 no-scrollbar" variants={stripVariants} initial={false} animate="show">
          <YourStoryBubble
            hasStory={!!ownGroup}
            currentUserName={currentUserName}
            onOpenYourStory={() => ownGroup && onOpenStoryByUserId?.(ownGroup.user.id)}
            onCreateStory={onCreateStory}
          />

          {friendGroups.map((group) => (
            <StoryBubble
              key={group.user.id}
              group={group}
              onOpen={() => onOpenStoryByUserId?.(group.user.id)}
            />
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
