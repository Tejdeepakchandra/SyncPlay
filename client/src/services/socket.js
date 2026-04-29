import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

let socketInstance = null;
let connectionInitiated = false; // ✅ Track if connect() was called

/**
 * Generate a unique guest ID for this browser window/tab
 * Each tab gets a unique ID, even from the same IP
 * Stored in sessionStorage so it persists for the tab's lifetime
 */
function generateUniqueGuestId() {
  const storageKey = 'syncplay_guest_id';
  
  // Check if we already have a guest ID for this session
  let guestId = sessionStorage.getItem(storageKey);
  
  if (!guestId) {
    // Generate new unique ID: random 12-char hex string
    const randomBytes = new Uint8Array(6);
    crypto.getRandomValues(randomBytes);
    const randomHex = Array.from(randomBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    guestId = `guest-${randomHex}`;
    sessionStorage.setItem(storageKey, guestId);
  } else {
  }
  
  return guestId;
}

/**
 * Get the shared Socket.IO client instance (singleton).
 * Connects lazily on first call.
 */
export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    
    // Reset flag when socket disconnects
    socketInstance.on('disconnect', () => {
      connectionInitiated = false;
    });
  }
  return socketInstance;
}

/**
 * Connect with an auth token (or null for guest mode).
 * ✅ Safe to call multiple times - prevents duplicate connection attempts
 * ✅ Handles both authenticated and guest connections
 */
export function connectSocket(token) {
  const socket = getSocket();
  
  // ✅ FIX: Skip if we've already called connect() on this socket instance
  // This prevents React StrictMode double-effects from creating multiple connections
  if (connectionInitiated) {
    // But allow guest→user or user→guest transitions
    if (socket.auth?.token === token) {
      // Same token/mode - skip
      return socket;
    }
    // Different token - need to reconnect for transition
    socket.disconnect();
    connectionInitiated = false;
  }
  
  // Also check if already connected with same auth
  if (socket.connected && socket.auth?.token === token) {
    return socket;
  }
  
  // Update auth (or set to guest mode if null)
  if (token) {
    socket.auth = { token };
  } else {
    // For guest mode, include unique guest ID
    const guestId = generateUniqueGuestId();
    socket.auth = { guestId }; // Send unique guest ID to server
  }
  
  connectionInitiated = true;
  socket.connect();
  return socket;
}

/**
 * Disconnect the socket.
 * ✅ Clears the connection flag so a new socket can be created
 */
export function disconnectSocket() {
  if (socketInstance?.connected) {
    connectionInitiated = false; // ✅ Reset so new connection can be made
    socketInstance.disconnect();
  } else if (socketInstance) {
    connectionInitiated = false; // Reset flag even if not connected
  }
}

/**
 * Singleton export for easy access
 * Use: import { socket } from "@/services/socket"
 */
export const socket = {
  emit: (...args) => getSocket().emit(...args),
  on: (...args) => getSocket().on(...args),
  off: (...args) => getSocket().off(...args),
  connect: () => connectSocket(),
  disconnect: () => disconnectSocket(),
  get connected() {
    return getSocket().connected;
  },
  get userId() {
    return getSocket().userId;
  },
  get isGuest() {
    return getSocket().isGuest;
  },
};
