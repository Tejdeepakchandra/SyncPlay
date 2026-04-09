import { motion } from "framer-motion";
import { Clock, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const WaitingAreaDialog = ({ roomName, guestName, onCancel, roomType = "movie" }) => {
  const navigate = useNavigate();

  const handleCancel = () => {
    onCancel();
    navigate(roomType === "music" ? "/music" : "/movies");
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-background border border-border rounded-lg p-8 max-w-sm w-full text-center"
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6"
        >
          <Clock className="w-8 h-8 text-primary" />
        </motion.div>

        <h2 className="text-2xl font-bold text-foreground mb-2">Waiting for Approval</h2>

        <div className="bg-muted/50 border border-border rounded-lg p-4 mb-6 text-left">
          <p className="text-sm text-muted-foreground mb-1">
            <span className="font-semibold text-foreground">{roomName}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            Joining as: <span className="font-semibold text-foreground">{guestName}</span>
          </p>
        </div>

        <p className="text-muted-foreground mb-2">
          The room host needs to approve your request before you can join.
        </p>
        <p className="text-sm text-muted-foreground mb-6">
          This page will automatically update when the host accepts your request. No need to refresh!
        </p>

        <div className="flex gap-3">
          <Button
            onClick={handleCancel}
            variant="outline"
            className="flex-1 border-border"
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-4 flex items-center justify-center gap-1.5">
          <RefreshCw className="w-3 h-3" />
          Auto-refreshing for approval...
        </p>
      </motion.div>
    </div>
  );
};

export default WaitingAreaDialog;
