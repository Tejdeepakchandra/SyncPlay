import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback when AuthProvider is not mounted (no Clerk key configured)
    return { user: null, profile: null, isLoaded: true, isSignedIn: false };
  }
  return ctx;
}
