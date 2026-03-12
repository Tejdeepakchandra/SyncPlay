import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

const NOOP = async () => {};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // Fallback when AuthProvider is not mounted (no Clerk key configured)
    return { user: null, profile: null, isLoaded: true, isSignedIn: false, loading: false, signOut: NOOP };
  }
  return ctx;
}
