import { createContext, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();

  const value = useMemo(() => {
    if (!isLoaded) {
      return { user: null, profile: null, isLoaded: false, isSignedIn: false };
    }

    if (!isSignedIn || !clerkUser) {
      return { user: null, profile: null, isLoaded: true, isSignedIn: false };
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

    return { user, profile, isLoaded: true, isSignedIn: true };
  }, [isLoaded, isSignedIn, clerkUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
