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
        },
        panel: "var(--panel)",
        border: "var(--border)",
        gold: "var(--gold)",
        success: "var(--success)",
        danger: "var(--danger)",
        text: "var(--text)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;

