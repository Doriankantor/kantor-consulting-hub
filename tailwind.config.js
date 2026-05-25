/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'hub-navy': '#0f1624',
        'hub-navy-light': '#1a2744',
        'hub-blue': '#2563eb',
        'hub-gold': '#d97706',
        'hub-gold-light': '#f59e0b',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Inter"', '"Segoe UI"', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
      keyframes: {
        'card-flash': {
          '0%':   { boxShadow: '0 0 0 4px rgba(217,119,6,0.6)' },
          '40%':  { boxShadow: '0 0 0 8px rgba(217,119,6,0.3)' },
          '100%': { boxShadow: '0 0 0 0px rgba(217,119,6,0)' },
        },
      },
      animation: {
        'card-flash': 'card-flash 2s ease-out forwards',
      },
    },
  },
  plugins: [],
}
