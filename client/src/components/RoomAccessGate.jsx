import { motion } from "framer-motion";
import { Lock, LogIn, ChevronLeft, AlertTriangle, WifiOff, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const RoomAccessGate = ({ status, roomType = "movie" }) => {
  const navigate = useNavigate();

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Connecting to room...</p>
          <p className="text-xs text-muted-foreground">Setting up a secure connection to the server</p>
        </motion.div>
      </div>
    );
  }

  if (status === "granted") return null;

  const configs = {
    not_found: {
      icon: <AlertTriangle className="w-7 h-7 text-destructive" />,
      title: "Room Not Found",
      description: "This room doesn't exist or has been deleted.",
      showSignIn: false,
    },
    private_no_invite: {
      icon: <Lock className="w-7 h-7 text-primary" />,
      title: "Private Room",
      description: "This room is invite-only. Ask the host for an invite.",
      showSignIn: false,
    },
    needs_auth: {
      icon: <LogIn className="w-7 h-7 text-primary" />,
      title: "Sign In Required",
      description: "You need to sign in to join this private room.",
      showSignIn: true,
    },
    error: {
      icon: <WifiOff className="w-7 h-7 text-destructive" />,
      title: "Connection Failed",
      description: "Couldn't connect to the server. Please check your internet connection and try again.",
      showSignIn: false,
      showRetry: true,
    },
    rejected: {
      icon: <XCircle className="w-7 h-7 text-destructive" />,
      title: "Access Denied",
      description: "The host has denied your request to join this room.",
      showSignIn: false,
    },
  };

  const config = configs[status] || configs.error;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-sm"
      >
        <div className="w-16 h-16 rounded-2xl bg-muted border border-border flex items-center justify-center mx-auto mb-5">
          {config.icon}
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">{config.title}</h2>
        <p className="text-sm text-muted-foreground mb-6">{config.description}</p>
        <div className="flex flex-col gap-3">
          {config.showRetry && (
            <Button
              onClick={() => window.location.reload()}
              className={`w-full ${roomType === "music" ? "gradient-music" : "gradient-movie"} text-primary-foreground font-semibold`}
            >
              Try Again
            </Button>
          )}
          {config.showSignIn && (
            <Button
              onClick={() => navigate("/auth")}
              className={`w-full ${roomType === "music" ? "gradient-music" : "gradient-movie"} text-primary-foreground font-semibold`}
            >
              <LogIn className="w-4 h-4 mr-2" />
              Sign In
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => navigate(roomType === "music" ? "/music" : "/movies")}
            className="w-full border-border"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default RoomAccessGate;