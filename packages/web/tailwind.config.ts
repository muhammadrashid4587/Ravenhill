import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-inter)", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Surfaces
        obsidian: "#0B0A0C",
        ink: "#141316",
        graphite: "#1C1B20",
        fog: "#25242A",
        // Brand
        oxblood: "#8B1E2F",
        claret: "#B23246",
        ember: "#5D0F1D",
        // Text
        bone: "#F5F0E6",
        parchment: "#E8E4DC",
        smoke: "#8A8A92",
        dusk: "#4A4A52",
        // Aliases used by existing pages — kept for back-compat.
        surface: "#141316",
        elevated: "#1C1B20",
      },
      boxShadow: {
        "lift-sm": "0 8px 24px -8px rgba(0, 0, 0, 0.55)",
        lift: "0 16px 40px -16px rgba(0, 0, 0, 0.65)",
        "oxblood-ring": "0 0 0 3px rgba(139, 30, 47, 0.18)",
      },
      fontSize: {
        "display-xl": ["clamp(3rem, 6vw, 5.25rem)", { lineHeight: "1.02", letterSpacing: "-0.03em" }],
        "display-lg": ["clamp(2.25rem, 4vw, 3.5rem)", { lineHeight: "1.05", letterSpacing: "-0.025em" }],
      },
    },
  },
  plugins: [],
};

export default config;
