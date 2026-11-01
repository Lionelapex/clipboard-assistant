/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./popup.html', './offscreen.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        'ca-panel': '0 24px 60px -18px rgba(15, 23, 42, 0.45), 0 2px 8px rgba(15, 23, 42, 0.08)',
      },
      colors: {
        ca: {
          ink: '#0f172a',
          muted: '#64748b',
          line: '#e2e8f0',
          accent: '#0f766e',
          accentSoft: '#ccfbf1',
        },
      },
    },
  },
  plugins: [],
};
