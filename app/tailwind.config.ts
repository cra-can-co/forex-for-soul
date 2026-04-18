import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        ui: ['"Space Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#0a0908',
        surface: {
          DEFAULT: '#14120f',
          raised: '#1c1915',
        },
        rule: '#2a2620',
        ivory: '#f6f1e7',
        parchment: '#e4ddcb',
        dim: '#8a857a',
        muted: '#5d584f',
        brass: {
          DEFAULT: '#c9a77c',
          bright: '#e8c583',
          deep: '#9b7f5a',
        },
        ascend: '#9ab973',
        descend: '#c45a4f',
        verdigris: '#4a7c6b',
      },
      boxShadow: {
        plate: '0 1px 0 0 rgba(246, 241, 231, 0.04), 0 20px 40px -20px rgba(0,0,0,0.6)',
        brass: '0 0 0 1px rgba(201, 167, 124, 0.35), 0 0 24px -8px rgba(232, 197, 131, 0.35)',
      },
      keyframes: {
        'ticker-scroll': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'flip-down': {
          '0%': { transform: 'rotateX(0deg)' },
          '100%': { transform: 'rotateX(-180deg)' },
        },
        'pulse-up': {
          '0%,100%': { backgroundColor: 'transparent' },
          '30%': { backgroundColor: 'rgba(154, 185, 115, 0.22)' },
        },
        'pulse-down': {
          '0%,100%': { backgroundColor: 'transparent' },
          '30%': { backgroundColor: 'rgba(196, 90, 79, 0.22)' },
        },
        'brass-sweep': {
          '0%,100%': { opacity: '0.35' },
          '50%': { opacity: '0.75' },
        },
      },
      animation: {
        ticker: 'ticker-scroll 60s linear infinite',
        flipDown: 'flip-down 380ms cubic-bezier(.54,.02,.3,1) forwards',
        pulseUp: 'pulse-up 900ms ease-out',
        pulseDown: 'pulse-down 900ms ease-out',
        brassSweep: 'brass-sweep 3s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
