"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { WORDMARK_ROWS } from "@/lib/landing/wordmark";
import { DocsFormatLab } from "./docs-mock";

/**
 * /test — internal design lab, intentionally unlinked from the site.
 * Static reproductions of the landing (first half), a vault page snippet
 * and a MNEMON snippet, rendered with the site's real classes. Use it to
 * eyeball global styling changes (fonts, colors, spacing) on realistic
 * layouts without touching live data.
 */

function LabTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 mt-20 flex items-center gap-3 first:mt-10">
      <span className="h-px flex-1 bg-[var(--border)]/40" />
      <span className="font-body text-[10px] uppercase tracking-widest text-text-dim">
        {children}
      </span>
      <span className="h-px flex-1 bg-[var(--border)]/40" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 01 — Landing, first half                                            */
/* ------------------------------------------------------------------ */

const LOOP_STEPS = [
  {
    step: "01",
    title: "OBSERVE",
    body: "MNEMON samples every Morpho market on HyperEVM every 15 minutes: supply and borrow rates, utilization, available liquidity, borrower health.",
  },
  {
    step: "02",
    title: "CLASSIFY",
    body: "Every snapshot runs through a broken-market classifier and investability rules: real collateral, liquidity deep enough to enter and exit, no abnormal rate behavior.",
  },
  {
    step: "03",
    title: "ALLOCATE",
    body: "HEGEMON, the reallocator, moves vault capital along a utilization-targeting curve, gated by churn and yield thresholds. Every move is simulated before it is sent onchain.",
  },
];

function LandingDemo() {
  return (
    <section>
      {/* Hero */}
      <div className="mb-6 text-[9px] uppercase tracking-widest text-text-dim font-mono">
        MYRMIDONS OS // HYPEREVM // CHAIN 999
      </div>
      <div
        aria-hidden
        // Block-glyph art: pixel-font ▀█▄ don't fill the tall line box, so
        // the wordmark stays on the body font (no tracking class).
        className="mb-8 hidden select-none overflow-hidden whitespace-pre font-mono text-white sm:block"
        style={{ fontSize: "clamp(0.5rem, 0.95vw, 0.68rem)", lineHeight: 2.2 }}
      >
        {WORDMARK_ROWS.map((row, i) => (
          <div key={i}>{row}</div>
        ))}
      </div>
      <p className="max-w-3xl text-2xl font-bold uppercase leading-tight tracking-tight sm:text-4xl font-header">
        Intelligence and execution for onchain credit<span className="text-gold">.</span>
      </p>
      <p className="mt-6 max-w-2xl font-mono text-sm leading-relaxed text-text/80 sm:text-base">
        MYRMIDONS is a research and execution stack for onchain lending markets. It
        continuously observes every Morpho market on HyperEVM, classifies which ones are
        real and investable, and reallocates vault capital toward the best of them.
        Automated, transparent, around the clock.
      </p>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        BUILT ON MORPHO · RUNNING ON HYPEREVM · FULLY OBSERVABLE
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <span className="inline-flex cursor-pointer items-center gap-2 border border-gold px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-gold glow-border-gold hover:bg-gold/10">
          {"> BOOT TERMINAL"}
        </span>
        <span className="inline-flex cursor-pointer items-center gap-2 border border-border px-4 py-2.5 font-mono text-[11px] font-bold uppercase tracking-widest text-text hover:bg-border/10">
          {"> EXPLORE MARKETS"}
        </span>
      </div>

      {/* 01 // HOW_IT_WORKS */}
      <div className="mt-16 border-t border-border/40 pt-10">
        <div className="mb-4 font-mono text-[9px] uppercase tracking-widest text-gold">
          [ 01 // HOW_IT_WORKS ]
        </div>
        <h2 className="mb-6 text-lg font-semibold uppercase tracking-wide sm:text-xl">
          One loop, run without pause
        </h2>
        <div className="mb-8 overflow-x-auto">
          <pre className="whitespace-pre font-mono text-[11px] leading-relaxed text-text-dim sm:text-xs">
            {"[ MNEMON ] ──▶ [ CLASSIFIER ] ──▶ [ HEGEMON ] ──▶ onchain"}
          </pre>
        </div>
        <div className="grid border-l border-t border-border/50 md:grid-cols-3">
          {LOOP_STEPS.map((s) => (
            <div key={s.step} className="border-b border-r border-border/50 p-5 sm:p-6">
              <div className="mb-2 font-mono text-[10px] tracking-widest text-gold">
                {s.step}
              </div>
              <h3 className="mb-3 text-sm font-bold uppercase tracking-widest">{s.title}</h3>
              <p className="font-mono text-[13px] leading-relaxed text-text/75">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 02 — Vault page snippet                                             */
/* ------------------------------------------------------------------ */

const VAULT_KPIS = [
  { label: "TOTAL TVL", value: "$472,498.11", sub: "+2.4% / 7d", subColor: "var(--success)" },
  { label: "NET APY", value: "12.83%", sub: "7d avg 11.96%", subColor: "var(--text-dim)" },
  { label: "UTILISATION", value: "0.88", sub: "target U0 0.88", subColor: "var(--gold)" },
  { label: "STATUS", value: "IN DEV", sub: "HEGEMON_V2", subColor: "var(--text-dim)" },
];

const ALLOCATIONS = [
  { market: "WHYPE / USDC", weight: "42.1%", util: "0.89", apy: "13.42%", status: "OPTIMAL", color: "var(--success)" },
  { market: "kHYPE / USDC", weight: "31.6%", util: "0.91", apy: "12.87%", status: "SATURATED", color: "var(--gold)" },
  { market: "UBTC / USDC", weight: "18.9%", util: "0.84", apy: "11.02%", status: "BELOW U0", color: "var(--text-dim)" },
  { market: "IDLE", weight: "7.4%", util: "—", apy: "—", status: "CASH", color: "var(--text-dim)" },
];

function VaultDemo() {
  return (
    <section>
      <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
        STRATEGIES // VAULT_V2 // HEGEMON_V2
      </p>
      <h2 className="mt-3 text-2xl uppercase tracking-wide sm:text-3xl font-bold">
        Myrmidons USDC
      </h2>
      <div className="mt-6 grid grid-cols-2 border-l border-t border-border/50 sm:grid-cols-4">
        {VAULT_KPIS.map((k) => (
          <div key={k.label} className="border-b border-r border-border/50 bg-bg-panel p-4">
            <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              {k.label}
            </p>
            <p
              className="mt-2 text-xl font-bold font-header"
              style={{ color: k.label === "STATUS" ? "var(--gold)" : undefined }}
            >
              {k.value}
            </p>
            <p className="mt-1 font-body text-[10px]" style={{ color: k.subColor }}>
              {k.sub}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 border border-border/50 bg-bg-panel">
        <div className="border-b border-border/50 px-4 py-3">
          <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            ALLOCATIONS // LIVE
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body text-xs">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-text-dim">
                {["Market", "Weight", "Util", "APY"].map((h) => (
                  <th key={h} className="px-4 py-2 font-normal">{h}</th>
                ))}
                <th className="px-4 py-2 text-right font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {ALLOCATIONS.map((a) => (
                <tr key={a.market} className="border-t border-border/20">
                  <td className="px-4 py-2.5">{a.market}</td>
                  <td className="px-4 py-2.5">{a.weight}</td>
                  <td className="px-4 py-2.5">{a.util}</td>
                  <td className="px-4 py-2.5">{a.apy}</td>
                  <td
                    className="px-4 py-2.5 text-right text-[9px] uppercase tracking-widest"
                    style={{ color: a.color }}
                  >
                    {a.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 03 — MNEMON snippet                                                 */
/* ------------------------------------------------------------------ */

const MNEMON_KPIS = [
  { label: "TOTAL SUPPLY", value: "$18.42M" },
  { label: "WITHDRAWAL LIQ.", value: "$3.91M" },
  { label: "BEST DEPLOYABLE APY", value: "13.42%", gold: true },
  { label: "INVESTABLE", value: "11" },
  { label: "AT-RISK", value: "2" },
  { label: "DATA AGE", value: "4m" },
];

const MNEMON_COLS = [
  { label: "MARKET", align: "text-left" },
  { label: "UTIL", align: "text-right" },
  { label: "SUPPLY APY", align: "text-right" },
  { label: "APY@TARGET", align: "text-right" },
  { label: "SUPPLY", align: "text-right" },
  { label: "AVAILABLE", align: "text-right" },
  { label: "NET 24H", align: "text-right" },
  { label: "STATUS", align: "text-right" },
];

const MNEMON_ROWS = [
  { cells: ["WHYPE / USDT0", "0.91", "13.42%", "12.10%", "$1.82M", "$164k", "+$82k"], status: "OK", color: "var(--success)" },
  { cells: ["kHYPE / USDC", "0.89", "12.87%", "12.35%", "$920k", "$101k", "−$12k"], status: "OK", color: "var(--success)" },
  { cells: ["UBTC / USDT0", "0.84", "11.02%", "12.88%", "$2.40M", "$388k", "+$5k"], status: "OK", color: "var(--success)" },
  { cells: ["LIQD / USDT0", "0.99", "122.40%", "—", "$412", "$4", "$0"], status: "BROKEN", color: "var(--danger)" },
];

function MnemonDemo() {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold uppercase tracking-wide sm:text-xl">
          MNEMON // MARKET ANALYSER
        </h2>
        <span className="text-[9px] uppercase tracking-widest text-success font-mono">
          ● LIVE
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 border-l border-t border-border/50 sm:grid-cols-3 lg:grid-cols-6">
        {MNEMON_KPIS.map((k) => (
          <div key={k.label} className="border-b border-r border-border/50 bg-bg-panel p-4">
            <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              {k.label}
            </p>
            <p
              className="mt-2 text-lg font-bold font-header"
              style={{ color: k.gold ? "var(--gold)" : undefined }}
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-5 border border-border/50 bg-bg-panel">
        <div className="overflow-x-auto">
          <table className="w-full text-left font-body text-xs">
            <thead>
              <tr className="text-[9px] uppercase tracking-widest text-text-dim">
                {MNEMON_COLS.map((c) => (
                  <th key={c.label} className={cn("px-4 py-3 font-normal", c.align)}>
                    {c.label} <span className="text-border">▾</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MNEMON_ROWS.map((r) => (
                <tr key={r.cells[0]} className="border-t border-border/20">
                  {r.cells.map((c, i) => (
                    <td key={i} className={cn("px-4 py-2.5", i === 0 ? "text-left" : "text-right")}>
                      {c}
                    </td>
                  ))}
                  <td
                    className="px-4 py-2.5 text-right text-[9px] uppercase tracking-widest"
                    style={{ color: r.color }}
                  >
                    {r.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TestPage() {
  return (
    <div className="min-h-screen px-4 pb-24 pt-20 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <h1 className="font-header text-lg uppercase tracking-widest">Design lab</h1>
        <p className="mt-1 font-body text-xs text-text-dim">
          Internal only — static mocks of the landing, vault and MNEMON layouts for
          eyeballing global styling changes. Not linked anywhere on the site.
        </p>

        <LabTitle>01 · Landing — first half</LabTitle>
        <LandingDemo />

        <LabTitle>02 · Vault page — snippet</LabTitle>
        <VaultDemo />

        <LabTitle>03 · MNEMON — snippet</LabTitle>
        <MnemonDemo />
      </div>

      {/* Wider container: the two docs formats sit side by side on desktop. */}
      <div className="mx-auto max-w-7xl">
        <LabTitle>04 · Docs — format A vs format B</LabTitle>
        <DocsFormatLab />
      </div>
    </div>
  );
}
