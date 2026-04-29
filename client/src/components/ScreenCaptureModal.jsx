import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Mic, Users, Camera, Shield, Clock, X } from 'lucide-react';

/**
 * ScreenCaptureModal — Appears 10-15s after host joins room.
 * Explains why screen sharing is needed for Moment Capture and gives
 * the host "Allow Now" and "Later" options.
 */
const ScreenCaptureModal = ({ isVisible, onAllow, onLater, onDismiss }) => {
  const [isStarting, setIsStarting] = useState(false);

  const handleAllow = async () => {
    setIsStarting(true);
    try {
      await onAllow?.();
    } catch (e) {
      console.error('[CAPTURE] Screen share failed:', e);
    } finally {
      setIsStarting(false);
    }
  };

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={(e) => e.target === e.currentTarget && onDismiss?.()}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          className="w-[95vw] max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-2xl"
          style={{
            background: 'linear-gradient(145deg, rgba(15,15,30,0.98), rgba(10,10,25,0.98))',
          }}
        >
          {/* Header glow */}
          <div className="relative px-6 pt-6 pb-4">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 rounded-b-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500" />
            
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white/70 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20 flex items-center justify-center mx-auto mb-4">
              <Camera className="w-7 h-7 text-purple-400" />
            </div>

            <h2 className="text-lg font-bold text-white text-center">
              Enable Moment Capture
            </h2>
            <p className="text-sm text-gray-400 text-center mt-1.5 leading-relaxed">
              Share your screen so the system can capture highlights from the watch party automatically.
            </p>
          </div>

          {/* Features */}
          <div className="px-6 pb-4 space-y-2.5">
            {[
              { icon: Monitor, label: 'Screen Recording', desc: 'Captures video playing on your screen', color: 'text-blue-400' },
              { icon: Mic, label: 'Audio Capture', desc: 'Records system audio and microphone', color: 'text-green-400' },
              { icon: Users, label: 'Participant Streams', desc: 'Includes audio from all room members', color: 'text-amber-400' },
            ].map(({ icon: Icon, label, desc, color }) => (
              <div key={label} className="flex items-start gap-3 p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                <div className="mt-0.5 p-1.5 rounded-lg bg-white/5">
                  <Icon className={`w-4 h-4 ${color}`} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white/90">{label}</h4>
                  <p className="text-[11px] text-gray-500 mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Privacy note */}
          <div className="mx-6 mb-4 flex items-center gap-2 p-2.5 rounded-lg bg-green-500/5 border border-green-500/10">
            <Shield className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <p className="text-[10px] text-green-300/80">
              Screen sharing stays within the capture system. It is not streamed to other participants.
            </p>
          </div>

          {/* Actions */}
          <div className="px-6 pb-6 flex gap-3">
            <button
              onClick={onLater}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-400 bg-white/5 hover:bg-white/10 border border-white/5 transition-all"
            >
              <Clock className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
              Later
            </button>
            <button
              onClick={handleAllow}
              disabled={isStarting}
              className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 shadow-lg shadow-purple-500/20 transition-all disabled:opacity-50"
            >
              {isStarting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting...
                </span>
              ) : (
                <>
                  <Camera className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                  Allow Now
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ScreenCaptureModal;
