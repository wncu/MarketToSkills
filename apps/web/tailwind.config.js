/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        charcoal: {
          950: '#08090a',
          900: '#0b0c0d',
          850: '#111214',
          800: '#16181b',
          750: '#1c1f23',
          700: '#23272c',
          600: '#32373e',
        },
        surface: {
          canvas: '#0b0c0d',
          panel: '#111214',
          card: '#15171a',
          cardHover: '#1c1f23',
          border: '#23262a',
          borderLight: '#2e3339',
        },
        warm: {
          primary: '#edece6',
          secondary: '#9ba1a6',
          muted: '#656b72',
          ivory: '#faf8f5',
          champagne: '#c9b084',
          bronze: '#a88d5e',
          olive: '#7b8774',
        },
      },
      fontFamily: {
        serif: ['Newsreader', 'Georgia', 'serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'sm': '4px',
        'DEFAULT': '6px',
        'md': '8px',
        'lg': '10px',
        'xl': '12px',
        '2xl': '16px',
      }
    },
  },
  plugins: [],
}
