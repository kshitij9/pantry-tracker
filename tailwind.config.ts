import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic expiry palette used across dashboard badges.
        critical: { DEFAULT: "#ef4444", bg: "#fef2f2", ring: "#fca5a5" },
        soon: { DEFAULT: "#eab308", bg: "#fefce8", ring: "#fde047" },
        fresh: { DEFAULT: "#22c55e", bg: "#f0fdf4", ring: "#86efac" },
      },
    },
  },
  plugins: [],
};

export default config;
