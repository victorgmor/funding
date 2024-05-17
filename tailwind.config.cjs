/** @type {import('tailwindcss').Config} */
const defaultTheme = require("tailwindcss/defaultTheme");
const colors = require("tailwindcss/colors");
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
     fontFamily: {
     display: ["Clash Display", ...defaultTheme.fontFamily.sans],
      sans: ["Inter", ...defaultTheme.fontFamily.sans],
      mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono],
    },
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1rem" }],
      sm: ["0.875rem", { lineHeight: "1.5rem" }],
      base: ["1rem", { lineHeight: "1.75rem" }],
      lg: ["1.125rem", { lineHeight: "2rem" }],
      xl: ["1.25rem", { lineHeight: "2rem" }],
      "2xl": ["1.5rem", { lineHeight: "2rem" }],
      "3xl": ["2rem", { lineHeight: "2.5rem" }],
      "4xl": ["2.5rem", { lineHeight: "3.5rem" }],
      "5xl": ["3rem", { lineHeight: "3.5rem" }],
      "6xl": ["3.75rem", "1"],
      "7xl": ["4.5rem", "1.1"],
      "8xl": ["6rem", "1"],
      "9xl": ["8rem", "1"],
      "10xl": ["10rem", "1"],
      "11xl": ["12rem", "1"],
      "12xl": ["14rem", "1"],
      "13xl": ["16rem", "1"],
      "14xl": ["20rem", "1"],
      "15xl": ["24rem", "1"],
      "16xl": ["30rem", "1"],
      "17xl": ["40rem", "1"],
      "18xl": ["50rem", "1"],
      "19xl": ["60rem", "1"],
      "20xl": ["70rem", "1"],
    },
    colors: {
      transparent: colors.transparent,
      currentColor: colors.currentColor,
      zinc: colors.zinc,
      blue: colors.blue,
      black: "#1d1d1d",
      white: "#f9f9f9",

    },

    extend: {
      boxShadow: {
        tiny: "0px 1.5px",
        small: "0px 3px",
        DEFAULT: "0px 5px",
        large: "0px 10px",
      },
    },
  },
  plugins: [
    require("@tailwindcss/typography"),
    require("@tailwindcss/forms"),
    require("@tailwindcss/aspect-ratio"),
  ],
};
