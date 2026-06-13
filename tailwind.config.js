/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        nun: {
          linen:     '#FAF6EE',
          sand:      '#F0E5D0',
          parchment: '#E2D4BC',
          wood:      '#A07850',
          brown:     '#7D5A3A',
          dark:      '#2C1F14',
          muted:     '#8C7B6A',
          sea:       '#5B97B4',
          sky:       '#C0D9E5',
          sage:      '#7A9060',
          error:     '#C0392B',
          white:     '#FFFFFF',
        },
      },
    },
  },
};
