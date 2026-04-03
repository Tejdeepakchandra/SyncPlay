import { create } from 'zustand';

export const themes = [
  {
    id: 'default',
    name: 'Default',
    emoji: '🎬',
    description: 'Classic SyncPlay theme',
    preview: {
      bg: '#0f172a',
      primary: '#3b82f6',
      secondary: '#ec4899',
      accent: '#f59e0b'
    }
  },
  {
    id: 'dark',
    name: 'Dark',
    emoji: '🌙',
    description: 'Deep dark mode',
    preview: {
      bg: '#000000',
      primary: '#6366f1',
      secondary: '#8b5cf6',
      accent: '#06b6d4'
    }
  },
  {
    id: 'light',
    name: 'Light',
    emoji: '☀️',
    description: 'Light and bright',
    preview: {
      bg: '#ffffff',
      primary: '#0d47a1',
      secondary: '#c2185b',
      accent: '#f57c00'
    }
  },
];

export const useThemeStore = create((set) => ({
  theme: 'default',
  setTheme: (themeId) => set({ theme: themeId }),
}));
