import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Film, Music, Users, User } from "lucide-react";

const tabs = [
  { to: "/", icon: Home, label: "Home", theme: "default" },
  { to: "/movies", icon: Film, label: "Movies", theme: "movie" },
  { to: "/music", icon: Music, label: "Music", theme: "music" },
  { to: "/friends", icon: Users, label: "Friends", theme: "friends" },
  { to: "/profile", icon: User, label: "Profile", theme: "default" },
];

export default function MobileNav() {
  const location = useLocation();

  const getThemeColor = (path) => {
    if (path.includes('/movies')) return 'text-primary';
    if (path.includes('/music')) return 'text-secondary';
    if (path.includes('/friends')) return 'text-friends';
    return 'text-primary';
  };

  return (
    <motion.nav
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="fixed bottom-0 left-0 right-0 z-50 md:hidden glass-nav border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const active = location.pathname === tab.to;
          const activeColor = getThemeColor(tab.to);
          
          return (
            <Link key={tab.to} to={tab.to}>
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className={`flex flex-col items-center gap-0.5 text-[10px] font-medium transition-colors ${
                  active ? activeColor : "text-muted-foreground"
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </motion.div>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}