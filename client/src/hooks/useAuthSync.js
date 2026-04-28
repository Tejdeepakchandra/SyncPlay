import { useCallback, useEffect, useRef } from "react";
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

  const syncUserProfile = useCallback((token) => {
    if (!token || !clerkUser || syncedRef.current) return;

    syncedRef.current = true;

    api
      .post(
        "/auth/sync",
        {
          email: clerkUser.emailAddresses?.[0]?.emailAddress,
          username: clerkUser.username,
          displayName: clerkUser.fullName,
          imageUrl: clerkUser.imageUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      .then((res) => {
      })
      .catch((err) => {
        syncedRef.current = false;
      });
  }, [clerkUser]);

  // ✅ FIX 2: Main socket management flow
  // Handles:
  // - Create guest socket on first load (instant)
  // - Transition guest → user socket on sign in (no delay)
  // - Transition user → guest socket on sign out
  useEffect(() => {
    if (!isLoaded) return;

    const currentSignInState = isSignedIn;

    const connectAuthenticated = () => {
      getToken()
        .then((token) => {
          if (!token) return;
          connectSocket(token);
          syncUserProfile(token);
        })
        .catch((err) => {
          console.error('Failed to get token:', err.message);
        });
    };

    // ✅ CASE 1: User just signed in
    if (currentSignInState && !previousSignInStateRef.current) {
      connectAuthenticated();
    }

    // ✅ CASE 2: User just signed out
    if (!currentSignInState && previousSignInStateRef.current) {
      syncedRef.current = false; // allow re-sync on next sign in
      
      // Disconnect user socket and create guest socket
      disconnectSocket();
      
      // Create guest socket immediately (no auth needed)
      setTimeout(() => {
        connectSocket(null); // null token = guest mode
      }, 300); // Small delay to ensure disconnect completes
    }

    // ✅ CASE 3: Initial load (before any sign in/out)
    if (isLoaded && previousSignInStateRef.current === null) {

      if (isSignedIn) {
        // First load while already signed in - connect authenticated socket immediately.
        connectAuthenticated();
      } else {
        // First time user - create guest socket immediately
        connectSocket(null); // null token = guest mode
      }
    }

    previousSignInStateRef.current = currentSignInState;

  }, [isLoaded, isSignedIn, clerkUser, getToken, syncUserProfile]);

  // ✅ FIX 3: Cleanup on unmount
  useEffect(() => {
    return () => {
      // Optional: disconnect socket on component unmount
      // Usually not needed as socket should persist
    };
  }, []);
}
