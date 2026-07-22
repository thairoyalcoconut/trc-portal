import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f4f9f0",
          100: "#e3efd8",
          500: "#4a7c2f",
          600: "#3b6425",
          700: "#2e4e1d",
        },
      },
    },
  },
  plugins: [],
};
export default config;
