import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3001";

let socketInstance = null;
let connectionInitiated = false; // ✅ Track if connect() was called

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
      console.log('🔌 Socket connection already initiated with same auth state, skipping duplicate');
      return socket;
    }
    // Different token - need to reconnect for transition
    console.log('🔌 Auth state changed, reconnecting socket...');
    socket.disconnect();
    connectionInitiated = false;
  }
  
  // Also check if already connected with same auth
  if (socket.connected && socket.auth?.token === token) {
    console.log('🔌 Socket already connected with same auth');
    return socket;
  }
  
  // Update auth (or set to guest mode if null)
  if (token) {
    socket.auth = { token };
    console.log('🔌 Initiating authenticated socket connection...');
  } else {
    socket.auth = {}; // Empty auth = guest mode
    console.log('🔌 Initiating guest socket connection...');
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
    console.log('🔌 Disconnecting socket...');
    connectionInitiated = false; // ✅ Reset so new connection can be made
    socketInstance.disconnect();
  } else if (socketInstance) {
    connectionInitiated = false; // Reset flag even if not connected
  }
}
