/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Premium Night-Blue + Amber-Gold palette
        surface: {
          0: '#060b18',
          1: '#0a1128',
          2: '#0f1a36',
          3: '#142044',
          4: '#19274f',
          5: '#1e2f5e',
          6: '#253a6e',
        },
        accent: {
          DEFAULT: '#f59e0b',
          hover: '#fbbf24',
          muted: '#f59e0b26',
          dim: '#f59e0b12',
        },
        success: {
          DEFAULT: '#34d399',
          hover: '#6ee7b7',
          muted: '#34d39926',
          dim: '#34d39912',
        },
        warning: {
          DEFAULT: '#fb923c',
          hover: '#fdba74',
          muted: '#fb923c26',
          dim: '#fb923c12',
        },
        danger: {
          DEFAULT: '#f87171',
          hover: '#fca5a5',
          muted: '#f8717126',
          dim: '#f8717112',
        },
        txt: {
          primary: '#f0f4ff',
          secondary: '#94a3b8',
          muted: '#64748b',
          faint: '#334155',
        },
        border: {
          DEFAULT: '#1e2f5e',
          muted: '#152044',
          strong: '#2d4270',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Consolas', 'monospace'],
        reader: ['Georgia', 'Iowan Old Style', 'Apple Garamond', 'serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        '3xs': ['0.5625rem', { lineHeight: '0.75rem' }],
      },
      boxShadow: {
        'surface': '0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.25)',
        'surface-lg': '0 4px 14px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.25)',
        'surface-xl': '0 10px 40px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.25)',
        'surface-2xl': '0 20px 60px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.3)',
        'glow-accent': '0 0 20px rgba(245,158,11,0.18)',
        'glow-accent-lg': '0 0 40px rgba(245,158,11,0.25)',
        'glow-success': '0 0 20px rgba(52,211,153,0.18)',
        'glow-warning': '0 0 20px rgba(251,146,60,0.18)',
        'glow-danger': '0 0 20px rgba(248,113,113,0.25)',
        'inner-glow': 'inset 0 1px 0 rgba(245,158,11,0.06)',
      },
      borderRadius: {
        '4xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'fade-in-up': 'fadeInUp 250ms ease-out',
        'fade-in-down': 'fadeInDown 200ms ease-out',
        'fade-in-scale': 'fadeInScale 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-right': 'slideInRight 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-in-up': 'slideInUp 250ms cubic-bezier(0.16, 1, 0.3, 1)',
        'scale-in': 'scaleIn 150ms cubic-bezier(0.16, 1, 0.3, 1)',
        'shimmer': 'shimmer 2s infinite linear',
        'progress': 'progress 2.5s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-subtle': 'bounceSubtle 500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInScale: {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        progress: {
          '0%': { transform: 'scaleX(0)' },
          '50%': { transform: 'scaleX(0.7)' },
          '100%': { transform: 'scaleX(1)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        bounceSubtle: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
