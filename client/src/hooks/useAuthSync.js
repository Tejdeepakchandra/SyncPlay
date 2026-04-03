import { useEffect, useRef } from "react";
import { useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import api from "@/services/api";
import { connectSocket, disconnectSocket } from "@/services/socket";

/**
 * Bridges Clerk authentication with the backend:
 * - Attaches fresh Clerk session tokens to every API request (axios interceptor)
 * - Connects Socket.IO with the auth token
 * - Syncs user profile to MongoDB on first sign-in
 *
 * Must be rendered inside <ClerkProvider>.
 */
export function useAuthSync() {
  const { getToken, isSignedIn } = useClerkAuth();
  const { user: clerkUser, isLoaded } = useUser();
  const syncedRef = useRef(false);

  // Axios interceptor: attach fresh Clerk token to every outgoing request
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

  // Socket connection: connect with token on sign-in, disconnect on sign-out
  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      getToken()
        .then((token) => {
          if (token) connectSocket(token);
        })
        .catch(() => {});
    } else {
      disconnectSocket();
    }
  }, [isLoaded, isSignedIn, getToken]);

  // User sync: upsert user in MongoDB once per session
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser || syncedRef.current) return;

    syncedRef.current = true;

    console.log('🔄 Syncing user to MongoDB:', clerkUser.id);
    
    api
      .post("/auth/sync", {
        email: clerkUser.emailAddresses?.[0]?.emailAddress,
        username: clerkUser.username,
        displayName: clerkUser.fullName,
        imageUrl: clerkUser.imageUrl,
      })
      .then((res) => {
        console.log('✅ User synced to MongoDB:', res.data);
      })
      .catch((err) => {
        console.warn("❌ Auth sync failed:", err.message);
        syncedRef.current = false; // allow retry
      });
  }, [isLoaded, isSignedIn, clerkUser]);

  // Reset sync flag on sign-out
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      syncedRef.current = false;
    }
  }, [isLoaded, isSignedIn]);
}
