import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Search, UserPlus, Check, Loader2, Users } from "lucide-react";
import api from "@/services/api";
import { toast } from "sonner";

/**
 * InviteFriendsModal — Invite friends to the current room from inside the room.
 * Shows the user's friends list with search, online status, and one-tap invite.
 */
export default function InviteFriendsModal({ open, onClose, roomCode, participantIds = [] }) {
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [invitedIds, setInvitedIds] = useState(new Set());
  const [sendingId, setSendingId] = useState(null);

  const fetchFriends = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get("/friends");
      const data = res?.data?.data || {};
      setFriends(data.friends || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchFriends();
      setSearch("");
      setInvitedIds(new Set());
    }
  }, [open, fetchFriends]);

  const handleInvite = async (friend) => {
    const targetId = friend?.id;
    const name = friend?.display_name || friend?.username || "friend";
    if (!targetId || !roomCode) return;

    setSendingId(targetId);
    try {
      await api.post(`/rooms/${roomCode}/invite`, { userIds: [targetId] });
      setInvitedIds(prev => new Set(prev).add(targetId));
      toast.success(`Invite sent to ${name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to send invite");
    } finally {
      setSendingId(null);
    }
  };

  const filtered = friends.filter(f => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const name = f.friendProfile?.display_name || "";
    const uname = f.friendProfile?.username || "";
    return name.toLowerCase().includes(q) || uname.toLowerCase().includes(q);
  });

  const online = filtered.filter(f => f.friendProfile?.is_online);
  const offline = filtered.filter(f => !f.friendProfile?.is_online);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="w-[90vw] max-w-md bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
                <UserPlus className="w-4.5 h-4.5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Invite Friends</h3>
                <p className="text-[10px] text-muted-foreground">to room #{roomCode}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search friends..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-muted/30 border border-border/50 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary/30"
                autoFocus
              />
            </div>
          </div>

          {/* Friends list */}
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="py-12 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {search ? "No friends found" : "No friends yet"}
                </p>
              </div>
            ) : (
              <>
                {online.length > 0 && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Online — {online.length}
                  </p>
                )}
                {online.map(row => renderFriendRow(row, true))}

                {offline.length > 0 && (
                  <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Offline — {offline.length}
                  </p>
                )}
                {offline.map(row => renderFriendRow(row, false))}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  function renderFriendRow(row, isOnline) {
    const friend = row.friendProfile;
    const isInRoom = participantIds.includes(friend?.id);
    const isInvited = invitedIds.has(friend?.id);
    const isSending = sendingId === friend?.id;

    return (
      <div
        key={row.id}
        className={`flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20 transition-colors ${!isOnline ? 'opacity-60' : ''}`}
      >
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center text-lg">
            {friend?.avatar_emoji || "🧑"}
          </div>
          {isOnline && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-card" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{friend?.display_name}</p>
          <p className="text-[10px] text-muted-foreground">@{friend?.username}</p>
        </div>
        {isInRoom ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground px-3 py-1.5 rounded-lg bg-muted/30">
            <Check className="w-3 h-3" /> In Room
          </span>
        ) : isInvited ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400 px-3 py-1.5 rounded-lg bg-emerald-500/10">
            <Check className="w-3 h-3" /> Sent
          </span>
        ) : (
          <button
            onClick={() => handleInvite(friend)}
            disabled={isSending}
            className="flex items-center gap-1 text-[11px] font-medium text-primary px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            {isSending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <UserPlus className="w-3 h-3" />
            )}
            Invite
          </button>
        )}
      </div>
    );
  }
}
