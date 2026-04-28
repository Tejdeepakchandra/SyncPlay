import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, X } from 'lucide-react';

/**
 * MomentLimitToast — Displayed when a moment type limit is reached.
 * Tells the host to delete an existing moment before adding new ones.
 */
const MomentLimitToast = ({ warning, onDismiss, onDeleteMoment, moments = [] }) => {
  if (!warning) return null;

  const typeLabels = {
    bookmark: '⭐ Bookmark',
    reaction_spike: '🔥 Reaction Spike',
    comment_cluster: '💬 Discussion',
    total: '📌 Total',
  };

  const deletableMoments = moments.filter(m => {
    if (warning.type === 'total') return true;
    return m.type === warning.type;
  });

  return (
    <AnimatePresence>
      {warning && (
        <motion.div
          initial={{ opacity: 0, y: -20, x: '-50%' }}
          animate={{ opacity: 1, y: 0, x: '-50%' }}
          exit={{ opacity: 0, y: -20, x: '-50%' }}
          className="fixed top-4 left-1/2 z-[70] w-[90vw] max-w-md"
        >
          <div className="bg-amber-950/90 backdrop-blur-xl border border-amber-500/30 rounded-xl px-4 py-3 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-amber-200">
                  {typeLabels[warning.type] || 'Moment'} Limit Reached
                </h4>
                <p className="text-xs text-amber-300/70 mt-0.5">
                  {warning.message || `${warning.current}/${warning.max} used. Delete one to add more.`}
                </p>

                {/* Quick delete buttons */}
                {deletableMoments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {deletableMoments.slice(0, 3).map(m => (
                      <button
                        key={m.momentId || m._id}
                        onClick={() => onDeleteMoment?.(m.momentId || m._id)}
                        className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-red-500/20 border border-amber-500/20 hover:border-red-500/30 rounded-lg text-[10px] text-amber-300 hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        {Math.floor(m.timestamp / 60)}:{Math.floor(m.timestamp % 60).toString().padStart(2, '0')}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={onDismiss}
                className="p-1 rounded-lg hover:bg-white/10 text-amber-400/60 hover:text-amber-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MomentLimitToast;
