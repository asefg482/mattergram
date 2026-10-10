/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Vazirmatn', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        tg: {
          blue: '#2481cc',
          'blue-hover': '#1d73b8',
          'blue-light': '#3390ec',
          green: '#4fae60',
          online: '#4fae60',
          dark: {
            bg: '#0e1621',
            sidebar: '#17212b',
            card: '#242f3d',
            hover: '#202b36',
            active: '#2b5278',
            bubbleIn: '#182533',
            bubbleOut: '#2b5278',
            text: '#f5f5f5',
            muted: '#7f91a4',
            border: '#101921',
            input: '#17212b'
          },
          light: {
            bg: '#8ea6b4',
            sidebar: '#ffffff',
            card: '#f4f4f5',
            hover: '#f1f1f1',
            active: '#3390ec',
            bubbleIn: '#ffffff',
            bubbleOut: '#eeffde',
            text: '#111827',
            muted: '#707579',
            border: '#dfe1e5',
            input: '#ffffff'
          }
        }
      },
      boxShadow: {
        'tg-bubble': '0 1px 2px rgba(16, 24, 40, 0.1)',
        'tg-popover': '0 4px 20px rgba(0, 0, 0, 0.25)',
      }
    },
  },
  plugins: [],
}
