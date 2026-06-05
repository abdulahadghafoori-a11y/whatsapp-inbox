/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        wa: {
          // Brand
          green: '#25D366',
          teal: '#008069', // primary header / actions (light)
          tealDeep: '#017561',
          tick: '#53BDEB', // read-receipt blue

          // Light surfaces
          light: '#D9FDD3', // outbound bubble
          bg: '#EFEAE2', // chat wallpaper base
          dark: '#075E54', // legacy accent (kept for compatibility)

          // Dark surfaces (authentic WhatsApp dark theme)
          chatDark: '#0B141A', // chat wallpaper base (dark)
          panelDeep: '#111B21', // app background (dark)
          panel: '#202C33', // bars, inputs, list rows (dark)
          elevated: '#2A3942', // raised controls (dark)
          bubbleIn: '#202C33', // inbound bubble (dark)
          bubbleOut: '#005C4B', // outbound bubble (dark)
          headerDark: '#1F2C34', // top app bar (dark)
          textDark: '#E9EDEF', // primary text (dark)
          subDark: '#8696A0', // secondary text (dark)
        },
      },
    },
  },
  plugins: [],
}
