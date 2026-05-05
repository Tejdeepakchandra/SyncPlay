/**
 * Recent Rooms — localStorage-based quick-rejoin system
 * 
 * Stores rooms the user has recently created/joined for fast re-entry.
 * Auto-expires entries older than 24 hours.
 * Max 8 entries per room type.
 */

const STORAGE_KEY = "syncplay_recent_rooms";
const MAX_ENTRIES = 8;
const EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter expired entries
    const now = Date.now();
    return parsed.filter((entry) => now - entry.lastVisited < EXPIRY_MS);
  } catch {
    return [];
  }
}

function saveAll(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {}
}

/**
 * Save a room to recent history.
 * Called when user successfully joins or creates a room.
 */
export function saveRecentRoom({ roomCode, name, type, hostName, hostEmoji, role, privacy }) {
  if (!roomCode) return;

  const entries = loadAll();
  // Remove existing entry for this room (will re-add at top)
  const filtered = entries.filter((e) => e.roomCode !== roomCode);

  filtered.unshift({
    roomCode,
    name: name || "Untitled Room",
    type: type || "movie",
    hostName: hostName || "Host",
    hostEmoji: hostEmoji || "🧑",
    role: role || "participant",
    privacy: privacy || "public",
    lastVisited: Date.now(),
  });

  // Cap at MAX_ENTRIES
  saveAll(filtered.slice(0, MAX_ENTRIES));
}

/**
 * Get recent rooms, optionally filtered by type.
 * Returns newest first.
 */
export function getRecentRooms(type = null) {
  const entries = loadAll();
  if (type) {
    return entries.filter((e) => e.type === type);
  }
  return entries;
}

/**
 * Remove a specific room from history (e.g., when room ends).
 */
export function removeRecentRoom(roomCode) {
  const entries = loadAll();
  saveAll(entries.filter((e) => e.roomCode !== roomCode));
}

/**
 * Clear all recent rooms.
 */
export function clearRecentRooms() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
