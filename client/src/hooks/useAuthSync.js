import { useEffect, useRef } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import api from "@/services/api";
import { connectSocket, disconnectSocket } from "@/services/socket";

/**
 * Bridges Clerk authentication with the backend:
 * - Creates guest socket for unauthenticated users (instant)
 * - Transitions to authenticated socket when user signs in
 * - Syncs user profile to MongoDB (in parallel, not blocking socket)
 * - Handles guest ↔ user socket transitions
 *
 * Must be rendered inside <ClerkProvider>.
 */
export function useAuthSync() {
  const { getToken, isSignedIn } = useClerkAuth();
  const { user: clerkUser, isLoaded } = useUser();
  const syncedRef = useRef(false);
  const previousSignInStateRef = useRef(null);

  // ✅ FIX 1: Axios interceptor setup (unchanged)
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    const id = api.interceptors.request.use(async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // Token fetch failed — request proceeds without auth header
      }
      return config;
    });

    return () => api.interceptors.request.eject(id);
  }, [isLoaded, isSignedIn, getToken]);

  // ✅ FIX 2: Main socket management flow
  // Handles:
  // - Create guest socket on first load (instant)
  // - Transition guest → user socket on sign in (no delay)
  // - Transition user → guest socket on sign out
  useEffect(() => {
    if (!isLoaded) return;

    const currentSignInState = isSignedIn;

    // ✅ CASE 1: User just signed in
    if (currentSignInState && !previousSignInStateRef.current) {
      console.log('🔄 User signed in - transitioning to authenticated socket');
      
      // Get token and connect authenticated socket (DON'T WAIT FOR SYNC)
      getToken()
        .then((token) => {
          if (token) {
            console.log('🔌 Connecting authenticated socket...');
            connectSocket(token);
          }
        })
        .catch((err) => {
          console.error('Failed to get token:', err.message);
        });

      // Sync user to MongoDB in background (non-blocking)
      if (clerkUser && !syncedRef.current) {
        syncedRef.current = true;
        console.log('🔄 Syncing user to MongoDB (background)...');
        
        api
          .post("/auth/sync", {
            email: clerkUser.emailAddresses?.[0]?.emailAddress,
            username: clerkUser.username,
            displayName: clerkUser.fullName,
            imageUrl: clerkUser.imageUrl,
          })
          .then((res) => {
            console.log('✅ User synced to MongoDB:', res.data?.user?.username);
          })
          .catch((err) => {
            console.warn("⚠️ Auth sync failed (non-blocking):", err.message);
            syncedRef.current = false; // allow retry
          });
      }
    }

    // ✅ CASE 2: User just signed out
    if (!currentSignInState && previousSignInStateRef.current) {
      console.log('🔄 User signed out - transitioning to guest socket');
      syncedRef.current = false; // allow re-sync on next sign in
      
      // Disconnect user socket and create guest socket
      disconnectSocket();
      
      // Create guest socket immediately (no auth needed)
      setTimeout(() => {
        console.log('🔌 Connecting guest socket...');
        connectSocket(null); // null token = guest mode
      }, 300); // Small delay to ensure disconnect completes
    }

    // ✅ CASE 3: Initial load (before any sign in/out)
    if (isLoaded && previousSignInStateRef.current === null) {
      console.log('🔄 Initial app load');
      
      if (!isSignedIn) {
        // First time user - create guest socket immediately
        console.log('🔌 Connecting guest socket (first visit)...');
        connectSocket(null); // null token = guest mode
      }
    }

    previousSignInStateRef.current = currentSignInState;

  }, [isLoaded, isSignedIn, clerkUser, getToken]);

  // ✅ FIX 3: Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional: disconnect socket on component unmount
      // Usually not needed as socket should persist
    };
  }, []);
}
