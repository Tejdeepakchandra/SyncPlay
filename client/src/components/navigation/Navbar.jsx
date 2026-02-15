import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Film, Music, Users, Bell, User, Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavbarAnimation } from "@/hooks/useNavbarAnimation";

const navLinks = [
  { to: "/movies", label: "Movies", icon: Film, theme: "movie" },
  { to: "/music", label: "Music", icon: Music, theme: "music" },
  { to: "/friends", label: "Friends", icon: Users, theme: "friends" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isVisible, currentTheme, navigateWithAnimation } = useNavbarAnimation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavigation = (to) => (e) => {
    e.preventDefault();
    setMobileOpen(false);
    navigateWithAnimation(navigate, to);
  };

  // Theme colors mapping
 const themeColors = {
  movie: {
    text: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    gradient: "gradient-movie",
    logoHover: "group-hover:text-primary",
    logoColor: "text-primary",
    glow: "glow-movie",
    hoverGlow: "hover-glow-movie",
  },
  music: {
    text: "text-secondary",
    bg: "bg-secondary/10",
    border: "border-secondary/20",
    gradient: "gradient-music",
    logoHover: "group-hover:text-secondary",
    logoColor: "text-secondary",
    glow: "glow-music",
    hoverGlow: "hover-glow-music",
  },
  friends: {
    text: "text-friends",
    bg: "bg-friends/10",
    border: "border-friends/20",
    gradient: "gradient-friends",
    logoHover: "group-hover:text-friends",
    logoColor: "text-friends",
    glow: "glow-friends",
    hoverGlow: "hover-glow-friends",
  },
  default: {
    text: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/20",
    gradient: "gradient-movie",
    logoHover: "group-hover:text-primary",
    logoColor: "text-foreground",
    glow: "glow-movie",
    hoverGlow: "hover-glow-movie",
  },
};

  const theme = themeColors[currentTheme] || themeColors.default;

  // Get logo gradient based on current theme
  // Get logo gradient based on current theme
const getLogoGradient = () => {
  if (currentTheme === 'music') return 'gradient-music';
  if (currentTheme === 'movie') return 'gradient-movie';
  if (currentTheme === 'friends') return 'gradient-friends';
  return 'gradient-movie'; // Default for landing page
};



// Get logo hover color based on current theme
const getLogoHover = () => {
  if (currentTheme === 'music') return 'group-hover:text-secondary';
  if (currentTheme === 'friends') return 'group-hover:text-friends';
  if (currentTheme === 'movie') return 'group-hover:text-primary';
  return 'group-hover:text-primary'; // Default for landing page
};

  return (
    <AnimatePresence mode="wait">
      {isVisible && (
        <motion.header
          key="navbar"
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          exit={{ y: -100 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
          className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
            scrolled ? "glass-nav shadow-lg" : "bg-transparent"
          }`}
        >
          <div className="container mx-auto flex items-center justify-between h-16 px-4 lg:px-8">
            {/* Logo */}
            <Link 
              to="/" 
              onClick={handleNavigation("/")}
              className="flex items-center gap-2 group"
            >
              <motion.div
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
                className={`w-8 h-8 rounded-lg ${getLogoGradient()} flex items-center justify-center`}
              >
                <span className="text-primary-foreground font-bold text-sm">▶</span>
              </motion.div>
              <span className={`font-display font-bold text-xl text-foreground transition-colors ${getLogoHover()}`}>
                SyncPlay
              </span>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => {
                const active = location.pathname === link.to;
                const linkTheme = themeColors[link.theme];
                
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={handleNavigation(link.to)}
                  >
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
                        active
                          ? `${linkTheme.text} ${linkTheme.bg}`
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      <link.icon className="w-4 h-4" />
                      {link.label}
                    </motion.div>
                  </Link>
                );
              })}
            </nav>

            {/* Right side */}
            <div className="hidden md:flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors relative"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary animate-pulse" />
              </motion.button>
              
              <Link to="/signin" onClick={handleNavigation("/signin")}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-foreground bg-muted hover:bg-muted/80 transition-colors"
                >
                  <User className="w-4 h-4" />
                  Sign In
                </motion.div>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 text-foreground"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {mobileOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="md:hidden glass-nav border-t border-border overflow-hidden"
              >
                <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
                  {navLinks.map((link) => {
                    const active = location.pathname === link.to;
                    const linkTheme = themeColors[link.theme];
                    
                    return (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={handleNavigation(link.to)}
                      >
                        <motion.div
                          whileHover={{ x: 5 }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                            active
                              ? `${linkTheme.text} ${linkTheme.bg}`
                              : "text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <link.icon className="w-5 h-5" />
                          {link.label}
                        </motion.div>
                      </Link>
                    );
                  })}
                  <Link to="/signin" onClick={() => {
                    setMobileOpen(false);
                    handleNavigation("/signin")();
                  }}>
                    <motion.div
                      whileHover={{ x: 5 }}
                      className="flex items-center gap-3 px-4 py-3 rounded-lg text-primary font-medium hover:bg-primary/5 transition-colors"
                    >
                      <User className="w-5 h-5" />
                      Sign In
                    </motion.div>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.header>
      )}
    </AnimatePresence>
  );
}