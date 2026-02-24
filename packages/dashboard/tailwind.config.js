/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        claw: {
          bg: '#0a0a0f',
          surface: '#12121a',
          border: '#1e1e2e',
          accent: '#6366f1',
          'accent-bright': '#818cf8',
          text: '#e2e8f0',
          muted: '#64748b',
          danger: '#ef4444',
          warning: '#f59e0b',
          success: '#22c55e',
        },
      },
    },
  },
  plugins: [],
};
