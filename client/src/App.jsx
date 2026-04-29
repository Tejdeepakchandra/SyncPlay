import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuthSync } from "@/hooks/useAuthSync";
import { useThemeStore } from "@/stores/themeStore";
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
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme || "midnight-cinema");
  }, [theme]);

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
        appearance={{
          variables: {
            colorPrimary: "#00c3ff",
            colorBackground: "#111827",
            colorInputBackground: "#1a2332",
            colorInputText: "#e5e7eb",
            colorText: "#e5e7eb",
            colorTextSecondary: "#9ca3af",
            colorDanger: "#ef4444",
            colorSuccess: "#10b981",
            colorWarning: "#f59e0b",
            colorNeutral: "#e5e7eb",
            borderRadius: "0.75rem",
            fontFamily: "'Inter', system-ui, sans-serif",
          },
          elements: {
            rootBox: "mx-auto",
            card: "bg-[#111827] border border-[#1e293b] shadow-2xl rounded-2xl",
            headerTitle: "text-[#e5e7eb]",
            headerSubtitle: "text-[#9ca3af]",
            socialButtonsBlockButton: "bg-[#1a2332] border-[#1e293b] text-[#e5e7eb] hover:bg-[#1e293b]",
            socialButtonsBlockButtonText: "text-[#e5e7eb]",
            dividerLine: "bg-[#1e293b]",
            dividerText: "text-[#6b7280]",
            formFieldLabel: "text-[#d1d5db]",
            formFieldInput: "bg-[#1a2332] border-[#2d3748] text-[#e5e7eb] placeholder:text-[#6b7280]",
            formButtonPrimary: "bg-[#00c3ff] hover:bg-[#00a8d6] text-[#0a0e17]",
            formFieldAction: "text-[#00c3ff]",
            footerActionLink: "text-[#00c3ff] hover:text-[#00a8d6]",
            footerActionText: "text-[#9ca3af]",
            identityPreviewText: "text-[#e5e7eb]",
            identityPreviewEditButton: "text-[#00c3ff]",
            formResendCodeLink: "text-[#00c3ff]",
            otpCodeFieldInput: "bg-[#1a2332] border-[#2d3748] text-[#e5e7eb]",
            alertText: "text-[#e5e7eb]",
            formFieldErrorText: "text-[#ef4444]",
            formFieldSuccessText: "text-[#10b981]",
            userButtonPopoverCard: "bg-[#111827] border-[#1e293b]",
            userButtonPopoverActionButton: "text-[#e5e7eb] hover:bg-[#1a2332]",
            userButtonPopoverActionButtonText: "text-[#e5e7eb]",
            userButtonPopoverFooter: "border-[#1e293b]",
            modalBackdrop: "bg-black/60 backdrop-blur-sm",
          },
        }}
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