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
        // DEPTH SYSTEM — 4 Distinct Layers
        background: {
          DEFAULT: '#070A12',     // Layer 0 - Global
          section: '#0F1724',      // Layer 1 - Page sections
          card: '#131C2E',         // Layer 2 - Cards/panels
          elevated: '#182235',     // Layer 3 - Modals/active
        },
        
        // Surface Aliases (semantic)
        surface: {
          1: '#0F1724',
          2: '#131C2E', 
          3: '#182235',
        },
        
        // Borders (Opacity-based)
        border: {
          subtle: 'rgba(255,255,255,0.06)',
          DEFAULT: 'rgba(255,255,255,0.08)',
          hover: 'rgba(255,255,255,0.12)',
          active: 'rgba(59,130,246,0.5)',
        },
        
        divider: 'rgba(255,255,255,0.04)',
        
        // Text — Keep pure
        text: {
          primary: '#FFFFFF',
          secondary: '#9CA3AF',
          tertiary: '#6B7280',
          disabled: '#4B5563',
        },
        
        // MOVIE — Electric Cinema Blue
        movie: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          light: '#60A5FA',
          deep: '#1E3A8A',
          glow: 'rgba(59,130,246,0.35)',
          'glow-soft': 'rgba(59,130,246,0.25)',
          'glow-strong': 'rgba(59,130,246,0.45)',
        },
        
        // MUSIC — Premium Emerald
        music: {
          DEFAULT: '#22C55E',
          hover: '#16A34A',
          light: '#4ADE80',
          deep: '#166534',
          glow: 'rgba(34,197,94,0.35)',
          'glow-soft': 'rgba(34,197,94,0.25)',
        },
        
        // FRIENDS — Luxury Gold (Highlights Only)
        gold: {
          DEFAULT: '#EAB308',
          soft: '#FBBF24',
          deep: '#CA8A04',
          glow: 'rgba(234,179,8,0.25)',
        },
        
        // Semantic
        success: '#22C55E',
        error: '#EF4444',
        warning: '#F59E0B',
      },
      
      backgroundImage: {
        // Gradients
        'movie-gradient': 'linear-gradient(135deg, #3B82F6 0%, #06B6D4 100%)',
        'movie-subtle': 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(6,182,212,0.1) 100%)',
        'music-gradient': 'linear-gradient(135deg, #22C55E 0%, #14B8A6 100%)',
        'music-subtle': 'linear-gradient(135deg, rgba(34,197,94,0.2) 0%, rgba(20,184,166,0.1) 100%)',
        
        // Cinematic backgrounds
        'cinematic-radial': 'radial-gradient(circle at 50% 50%, rgba(59,130,246,0.15) 0%, transparent 70%)',
        'cinematic-radial-music': 'radial-gradient(circle at 50% 50%, rgba(34,197,94,0.15) 0%, transparent 70%)',
        
        // Control bars
        'control-fade': 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
      },
      
      animation: {
        // Core animations
        'fade-in': 'fadeIn 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'fade-out': 'fadeOut 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slideUp 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-down': 'slideDown 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-left': 'slideLeft 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-right': 'slideRight 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-out': 'scaleOut 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        
        // Hover effects
        'hover-lift': 'hoverLift 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        'hover-glow': 'hoverGlow 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        
        // Music visualization
        'wave-1': 'waveBounce 1.2s ease-in-out infinite',
        'wave-2': 'waveBounce 1.2s ease-in-out 0.2s infinite',
        'wave-3': 'waveBounce 1.2s ease-in-out 0.4s infinite',
        'wave-4': 'waveBounce 1.2s ease-in-out 0.6s infinite',
        
        // Cinematic
        'theatre-enter': 'theatreEnter 450ms cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        
        // Background movement
        'rotate-slow': 'rotateSlow 20s linear infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        slideRight: {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.97)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        scaleOut: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '100%': { transform: 'scale(0.97)', opacity: '0' },
        },
        hoverLift: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-4px)' },
        },
        hoverGlow: {
          '0%': { boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
          '100%': { boxShadow: '0 0 30px rgba(59,130,246,0.25)' },
        },
        waveBounce: {
          '0%, 100%': { transform: 'scaleY(0.5)' },
          '50%': { transform: 'scaleY(1.2)' },
        },
        theatreEnter: {
          '0%': { 
            transform: 'scale(0.97)',
            filter: 'brightness(1) blur(0px)',
          },
          '100%': { 
            transform: 'scale(1)',
            filter: 'brightness(0.9) blur(0.5px)',
          },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.8' },
        },
        rotateSlow: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      
      boxShadow: {
        'movie': '0 0 20px rgba(59,130,246,0.15)',
        'movie-hover': '0 0 30px rgba(59,130,246,0.25)',
        'music': '0 0 20px rgba(34,197,94,0.15)',
        'music-hover': '0 0 30px rgba(34,197,94,0.25)',
        'gold': '0 0 15px rgba(234,179,8,0.15)',
        'elevated': '0 10px 30px rgba(0,0,0,0.6)',
        'card': '0 4px 20px rgba(0,0,0,0.4)',
        'card-hover': '0 20px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.3)',
      },
      
      backdropBlur: {
        'xs': '2px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '20px',
      },
      
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      
      fontSize: {
        'hero': ['4.5rem', { lineHeight: '1.1', fontWeight: '700', letterSpacing: '-0.02em' }],
        'display': ['3rem', { lineHeight: '1.2', fontWeight: '700', letterSpacing: '-0.01em' }],
        'h1': ['2.25rem', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.01em' }],
        'h2': ['1.875rem', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.01em' }],
        'h3': ['1.5rem', { lineHeight: '1.4', fontWeight: '600' }],
        'h4': ['1.25rem', { lineHeight: '1.4', fontWeight: '600' }],
        'body': ['1rem', { lineHeight: '1.5', fontWeight: '400' }],
        'body-lg': ['1.125rem', { lineHeight: '1.5', fontWeight: '400' }],
        'meta': ['0.875rem', { lineHeight: '1.5', fontWeight: '500' }],
        'small': ['0.75rem', { lineHeight: '1.5', fontWeight: '500' }],
      },
      
      letterSpacing: {
        'tight': '-0.02em',
        'normal': '0em',
        'wide': '0.02em',
      },
      
      transitionTimingFunction: {
        'cinematic': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      
      transitionDuration: {
        '250': '250ms',
        '400': '400ms',
        '450': '450ms',
      },
    },
  },
  plugins: [],
}