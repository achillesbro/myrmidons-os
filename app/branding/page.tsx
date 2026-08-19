import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Branding — Myrmidons OS",
  description: "The MYRMIDONS design system: colors, typography, conventions.",
};

/**
 * /branding — the living spec of the site's visual identity, linked from the
 * footer. Everything here renders with the real tokens (CSS vars, font vars,
 * label conventions), so if the system changes this page changes with it.
 */

const COLORS = [
  { name: "BG_BASE", varName: "--bg-base", hex: "#0a1b34", usage: "Page background" },
  { name: "PANEL", varName: "--panel", hex: "#0d2240", usage: "Panel / card surfaces" },
  { name: "BORDER", varName: "--border", hex: "#457fc4", usage: "Borders, grid lines, structural blue" },
  { name: "GOLD", varName: "--gold", hex: "#a98629", usage: "Accent: emphasis, primary CTAs, IN DEV status" },
  { name: "SUCCESS", varName: "--success", hex: "#42d17d", usage: "Positive values, ACTIVE / live status" },
  { name: "DANGER", varName: "--danger", hex: "#ff6b6b", usage: "Negative values, OFFLINE / broken status" },
  { name: "TEXT", varName: "--text", hex: "#ffffff", usage: "Primary text" },
  { name: "TEXT_DIM", varName: "--text-dim", hex: "#8da9c4", usage: "Secondary text, labels, captions" },
];

const FONTS = [
  {
    name: "CINZEL",
    varName: "--font-brand",
    role: "Brand wordmark only — the MYRMIDONS name in the site header.",
    sampleClass: "font-brand text-3xl font-bold tracking-wide",
    sample: "MYRMIDONS",
    note: "Serif. Never used for UI text.",
  },
  {
    name: "DEPARTURE MONO",
    varName: "--font-header",
    role: "Display: headings, micro-labels (tracked uppercase), KPI values, buttons.",
    sampleClass: "font-header text-2xl uppercase",
    sample: "Intelligence and execution",
    note: "Pixel mono, single weight (400) — hierarchy comes from size and color, never boldness. Self-hosted, v1.500.",
  },
  {
    name: "IBM PLEX MONO",
    varName: "--font-body",
    role: "Body: paragraphs, table data, terminal output, addresses, numbers in running text.",
    sampleClass: "font-body text-sm",
    sample: "HEGEMON_V2 reallocates USDT0 and USDC across HyperEVM Morpho markets — 0123456789 Il1 O0 {}[]()",
    note: "Weights 400–700.",
  },
];

function SectionLabel({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="mb-6 mt-16 text-[9px] uppercase tracking-widest text-gold font-mono">
      [ {index} // {children} ]
    </div>
  );
}

export default function BrandingPage() {
  return (
    <div className="min-h-screen px-4 pb-24 pt-20 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-4">
          MYRMIDONS OS // DESIGN SYSTEM
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold uppercase tracking-tight">
          Branding<span className="text-gold">.</span>
        </h1>
        <p className="mt-4 max-w-2xl font-mono text-sm leading-relaxed text-text/80">
          The visual identity of the MYRMIDONS terminal: an industrial-cyberpunk
          dashboard — dark navy ground, structural blue grid lines, gold for what
          matters, everything monospaced. This page renders with the live tokens.
        </p>

        {/* Colors */}
        <SectionLabel index="01">COLORS</SectionLabel>
        <div className="grid grid-cols-2 border-l border-t border-border/50 md:grid-cols-4">
          {COLORS.map((c) => (
            <div key={c.name} className="border-b border-r border-border/50 p-4">
              <div
                className="mb-3 h-14 w-full border border-border/30"
                style={{ backgroundColor: `var(${c.varName})` }}
              />
              <div className="text-[10px] uppercase tracking-widest font-mono">{c.name}</div>
              <div className="mt-1 font-body text-[10px] text-text-dim">
                {c.varName} · {c.hex}
              </div>
              <div className="mt-2 font-body text-[11px] leading-relaxed text-text/70">
                {c.usage}
              </div>
            </div>
          ))}
        </div>

        {/* Typography */}
        <SectionLabel index="02">TYPOGRAPHY</SectionLabel>
        <div className="border-l border-t border-border/50">
          {FONTS.map((f) => (
            <div
              key={f.name}
              className="grid gap-4 border-b border-r border-border/50 p-5 sm:grid-cols-[220px_1fr] sm:p-6"
            >
              <div>
                <div className="text-[10px] uppercase tracking-widest font-mono">{f.name}</div>
                <div className="mt-1 font-body text-[10px] text-text-dim">{f.varName}</div>
                <p className="mt-3 font-body text-[11px] leading-relaxed text-text/70">{f.role}</p>
                <p className="mt-2 font-body text-[10px] leading-relaxed text-text-dim">{f.note}</p>
              </div>
              <div className="flex items-center overflow-x-auto">
                <span className={f.sampleClass}>{f.sample}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Conventions */}
        <SectionLabel index="03">CONVENTIONS</SectionLabel>
        <div className="grid border-l border-t border-border/50 md:grid-cols-2">
          <div className="border-b border-r border-border/50 p-5 sm:p-6">
            <div className="mb-3 text-[10px] uppercase tracking-widest font-mono text-text-dim">
              MICRO-LABELS
            </div>
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              STRATEGIES // VAULT_V2 // HEGEMON_V2
            </div>
            <p className="mt-3 font-body text-[11px] leading-relaxed text-text/70">
              Tracked uppercase at 9–10px, dim by default, gold for section indexes.
              Double-slash separators namespace the hierarchy. Any{" "}
              <span className="text-text/90">tracking-widest / tracking-wider</span> text
              renders in the display font.
            </p>
          </div>
          <div className="border-b border-r border-border/50 p-5 sm:p-6">
            <div className="mb-3 text-[10px] uppercase tracking-widest font-mono text-text-dim">
              STATUS COLORS
            </div>
            <div className="space-y-2 text-[9px] uppercase tracking-widest font-mono">
              <div className="flex items-center gap-2 text-success">
                <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-success" /> ACTIVE / LIVE
              </div>
              <div className="flex items-center gap-2 text-gold">
                <span className="h-1.5 w-1.5 animate-pulse-slow rounded-full bg-gold" /> IN DEVELOPMENT
              </div>
              <div className="flex items-center gap-2 text-danger">
                <span className="h-1.5 w-1.5 rounded-full bg-danger" /> OFFLINE / BROKEN
              </div>
            </div>
            <p className="mt-3 font-body text-[11px] leading-relaxed text-text/70">
              Green and gold pulse; red holds still. The same trio classifies vaults,
              markets and services everywhere on the site.
            </p>
          </div>
          <div className="border-b border-r border-border/50 p-5 sm:p-6">
            <div className="mb-3 text-[10px] uppercase tracking-widest font-mono text-text-dim">
              GRID PANELS
            </div>
            <div className="grid grid-cols-2 border-l border-t border-border/50">
              {["$472,498", "12.83%", "0.88", "IN DEV"].map((v, i) => (
                <div key={i} className="border-b border-r border-border/50 bg-bg-panel p-3">
                  <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
                    KPI_{i + 1}
                  </div>
                  <div className="mt-1 font-header text-sm font-bold">{v}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 font-body text-[11px] leading-relaxed text-text/70">
              Shared edges, never doubled: <span className="text-text/90">border-l border-t</span>{" "}
              on the grid, <span className="text-text/90">border-r border-b</span> per panel.
            </p>
          </div>
          <div className="border-b border-r border-border/50 p-5 sm:p-6">
            <div className="mb-3 text-[10px] uppercase tracking-widest font-mono text-text-dim">
              BUTTONS
            </div>
            <div className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-2 border border-gold px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-gold glow-border-gold">
                {"> PRIMARY"}
              </span>
              <span className="inline-flex items-center gap-2 border border-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-text">
                {"> SECONDARY"}
              </span>
            </div>
            <p className="mt-3 font-body text-[11px] leading-relaxed text-text/70">
              Square-cornered, bordered, tracked uppercase with a{" "}
              <span className="text-text/90">{">"}</span> prompt prefix. Gold + glow for the
              one primary action per view; border-blue for the rest.
            </p>
          </div>
        </div>

        <p className="mt-10 font-mono text-[9px] uppercase tracking-widest text-text-dim">
          FONTS: DEPARTURE MONO (OFL) · IBM PLEX MONO (OFL) · CINZEL (OFL)
        </p>
      </div>
    </div>
  );
}
