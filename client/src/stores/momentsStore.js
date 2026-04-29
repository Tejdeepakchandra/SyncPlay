import { create } from "zustand";

export const useMomentsStore = create((set, get) => ({
  moments: [],
  watchingMomentId: null,  // Currently watching moment (for sync skip)
  momentCounts: {},        // { bookmark: 2, reaction_spike: 1, ... }
  
  // Moment limits per type
  limits: {
    bookmark: 4,
    reaction_spike: 3,
    comment_cluster: 2,
    total: 9,
  },

  addMoment: (moment) =>
    set((state) => {
      // Prevent duplicates
      if (state.moments.some(m => m.id === moment.id || m.momentId === moment.momentId)) {
        return state;
      }
      return {
        moments: [
          {
            id: moment.id || `moment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: Date.now(),
            ...moment,
          },
          ...state.moments,
        ],
      };
    }),

  updateMoment: (momentId, updates) =>
    set((state) => ({
      moments: state.moments.map((m) =>
        (m.id === momentId || m.momentId === momentId)
          ? { ...m, ...updates }
          : m
      ),
    })),

  removeMoment: (id) =>
    set((state) => ({
      moments: state.moments.filter((m) => m.id !== id && m.momentId !== id),
    })),

  clearMoments: () => set({ moments: [] }),

  // Watching state
  setWatchingMoment: (momentId) => set({ watchingMomentId: momentId }),
  clearWatchingMoment: () => set({ watchingMomentId: null }),
  isWatchingMoment: () => get().watchingMomentId !== null,

  // Counts & limits
  setMomentCounts: (counts) => set({ momentCounts: counts }),
  
  isLimitReached: (type) => {
    const { momentCounts, limits } = get();
    const currentCount = momentCounts[type] || 0;
    const limit = limits[type];
    return limit != null && currentCount >= limit;
  },

  getRemainingCount: (type) => {
    const { momentCounts, limits } = get();
    const currentCount = momentCounts[type] || 0;
    const limit = limits[type] || Infinity;
    return Math.max(0, limit - currentCount);
  },
}));
