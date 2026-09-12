/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f0ff",
          100: "#e6e1ff",
          200: "#c9bdff",
          300: "#a893ff",
          400: "#8563ff",
          500: "#6b3cff",
          600: "#5620e6",
          700: "#4318b3",
          800: "#33137f",
          900: "#210c52",
        },
        accent: {
          400: "#ffb43c",
          500: "#ff9a1f",
        },
      },
    },
  },
  plugins: [],
};
