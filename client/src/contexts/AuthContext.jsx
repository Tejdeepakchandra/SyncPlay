import { createContext, useMemo, useCallback } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const clerk = useClerk();

  const signOut = useCallback(async () => {
    await clerk.signOut();
  }, [clerk]);

  const value = useMemo(() => {
    if (!isLoaded) {
      return { user: null, profile: null, isLoaded: false, isSignedIn: false, loading: true, signOut };
    }

    if (!isSignedIn || !clerkUser) {
      return { user: null, profile: null, isLoaded: true, isSignedIn: false, loading: false, signOut };
    }

    const user = {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress,
      username: clerkUser.username,
      fullName: clerkUser.fullName,
      imageUrl: clerkUser.imageUrl,
    };

    const profile = {
      display_name: clerkUser.fullName || clerkUser.username || "User",
      username: clerkUser.username || "",
      avatar_emoji: "😎",
      is_online: true,
    };

    return { user, profile, isLoaded: true, isSignedIn: true, loading: false, signOut };
  }, [isLoaded, isSignedIn, clerkUser, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
