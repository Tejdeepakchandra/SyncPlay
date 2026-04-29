import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

const GuestNameDialog = ({ roomName, onJoinAsGuest, onSignIn, isLoading = false }) => {
  const [guestName, setGuestName] = useState("");
  const _navigate = useNavigate();

  const handleJoinAsGuest = () => {
    if (guestName.trim().length < 2) {
      alert("Please enter a name (at least 2 characters)");
      return;
    }
    onJoinAsGuest(guestName.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-background border border-border rounded-lg p-6 max-w-sm w-full"
      >
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Users className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Join Room</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {roomName && `Room: ${roomName}`}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Your Name
            </label>
            <Input
              placeholder="Enter your name..."
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleJoinAsGuest()}
              disabled={isLoading}
              autoFocus
              className="bg-muted border-border"
            />
          </div>

          <Button
            onClick={handleJoinAsGuest}
            disabled={isLoading || guestName.trim().length < 2}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isLoading ? (
              <>
                <span className="inline-block animate-spin mr-2">⏳</span>
                Joining...
              </>
            ) : (
              <>
                <Users className="w-4 h-4 mr-2" />
                Join as Guest
              </>
            )}
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="px-2 bg-background text-muted-foreground">Or</span>
            </div>
          </div>

          <Button
            onClick={onSignIn}
            variant="outline"
            disabled={isLoading}
            className="w-full border-border"
          >
            <LogIn className="w-4 h-4 mr-2" />
            Sign In to SyncPlay
          </Button>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Sign in to capture moments, save rooms, and get full access to all features.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default GuestNameDialog;
