export function normalizeRoomType(type) {
  const t = String(type || "").toLowerCase();
  return t.includes("music") ? "music" : "movie";
}

export function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just now";
  const diffMs = Date.now() - date.getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatMinutes(minutes) {
  const total = Math.max(0, Number(minutes) || 0);
  const hrs = Math.floor(total / 60);
  const mins = total % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}
