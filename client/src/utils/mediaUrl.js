/**
 * Resolves a media URL from the server.
 * Server-stored paths like `/uploads/stories/file.mp4` need the server origin prepended
 * when the client runs on a different port/domain.
 */
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SERVER_ORIGIN = API_URL.replace(/\/api\/?$/, '');

export function resolveMediaUrl(url) {
  if (!url) return null;
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) {
    return url;
  }
  // Relative server path like /uploads/stories/...
  return `${SERVER_ORIGIN}${url}`;
}
