import { Link, useLocation } from "react-router-dom";
import { Home, Film, Music, Users, User, LogIn } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/movies", icon: Film, label: "Movies" },
  { to: "/music", icon: Music, label: "Music" },
  { to: "/friends", icon: Users, label: "Friends" },
];

export default function MobileNav() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const profileTab = isAuthenticated
    ? { to: "/profile", icon: User, label: "Profile" }
    : { to: "/sign-in", icon: LogIn, label: "Sign In" };
  const allTabs = [...tabs, profileTab];

  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-50 md:hidden glass-nav border-t border-border mobile-nav-fixed nav-fixed-stable nav-fixed-bottom"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="grid grid-cols-5 items-center h-16">
        {allTabs.map((tab) => {
          const active = location.pathname === tab.to;
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors relative ${
                active ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon className="w-5 h-5" />
              {tab.label}
              {active && (
                <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}