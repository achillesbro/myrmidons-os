import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "var(--bg-base)",
          panel: "var(--panel)",
        },
        panel: "var(--panel)",
        border: "var(--border)",
        gold: "var(--gold)",
        success: "var(--success)",
        danger: "var(--danger)",
        text: {
          DEFAULT: "var(--text)",
          dim: "var(--text-dim, #8da9c4)",
        },
      },
      fontFamily: {
        mono: ["var(--font-ibm-plex-mono)", "IBM Plex Mono", "monospace"],
      },
      boxShadow: {
        crt: "0 0 10px rgba(69, 127, 196, 0.15), inset 0 0 15px rgba(0,0,0,0.3)",
      },
      backgroundImage: {
        "grid-pattern": "linear-gradient(to right, #1e3a5f 1px, transparent 1px), linear-gradient(to bottom, #1e3a5f 1px, transparent 1px)",
        "scanlines": "linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.3))",
      },
      backgroundSize: {
        "grid": "40px 40px",
        "scanlines": "100% 4px",
      },
      keyframes: {
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        blink: "blink 1s step-end infinite",
        "pulse-slow": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;

