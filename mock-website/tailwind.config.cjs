/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f6fa',
          100: '#e3ecf4',
          500: '#2c5a7c',
          700: '#12304a',
          900: '#0b1f31',
        },
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', 'Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
    },
  },
  plugins: [],
};
