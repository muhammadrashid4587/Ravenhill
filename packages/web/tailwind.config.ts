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
        // Surfaces — wired to CSS vars so [data-theme] flips the whole app.
        obsidian: "var(--bg-base)",
        ink: "var(--bg-surface)",
        graphite: "var(--bg-elevated)",
        fog: "var(--bg-hover)",
        // Brand
        oxblood: "var(--brand)",
        claret: "var(--brand-hover)",
        ember: "var(--brand-pressed)",
        // Text
        bone: "var(--text-primary)",
        parchment: "var(--text-body)",
        smoke: "var(--text-secondary)",
        dusk: "var(--text-tertiary)",
        // Aliases used by existing pages — kept for back-compat.
        surface: "var(--bg-surface)",
        elevated: "var(--bg-elevated)",
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
