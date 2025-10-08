/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'icu-dark': '#0a0e1a',
        'icu-card': '#0f1419',
        'icu-border': '#1a2332',
        'icu-green': '#00ff88',
        'icu-blue': '#00a8ff',
        'icu-warning': '#ffa500',
        'icu-critical': '#ff4444',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        }
      }
    },
  },
  plugins: [],
}