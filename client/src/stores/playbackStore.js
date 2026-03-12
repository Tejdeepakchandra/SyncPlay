import { create } from "zustand";

export const usePlaybackStore = create((set) => ({
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 80,
  mediaSource: null,
  mediaId: null,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setMedia: (source, id) => set({ mediaSource: source, mediaId: id }),
  reset: () =>
    set({
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 80,
      mediaSource: null,
      mediaId: null,
    }),
}));
