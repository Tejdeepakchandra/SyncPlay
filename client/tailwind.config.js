/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 🎬 Cinematic Dark Foundation
        background: {
          DEFAULT: '#0A0C14',
          card: '#12141C',
          elevated: '#1A1D28',
        },
        
        // 🎨 Premium Accents
        movie: {
          DEFAULT: '#3B82F6',
          light: '#60A5FA',
          dark: '#2563EB',
          glow: 'rgba(59,130,246,0.5)',
        },
        music: {
          DEFAULT: '#10B981',
          light: '#34D399',
          dark: '#059669',
          glow: 'rgba(16,185,129,0.5)',
        },
        friends: {
          DEFAULT: '#F59E0B',
          light: '#FBBF24',
          dark: '#D97706',
          glow: 'rgba(245,158,11,0.5)',
        },
        
        // 📝 Text
        text: {
          primary: '#FFFFFF',
          secondary: '#94A3B8',
          tertiary: '#64748B',
        },
        
        // 🔲 Borders
        border: {
          DEFAULT: '#2D3748',
          subtle: '#1E293B',
        },
      },
      
      // 🖼️ Background Gradients
      backgroundImage: {
        'movie-gradient': 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
        'music-gradient': 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        'friends-gradient': 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        'cinematic': 'radial-gradient(circle at 50% 0%, rgba(59,130,246,0.1) 0%, transparent 70%), radial-gradient(circle at 100% 100%, rgba(16,185,129,0.1) 0%, transparent 70%)',
      },
      
      // ✨ Animations
      animation: {
        // Navbar
        'navbar-hide': 'navbarHide 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'navbar-show': 'navbarShow 0.8s cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'page-blink': 'pageBlink 0.3s ease-in-out',
        
        // Hover
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'float-slow': 'float 6s ease-in-out infinite',
        
        // Mobile
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      
      keyframes: {
        navbarHide: {
          '0%': { transform: 'translateY(0)', opacity: 1 },
          '100%': { transform: 'translateY(-100%)', opacity: 0 },
        },
        navbarShow: {
          '0%': { transform: 'translateY(-100%)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        pageBlink: {
          '0%': { filter: 'brightness(1)' },
          '25%': { filter: 'brightness(1.3)' },
          '50%': { filter: 'brightness(1)' },
          '75%': { filter: 'brightness(1.2)' },
          '100%': { filter: 'brightness(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(59,130,246,0.3)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: 0 },
          '100%': { transform: 'translateY(0)', opacity: 1 },
        },
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
      },
      
      // 📏 Spacing
      spacing: {
        'navbar': '4rem',
        'navbar-mobile': '3.5rem',
      },
    },
  },
  plugins: [],
}