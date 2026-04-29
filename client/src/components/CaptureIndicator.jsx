import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * CaptureIndicator — Compact top-right badge showing capture status.
 * Small pill: green dot = buffer active, red dot = extracting.
 */
const CaptureIndicator = ({ isBuffering, isExtracting, bufferStatus, captureProgress }) => {
  const show = isBuffering || isExtracting;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, x: 20, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.8 }}
          className="fixed top-14 right-3 z-50 flex items-center gap-1.5 px-2.5 py-1 rounded-full border shadow-lg"
          style={{
            background: isExtracting 
              ? 'rgba(239,68,68,0.12)' 
              : 'rgba(34,197,94,0.08)',
            borderColor: isExtracting 
              ? 'rgba(239,68,68,0.25)' 
              : 'rgba(34,197,94,0.2)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Status dot */}
          <motion.div
            className="rounded-full"
            style={{
              width: '6px', height: '6px',
              backgroundColor: isExtracting ? '#EF4444' : '#22C55E',
            }}
            animate={{ opacity: isExtracting ? [1, 0.3, 1] : 1 }}
            transition={{ duration: 0.8, repeat: isExtracting ? Infinity : 0 }}
          />

          {/* Label */}
          <span
            className="text-[10px] font-medium"
            style={{ color: isExtracting ? '#FCA5A5' : '#86EFAC' }}
          >
            {isExtracting
              ? captureProgress?.phase === 'uploading' ? 'Uploading...' : 'Capturing...'
              : 'Buffer ON'}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CaptureIndicator;
