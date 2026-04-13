import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['Roboto Mono', 'monospace'],
      },
      colors: {
        panel: '#12151a',
        surface: '#1a1e26',
        border: '#2a2e36',
        long: '#22c55e',
        short: '#ef4444',
      },
    },
  },
  plugins: [],
};

export default config;
