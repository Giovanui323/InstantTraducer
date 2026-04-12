/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // PDF Reader Pro palette
        surface: {
          0: '#0d1117',
          1: '#131921',
          2: '#161b22',
          3: '#1c2128',
          4: '#21262d',
          5: '#282e36',
          6: '#30363d',
        },
        accent: {
          DEFAULT: '#58a6ff',
          hover: '#79b8ff',
          muted: '#58a6ff26',
          dim: '#58a6ff12',
        },
        success: {
          DEFAULT: '#3fb950',
          hover: '#56d364',
          muted: '#3fb95026',
          dim: '#3fb95012',
        },
        warning: {
          DEFAULT: '#d29922',
          hover: '#e3b341',
          muted: '#d2992226',
          dim: '#d2992212',
        },
        danger: {
          DEFAULT: '#f85149',
          hover: '#ff7b72',
          muted: '#f8514926',
          dim: '#f8514912',
        },
        txt: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#484f58',
          faint: '#30363d',
        },
        border: {
          DEFAULT: '#30363d',
          muted: '#21262d',
          strong: '#484f58',
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
        'surface': '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        'surface-lg': '0 4px 14px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.2)',
        'surface-xl': '0 10px 40px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)',
        'surface-2xl': '0 20px 60px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.25)',
        'glow-accent': '0 0 20px rgba(88,166,255,0.15)',
        'glow-accent-lg': '0 0 40px rgba(88,166,255,0.2)',
        'glow-success': '0 0 20px rgba(63,185,80,0.15)',
        'glow-warning': '0 0 20px rgba(210,153,34,0.15)',
        'glow-danger': '0 0 20px rgba(248,81,73,0.2)',
        'inner-glow': 'inset 0 1px 0 rgba(255,255,255,0.04)',
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
