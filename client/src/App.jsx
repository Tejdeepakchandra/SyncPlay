import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthSync } from "@/hooks/useAuthSync";
import { AppRouter } from "./router/AppRouter";

const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function AppInner() {
  return (
    <TooltipProvider>
      <Toaster />
      <Sonner position="top-right" closeButton />
      <BrowserRouter>
        <AppRouter />
      </BrowserRouter>
    </TooltipProvider>
  );
}

/** Runs inside ClerkProvider to bridge auth with backend */
function AuthSyncBridge({ children }) {
  useAuthSync();
  return children;
}

function App() {
  // When no Clerk key is configured, render without Clerk/Auth
  if (!CLERK_KEY) {
    return (
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ClerkProvider
        publishableKey={CLERK_KEY}
        signInUrl="/sign-in"
        signUpUrl="/sign-up"
      >
        <AuthProvider>
          <AuthSyncBridge>
            <AppInner />
          </AuthSyncBridge>
        </AuthProvider>
      </ClerkProvider>
    </QueryClientProvider>
  );
}

export default App;