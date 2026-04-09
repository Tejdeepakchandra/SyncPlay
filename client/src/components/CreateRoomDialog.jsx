import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Globe, Check, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";
import { toast } from "sonner";

const CreateRoomDialog = ({ open, onClose, type = "movie" }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [roomName, setRoomName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [friends, setFriends] = useState([]);
  const [selectedFriends, setSelectedFriends] = useState([]);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generatedRoomCode, setGeneratedRoomCode] = useState("");

  const roomPath = generatedRoomCode 
    ? (type === "music" ? `/music/room/${generatedRoomCode}` : `/room/${generatedRoomCode}`)
    : "";
  const roomLink = roomPath ? `${window.location.origin}${roomPath}` : "";

  // Validate auth before allowing room creation
  useEffect(() => {
    if (open && !isAuthenticated) {
      // Only show error if we've waited long enough for Clerk to load auth status
      // But don't wait for DB user profile - that's not needed for room creation
      setTimeout(() => {
        if (!isAuthenticated) {
          toast.error("Please sign in to create a room");
          onClose();
        }
      }, 500);
    }
  }, [open, isAuthenticated, onClose]);

  const toggleFriend = (id) => {
    setSelectedFriends(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleCopy = () => {
    if (roomLink) {
      navigator.clipboard.writeText(roomLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCreate = async () => {
    if (isLoading) {
      toast.error("Please wait, still loading your information...");
      return;
    }

    if (!isAuthenticated) {
      toast.error("Please sign in to create a room");
      return;
    }

    if (!roomName.trim()) {
      toast.error("Please enter a room name");
      return;
    }

    setCreating(true);
    try {
      const selectedFriendEntries = friends
        .filter((friend) =>
          selectedFriends.includes(friend.id || friend.userId || friend.clerkId)
        )
        .map((friend) => ({
          userId: friend.userId || friend.clerkId || friend.id || null,
          email: friend.email || friend.emailAddress || friend.primary_email_address || null,
          name: friend.display_name || friend.displayName || friend.username || friend.name || null,
        }));

      // Create room via REST API
      const response = await api.post('/rooms', {
        name: roomName,
        type,
        invitedUsers: selectedFriendEntries,
        settings: {
          privacy: isPrivate ? 'private' : 'public',
          requireApproval: isPrivate,
          allowGuests: true,
          allowChat: true,
          allowReactions: true,
        }
      });

      if (response.data.success) {
        const { roomCode } = response.data.data;
        setGeneratedRoomCode(roomCode);
        setStep(3); // Show share screen
        toast.success(`${type === 'music' ? 'Music' : 'Movie'} room created!`);
      } else {
        throw new Error(response.data.message || 'Failed to create room');
      }
    } catch (err) {
      console.error('Room creation error:', err);
      toast.error(err.response?.data?.message || err.message || "Failed to create room");
    } finally {
      setCreating(false);
    }
  };

  const handleNavigateToRoom = () => {
    if (generatedRoomCode) {
      handleClose();
      navigate(roomPath);
    }
  };

  const handleClose = () => {
    setStep(1);
    setRoomName("");
    setSelectedFriends([]);
    setGeneratedRoomCode("");
    setCopied(false);
    onClose();
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={handleClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative glass-panel p-6 w-full max-w-md z-10"
        >
          <button onClick={handleClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>

          {/* Progress steps */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map(s => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  s <= step ? (type === "music" ? "gradient-music" : "gradient-movie") : "bg-muted"
                }`}
              />
            ))}
          </div>

          {step === 1 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <h2 className="font-display text-xl font-bold text-foreground mb-1">
                Create {type === "music" ? "Music" : "Movie"} Room
              </h2>
              <p className="text-sm text-muted-foreground mb-6">Name your room and choose who can join.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-1.5 block">Room Name</label>
                  <Input
                    placeholder="e.g. Friday Movie Night"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    maxLength={50}
                    className="bg-muted/50 border-glass-border"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Privacy</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setIsPrivate(true)}
                      className={`glass-panel p-3 flex flex-col items-center gap-1.5 text-center transition-all ${
                        isPrivate ? "border-primary/50 glow-movie" : "hover:border-muted-foreground/30"
                      }`}
                    >
                      <Lock className={`w-5 h-5 ${isPrivate ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${isPrivate ? "text-foreground" : "text-muted-foreground"}`}>
                        Private
                      </span>
                      <span className="text-xs text-muted-foreground">Invite only</span>
                    </button>
                    <button
                      onClick={() => setIsPrivate(false)}
                      className={`glass-panel p-3 flex flex-col items-center gap-1.5 text-center transition-all ${
                        !isPrivate ? "border-primary/50 glow-movie" : "hover:border-muted-foreground/30"
                      }`}
                    >
                      <Globe className={`w-5 h-5 ${!isPrivate ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-sm font-medium ${!isPrivate ? "text-foreground" : "text-muted-foreground"}`}>
                        Public
                      </span>
                      <span className="text-xs text-muted-foreground">Anyone with link</span>
                    </button>
                  </div>
                </div>
              </div>
              <Button
                onClick={() => setStep(2)}
                disabled={!roomName.trim()}
                className={`w-full mt-6 ${type === "music" ? "gradient-music" : "gradient-movie"} text-primary-foreground font-semibold`}
              >
                Next — Invite Friends
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <h2 className="font-display text-xl font-bold text-foreground mb-1">Invite Friends</h2>
              <p className="text-sm text-muted-foreground mb-5">Select friends to invite to "{roomName}"</p>
              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {friends.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No friends yet. You can share the room link after creation!
                  </p>
                )}
                {friends.map((friend) => {
                  const selected = selectedFriends.includes(friend.id);
                  return (
                    <button
                      key={friend.id}
                      onClick={() => toggleFriend(friend.id)}
                      className={`w-full glass-panel p-3 flex items-center gap-3 transition-all ${
                        selected ? "border-primary/40" : ""
                      }`}
                    >
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-lg">
                          {friend.avatar_emoji}
                        </div>
                        {friend.is_online && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-secondary border-2 border-card" />
                        )}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-foreground">{friend.display_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {friend.is_online ? "Online" : "Offline"}
                        </p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        selected ? "bg-primary border-primary" : "border-muted-foreground/40"
                      }`}>
                        {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-3 mt-6">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-glass-border">
                  Back
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 gradient-movie text-primary-foreground font-semibold"
                >
                  {creating ? "Creating..." : "Create Room"}
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
              <div className="w-16 h-16 rounded-full gradient-movie flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-primary-foreground" />
              </div>
              <h2 className="font-display text-xl font-bold text-foreground mb-1">
                Room Created! {type === "music" ? "🎵" : "🎬"}
              </h2>
              <p className="text-sm text-muted-foreground mb-2">Share the link or code with friends.</p>
              <div className="glass-panel p-3 mb-3 text-center">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Room Code</p>
                <p className="text-2xl font-mono font-bold text-foreground tracking-[0.3em]">{generatedRoomCode}</p>
              </div>
              <div className="glass-panel p-3 flex items-center gap-2 mb-4">
                <Input readOnly value={roomLink} className="bg-transparent border-none text-sm text-muted-foreground" />
                <Button size="sm" variant="ghost" onClick={handleCopy} className="flex-shrink-0">
                  {copied ? <Check className="w-4 h-4 text-secondary" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
              <Button
                onClick={handleNavigateToRoom}
                className={`w-full ${type === "music" ? "gradient-music" : "gradient-movie"} text-primary-foreground font-semibold`}
              >
                Enter Room
              </Button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CreateRoomDialog;