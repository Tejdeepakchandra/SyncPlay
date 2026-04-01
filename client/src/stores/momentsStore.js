import { create } from "zustand";

export const useMomentsStore = create((set) => ({
  moments: [],

  addMoment: (moment) =>
    set((state) => ({
      moments: [
        {
          id: `moment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          ...moment,
        },
        ...state.moments,
      ],
    })),

  removeMoment: (id) =>
    set((state) => ({
      moments: state.moments.filter((m) => m.id !== id),
    })),

  clearMoments: () => set({ moments: [] }),
}));
