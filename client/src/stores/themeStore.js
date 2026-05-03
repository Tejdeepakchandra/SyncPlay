import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const themes = [
  {
    id: 'midnight-cinema',
    name: 'Midnight Cinema',
    description: 'Deep navy darks with electric cyan accents',
    emoji: '🌌',
    preview: { bg: '#0d1117', primary: '#00bfff', secondary: '#2ecc71', accent: '#9b59b6' },
  },
  {
    id: 'sunset-lounge',
    name: 'Sunset Lounge',
    description: 'Warm amber tones with rose and coral highlights',
    emoji: '🌅',
    preview: { bg: '#1a1210', primary: '#f59e0b', secondary: '#f97316', accent: '#e11d48' },
  },
  {
    id: 'arctic-frost',
    name: 'Arctic Frost',
    description: 'Cool icy blues on a crisp light canvas',
    emoji: '❄️',
    preview: { bg: '#f0f4f8', primary: '#3b82f6', secondary: '#06b6d4', accent: '#8b5cf6' },
  },
  {
    id: 'neon-noir',
    name: 'Neon Noir',
    description: 'Dark charcoal with vivid pink and electric violet',
    emoji: '🌃',
    preview: { bg: '#0f0f14', primary: '#e040fb', secondary: '#00e5ff', accent: '#ff6d00' },
  },
  {
    id: 'emerald-dusk',
    name: 'Emerald Dusk',
    description: 'Rich forest greens with gold and warm earth tones',
    emoji: '🌿',
    preview: { bg: '#0d120e', primary: '#34d399', secondary: '#fbbf24', accent: '#f472b6' },
  },
];

const applyThemeToRoot = (theme) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
};

export const useThemeStore = create(
  persist(
    (set) => ({
      theme: 'midnight-cinema',
      setTheme: (theme) => {
        applyThemeToRoot(theme);
        set({ theme });
      },
    }),
    {
      name: 'syncplay-theme',
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          applyThemeToRoot(state.theme);
        }
      },
    }
  )
);
