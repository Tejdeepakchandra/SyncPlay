import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Film, Music, Users, User, Menu, X, MessageSquare, LogIn, LogOut } from "lucide-react";
import NotificationDropdown from "@/components/NotificationDropdown";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";

const navLinks = [
  { to: "/movies", label: "Movies", icon: Film },
  { to: "/music", label: "Music", icon: Music },
  { to: "/friends", label: "Friends", icon: Users },
];

export default function Navbar({ unreadDmCount = 0 }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  const location = useLocation();
  const navigate = useNavigate();
  const notifRef = useRef(null);
  const { user, clerkUser, isAuthenticated, signOut } = useAuth();
  const messagesActive = location.pathname.startsWith("/messages");

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const onChange = (e) => setIsMobileViewport(e.matches);

    setIsMobileViewport(mql.matches);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }

    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      if (isMobileViewport) {
        setScrolled(true);
        return;
      }
      const y = window.scrollY;
      setScrolled((prev) => {
        if (!prev && y > 24) return true;
        if (prev && y < 10) return false;
        return prev;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isMobileViewport]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 nav-fixed-stable nav-fixed-top transition-colors duration-300 ${
        isMobileViewport || scrolled ? "glass-nav shadow-lg" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg gradient-movie flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">▶</span>
          </div>
          <span className="font-display font-bold text-xl text-foreground group-hover:text-primary transition-colors">
            SyncPlay
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const active = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <link.icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side – desktop */}
        <div className="hidden md:flex items-center gap-2">
          {isAuthenticated && (
            <>
              <button
                onClick={() => navigate("/messages")}
                className={`p-2 rounded-lg transition-colors relative ${
                  messagesActive
                    ? "text-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                {unreadDmCount > 0 && !messagesActive && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>

              <div className="relative" ref={notifRef}>
                <NotificationDropdown variant="desktop" />
              </div>
            </>
          )}

          {isAuthenticated ? (
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
              >
                <span className="text-base">🧑</span>
                {user?.name || clerkUser?.fullName || "Profile"}
              </Link>
              <button
                onClick={async () => { await signOut(); navigate("/"); }}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/sign-in"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium gradient-movie text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Link>
          )}
        </div>

        {/* Mobile top actions: notifications, messages, menu */}
        <div className="md:hidden flex items-center gap-1">
          {isAuthenticated && (
            <>
              <button
                onClick={() => navigate("/messages")}
                className={`p-2 rounded-lg transition-colors relative ${
                  messagesActive
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
                title="Messages"
              >
                <MessageSquare className="w-5 h-5" />
                {unreadDmCount > 0 && !messagesActive && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>

              <NotificationDropdown variant="top-mobile" />
            </>
          )}

          <button className="p-2 text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass-nav border-t border-border overflow-hidden"
          >
            <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
              <Link
                to="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted/50 transition-colors"
              >
                <span className="text-base">🏠</span>
                Home
              </Link>

              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-muted/50 transition-colors"
                >
                  <link.icon className="w-5 h-5" />
                  {link.label}
                </Link>
              ))}
              {isAuthenticated ? (
                <>
                  <Link to="/messages" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${messagesActive ? "text-primary bg-primary/10" : "text-foreground hover:bg-muted/50"}`}>
                    <MessageSquare className="w-5 h-5" />
                    Messages
                    {unreadDmCount > 0 && !messagesActive && (
                      <span className="ml-auto w-2 h-2 rounded-full bg-primary animate-pulse" />
                    )}
                  </Link>
                  <Link to="/profile" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-primary font-medium">
                    <User className="w-5 h-5" />
                    Profile
                  </Link>
                  <button onClick={async () => { await signOut(); setMobileOpen(false); navigate("/"); }} className="flex items-center gap-3 px-4 py-3 rounded-lg text-destructive hover:bg-muted/50 transition-colors">
                    <LogOut className="w-5 h-5" />
                    Sign Out
                  </button>
                </>
              ) : (
                <Link to="/sign-in" onClick={() => setMobileOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-lg text-primary font-medium">
                  <LogIn className="w-5 h-5" />
                  Sign In
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}