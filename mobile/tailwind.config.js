/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        wa: {
          green: '#25D366',
          teal: '#128C7E',
          dark: '#075E54',
          light: '#DCF8C6',
          bg: '#ECE5DD',
        },
      },
    },
  },
  plugins: [],
}
