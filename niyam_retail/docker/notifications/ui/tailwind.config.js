/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f5f7ff',
          100: '#ebefff',
          200: '#d6deff',
          300: '#b3c2ff',
          400: '#8099ff',
          500: '#667eea',
          600: '#5568d3',
          700: '#4451b8',
          800: '#343d94',
          900: '#2a3177',
        },
        secondary: {
          500: '#764ba2',
        },
        success: {
          500: '#48bb78',
        },
        warning: {
          500: '#ed8936',
        },
        danger: {
          500: '#f56565',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
