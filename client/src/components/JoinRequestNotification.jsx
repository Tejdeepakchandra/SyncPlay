import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";

const JoinRequestNotification = ({
  joinRequests = [],
  onAccept,
  onReject,
  isHost = false,
}) => {
  const [notifications, setNotifications] = useState(joinRequests);
  const [processing, setProcessing] = useState({});

  useEffect(() => {
    setNotifications(joinRequests.filter(jr => jr.status === 'pending'));
  }, [joinRequests]);

  const handleAccept = async (userId, username) => {
    setProcessing(prev => ({ ...prev, [userId]: 'accepting' }));
    try {
      await onAccept(userId);
      toast.success(`${username} has been approved to join!`);
      setNotifications(prev => prev.filter(n => n.userId !== userId));
    } catch {
      toast.error(`Failed to approve ${username}`);
    } finally {
      setProcessing(prev => ({ ...prev, [userId]: null }));
    }
  };

  const handleReject = async (userId, username) => {
    setProcessing(prev => ({ ...prev, [userId]: 'rejecting' }));
    try {
      await onReject(userId);
      toast.info(`${username}'s request has been rejected`);
      setNotifications(prev => prev.filter(n => n.userId !== userId));
    } catch {
      toast.error(`Failed to reject ${username}`);
    } finally {
      setProcessing(prev => ({ ...prev, [userId]: null }));
    }
  };

  if (!isHost || notifications.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="fixed top-4 right-4 z-40 max-w-sm"
      >
        {notifications.map((request, index) => (
          <motion.div
            key={request.userId}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ delay: index * 0.1 }}
            className="bg-background border border-border rounded-lg p-4 shadow-lg mb-3"
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  Join Request
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  <span className="font-medium text-foreground">{request.username}</span> is requesting to join
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                onClick={() => handleAccept(request.userId, request.username)}
                disabled={processing[request.userId]}
                size="sm"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              >
                {processing[request.userId] === 'accepting' ? (
                  <>
                    <span className="inline-block animate-spin mr-1">⏳</span>
                    Approving...
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Accept
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleReject(request.userId, request.username)}
                disabled={processing[request.userId]}
                variant="outline"
                size="sm"
                className="flex-1 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
              >
                {processing[request.userId] === 'rejecting' ? (
                  <>
                    <span className="inline-block animate-spin mr-1">⏳</span>
                    Rejecting...
                  </>
                ) : (
                  <>
                    <X className="w-3.5 h-3.5 mr-1.5" />
                    Reject
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </AnimatePresence>
  );
};

export default JoinRequestNotification;
