import { Link, useLocation } from "react-router-dom";
import { Home, Film, Music, Users, MessageSquare } from "lucide-react";
import NotificationDropdown from "@/components/NotificationDropdown";
import { useAuth } from "@/hooks/useAuth";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/movies", icon: Film, label: "Movies" },
  { to: "/music", icon: Music, label: "Music" },
  { to: "/friends", icon: Users, label: "Friends" },
  { to: "/messages", icon: MessageSquare, label: "Messages" },
];

export default function MobileNav() {
  const location = useLocation();
  const { user } = useAuth();

  return (
    <nav
      className="fixed left-0 right-0 bottom-0 z-50 md:hidden glass-nav border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
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
        {user && <NotificationDropdown variant="mobile" />}
      </div>
    </nav>
  );
}