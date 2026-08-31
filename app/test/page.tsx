"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Michroma, Share_Tech_Mono, Sorts_Mill_Goudy } from "next/font/google";
import { cn } from "@/lib/utils";
import { WORDMARK_ROWS } from "@/lib/landing/wordmark";
import { BellCurveChart } from "@/components/vault/BellCurveChart";
import { DocsNav, DocBody } from "@/components/docs/DocPage";
import { DOCS } from "@/lib/docs/content";

/* Blade Runner font stack (Google-Fonts stand-ins for the film's real faces:
   Eurostile Bold Extended → Michroma, OCR-A → Share Tech Mono,
   Goudy Old Style (opening crawl) → Sorts Mill Goudy). Loaded here only —
   the BR themes point --font-header/--font-body/--font-brand at them. */
const brDisplay = Michroma({ weight: "400", subsets: ["latin"], variable: "--font-br-display" });
const brMono = Share_Tech_Mono({ weight: "400", subsets: ["latin"], variable: "--font-br-mono" });
const brSerif = Sorts_Mill_Goudy({ weight: "400", subsets: ["latin"], variable: "--font-br-serif" });

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

// Static echo of DepositPanel: mode tabs, amount box, receipt lines, CTA,
// append-only tx log. Values hardcoded — write flow lives in the real panel.
function DepositMock() {
  return (
    <div className="border border-border/50 bg-bg-panel">
      <div className="border-b border-border/50 px-4 py-3">
        <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
          DEPOSIT // MYRMIDONS_USDC
        </p>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2 border border-border bg-panel p-1">
          <span className="cursor-pointer bg-gold/15 py-1.5 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-gold">
            Deposit
          </span>
          <span className="cursor-pointer py-1.5 text-center font-mono text-[10px] uppercase tracking-widest text-text-dim hover:text-text">
            Withdraw
          </span>
        </div>
        <div className="border border-border bg-panel/30 p-3">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-wider text-text-dim">
            AMOUNT
          </p>
          <div className="mb-2 flex items-stretch gap-2">
            <div className="w-full border border-border bg-bg-base p-2 font-mono text-lg text-white">
              1,000.00
            </div>
            <div className="flex shrink-0 items-center gap-1 border border-border bg-bg-base px-2">
              <span className="icon-slot h-[14px] w-[14px] border-success glow-gold-icon" />
              <span className="text-[10px] font-bold text-white">USDC</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] text-text-dim">
              WALLET · 12,404.55 USDC
            </span>
            <div className="flex gap-1">
              {["25%", "50%", "MAX"].map((chip) => (
                <span
                  key={chip}
                  className="cursor-pointer border border-border px-2 py-0.5 text-[8px] font-bold uppercase text-text-dim hover:bg-border/20 hover:text-white"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-1 font-mono text-xs text-text-dim">
          <div className="flex justify-between">
            <span>YOU RECEIVE</span>
            <span className="text-text">~982.1073 shares</span>
          </div>
          <div className="flex justify-between text-text-dim/50">
            <span>SHARE PRICE</span>
            <span>1.0182 USDC</span>
          </div>
        </div>
        <span className="block cursor-pointer border border-gold bg-gold/80 py-2 text-center font-mono text-[11px] font-bold uppercase tracking-widest text-text hover:bg-gold">
          Approve USDC → Deposit
        </span>
        <div className="space-y-0.5 border-t border-border/20 pt-2 font-mono text-[10px]">
          <p className="text-text-dim">13:58:41 approve(USDC, 1,000.00) … confirmed</p>
          <p className="text-text-dim">13:58:52 deposit(1,000.00, 0x7EE3…9766) sent</p>
          <p className="text-success">13:58:57 deposit confirmed · 982.1073 shares minted</p>
        </div>
      </div>
    </div>
  );
}

// Static echo of ReallocatorTerminal (TERMINAL // LIVE_FEED): timestamped
// keeper lines, one plan with per-market moves the way lib/logs/jsonl.ts
// formats them.
const FEED_LINES: { t: string; tag: string; tagColor: string; msg: ReactNode }[] = [
  { t: "14:00:02", tag: "INFO", tagColor: "var(--text-dim)", msg: "tick_start · HEGEMON_V2 · vault 0x7EE3…9766" },
  { t: "14:00:04", tag: "INFO", tagColor: "var(--text-dim)", msg: "scores computed · 12 markets · best WHYPE / USDC 13.42%" },
  {
    t: "14:00:05",
    tag: "PLAN",
    tagColor: "var(--gold)",
    msg: (
      <>
        out: kHYPE <span className="text-danger">−2.10%</span> → in: WHYPE{" "}
        <span className="text-success">+2.58%</span> · apy 12.71→12.94 · weight 31.6→29.5
      </>
    ),
  },
  { t: "14:00:09", tag: "OK", tagColor: "var(--success)", msg: "reallocation sent · tx 0x8f3a…c21e · gas 412k" },
  { t: "14:00:09", tag: "INFO", tagColor: "var(--text-dim)", msg: "tick_end · next tick in 15m" },
  { t: "14:15:02", tag: "INFO", tagColor: "var(--text-dim)", msg: "tick_start · HEGEMON_V2 · vault 0x7EE3…9766" },
  { t: "14:15:06", tag: "SKIP", tagColor: "var(--gold)", msg: "tick_skip · churn gate: best move 2.1bps < 5bps floor" },
];

function LiveFeedMock() {
  return (
    <div className="flex flex-col border border-border/50 bg-bg-base/50">
      <div className="flex items-center justify-between border-b border-border/50 bg-panel/30 px-4 py-3">
        <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
          TERMINAL // LIVE_FEED
        </p>
        <span className="text-[9px] uppercase tracking-widest text-success font-mono">
          ● STREAMING
        </span>
      </div>
      <div className="flex-1 space-y-1 p-3 font-mono text-[10px] leading-relaxed">
        {FEED_LINES.map((l, i) => (
          <div key={i} className="flex flex-wrap items-start gap-x-2">
            <span className="shrink-0 text-text-dim">{l.t}</span>
            <span className="shrink-0 font-bold" style={{ color: l.tagColor }}>
              {l.tag}
            </span>
            <span className="min-w-0 flex-1 break-words text-text/80">{l.msg}</span>
          </div>
        ))}
        <p className="pt-1">
          <span className="inline-block h-3 w-2 animate-pulse bg-gold/80" />
        </p>
      </div>
    </div>
  );
}

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

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <DepositMock />
        <LiveFeedMock />
      </div>

      <div className="mt-5 border border-border/50 bg-bg-panel">
        <div className="border-b border-border/50 px-4 py-3">
          <p className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            STRATEGY // UTIL_ATTRACTIVENESS (HEGEMON_V2)
          </p>
        </div>
        <div className="p-4">
          <BellCurveChart height={280} weightedUtilization={0.88} />
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

/* Static echo of MnemonMarketDrilldown: sparkline + LIQUIDATIONS list on
   top, then the six metric panels. Same classes as the real component,
   hardcoded values. */

function DMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="flex justify-between gap-3 text-[10px] font-mono">
      <span className="text-text-dim">{label}</span>
      <span style={{ color: color ?? "var(--text)" }}>{value}</span>
    </div>
  );
}

function DPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 bg-bg-base p-3">
      <div className="border-b border-border/20 pb-1 text-[9px] uppercase tracking-widest text-text-dim font-mono">
        {title}
      </div>
      {children}
    </div>
  );
}

// Hand-drawn 7d APY/util sparkline with a net-flow bar strip, standing in
// for MarketSparkline (recharts) — enough to eyeball line/bar colors.
function SparklineMock() {
  return (
    <svg viewBox="0 0 600 190" preserveAspectRatio="none" className="h-full w-full">
      {[38, 76, 114].map((y) => (
        <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="var(--border)" strokeOpacity="0.15" />
      ))}
      <polyline
        points="0,80 60,74 120,82 180,60 240,66 300,50 360,58 420,42 480,52 540,38 600,44"
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.5"
      />
      <polyline
        points="0,110 60,104 120,112 180,96 240,100 300,88 360,96 420,84 480,92 540,80 600,86"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
      />
      {[
        { x: 40, h: 16, up: true },
        { x: 130, h: 8, up: false },
        { x: 220, h: 22, up: true },
        { x: 310, h: 12, up: true },
        { x: 400, h: 18, up: false },
        { x: 490, h: 26, up: true },
      ].map((b) => (
        <rect
          key={b.x}
          x={b.x}
          width="14"
          y={b.up ? 172 - b.h : 172}
          height={b.h}
          fill={b.up ? "var(--success)" : "var(--danger)"}
          fillOpacity="0.55"
        />
      ))}
      <line x1="0" y1="172" x2="600" y2="172" stroke="var(--border)" strokeOpacity="0.3" />
    </svg>
  );
}

const LIQ_ROWS = [
  { when: "AUG 28 14:12", repaid: "$41.2k", seized: "$44.9k", tx: "3f9c… ↗", badDebt: false },
  { when: "AUG 21 03:55", repaid: "$8.7k", seized: "$9.4k", tx: "b02e… ↗", badDebt: true },
];

function MnemonDrilldownMock() {
  return (
    <div className="space-y-4 border-t border-border bg-panel/40 p-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="h-64 min-h-[16rem] lg:col-span-2">
          <div className="mb-2 text-[9px] uppercase tracking-widest text-text-dim font-mono">
            SUPPLY_APY / UTILIZATION / NET_FLOWS // 7D
          </div>
          <div className="h-[calc(100%-1.25rem)]">
            <SparklineMock />
          </div>
        </div>
        <div>
          <div className="mb-1 text-[9px] uppercase tracking-widest text-text-dim font-mono">
            LIQUIDATIONS // 30D
          </div>
          <div className="mb-2 text-[10px] font-mono leading-snug text-text-dim/60">
            This market&apos;s liquidations repaying &gt;5% of the book.{" "}
            <span className="text-danger">BAD_DEBT</span> = the shortfall was
            socialized to lenders.
          </div>
          <div className="space-y-0.5">
            <div className="grid grid-cols-[5rem_1fr_1fr_3.5rem] items-center gap-x-2 border-b border-border/20 pb-1 text-[9px] font-mono uppercase tracking-wider text-text-dim/60">
              <span>WHEN</span>
              <span className="text-right">REPAID</span>
              <span className="text-right">SEIZED</span>
              <span className="text-right">TX</span>
            </div>
            {LIQ_ROWS.map((l) => (
              <div
                key={l.when}
                className="grid grid-cols-[5rem_1fr_1fr_3.5rem] items-center gap-x-2 border-b border-border/20 py-1 text-[10px] font-mono last:border-0"
              >
                <span className={l.badDebt ? "text-danger" : "text-text-dim"}>
                  {l.when}
                  {l.badDebt && <span aria-hidden> !</span>}
                </span>
                <span className="text-right text-danger">{l.repaid}</span>
                <span className="text-right text-text-dim/70">{l.seized}</span>
                <span className="text-right text-text-dim/70">{l.tx}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        <DPanel title="Borrower Risk">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <DMetric label="BORROWERS" value="14" />
            <DMetric label="MIN_HEALTH" value="1.03" color="var(--danger)" />
            <DMetric label="TOP1_CONC" value="34%" />
            <DMetric label="TOP3_CONC" value="61%" color="var(--gold)" />
            <DMetric label="NEAR_LIQ" value="2 · 8%" />
            <DMetric label="CAPACITY" value="1.42×" color="var(--success)" />
          </div>
        </DPanel>
        <DPanel title="Lender Book">
          <DMetric label="SUPPLIERS" value="38" />
          <DMetric label="TOP1_SHARE" value="52%" color="var(--gold)" />
          <DMetric label="TOP3_SHARE" value="71%" color="var(--gold)" />
          <DMetric label="TOP1_ADDR" value="0x4DC9…4d42 ⧉" color="var(--text-dim)" />
        </DPanel>
        <DPanel title="Utilization">
          <DMetric label="AVG_7D" value="90.7%" />
          <DMetric label="AVG_30D" value="88.9%" />
          <DMetric label="TIME>95% 30D" value="22.4%" color="var(--gold)" />
          <DMetric label="TIME>99% 30D" value="3.1%" />
        </DPanel>
        <DPanel title="Collateral">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <DMetric label="ORACLE" value="42.6112 USDT0" />
            <DMetric label="VS_DEFILLAMA" value="+0.4%" />
            <DMetric label="VOL_7D" value="58%" />
            <DMetric label="VOL_30D" value="64%" />
            <DMetric label="BREACH_24H" value="0.0%" />
            <DMetric label="MAX_DD_30D" value="12.4%" />
          </div>
        </DPanel>
        <DPanel title="Market">
          <DMetric label="HEGEMON" value="OPTIMAL" color="var(--success)" />
          <DMetric label="BORROW_APY" value="14.88%" />
          <DMetric label="LLTV" value="77%" />
          <DMetric label="VS_BEST" value="BEST" color="var(--success)" />
        </DPanel>
        <DPanel title="Flows (loan units)">
          <DMetric label="NET_SUPPLY_24H" value="+82.4k USDT0" color="var(--success)" />
          <DMetric label="NET_SUPPLY_7D" value="−12.1k USDT0" />
          <DMetric label="NET_BORROW_24H" value="+44.0k USDT0" />
          <DMetric label="LIQUIDATIONS_30D" value="1" color="var(--gold)" />
        </DPanel>
      </div>
    </div>
  );
}

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
        {/* Expanded row: the WHYPE / USDT0 drill-down, as the table renders it */}
        <MnemonDrilldownMock />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 04 — Docs: the shipped /docs format (real components, live content)  */
/* ------------------------------------------------------------------ */

const HEGEMON_DOC = DOCS.find((d) => d.slug === "hegemon")!;

function DocsDemo() {
  return (
    <section className="flex flex-col border border-border bg-bg-base md:flex-row">
      <DocsNav activeSlug="hegemon" />
      {/* overflow-y-auto doubles as SectionLink's scroll container */}
      <div className="max-h-[640px] min-w-0 flex-1 overflow-y-auto">
        <DocBody doc={HEGEMON_DOC} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Themes — CSS-var overrides scoped to this page's wrapper.           */
/* The whole site reads colors from these vars, so swapping them here  */
/* re-skins every mock (glows included) without touching components.   */
/* ------------------------------------------------------------------ */

const THEMES: Record<string, CSSProperties> = {
  CURRENT: {},
  // 1982 poster: black, title red as THE accent, credit-orange dim text,
  // searchlight yellow for healthy states, neon-sign magenta for danger.
  "BR // NEON": {
    "--bg-base": "#030202",
    "--panel": "#0e0605",
    "--border": "#8a2a1c",
    "--gold": "#ff2e1f",
    "--success": "#ffd23f",
    "--danger": "#ff2d95",
    "--text": "#f2e6da",
    "--text-dim": "#b96a45",
    "--font-header": "var(--font-br-display)",
    "--font-body": "var(--font-br-mono)",
    "--font-brand": "var(--font-br-serif)",
  } as CSSProperties,
  // Strict black bg / red font. White is the alarm color.
  "BR // RED MONO": {
    "--bg-base": "#000000",
    "--panel": "#0b0302",
    "--border": "#58130d",
    "--gold": "#ff2419",
    "--success": "#c9372b",
    "--danger": "#ffffff",
    "--text": "#e8372c",
    "--text-dim": "#7e211a",
    "--font-header": "var(--font-br-display)",
    "--font-body": "var(--font-br-mono)",
    "--font-brand": "var(--font-br-serif)",
  } as CSSProperties,
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function TestPage() {
  const [theme, setTheme] = useState<keyof typeof THEMES>("CURRENT");
  return (
    <div
      className={cn(
        "min-h-screen bg-bg-base px-4 pb-24 pt-20 text-text sm:px-8",
        brDisplay.variable,
        brMono.variable,
        brSerif.variable,
      )}
      style={THEMES[theme]}
    >
      <div className="mx-auto max-w-5xl">
        <h1 className="font-header text-lg uppercase tracking-widest">Design lab</h1>
        <p className="mt-1 font-body text-xs text-text-dim">
          Internal only — static mocks of the landing, vault and MNEMON layouts for
          eyeballing global styling changes. Not linked anywhere on the site.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(Object.keys(THEMES) as (keyof typeof THEMES)[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "border px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest",
                t === theme
                  ? "border-gold text-gold glow-border-gold"
                  : "border-border/50 text-text-dim hover:bg-border/10",
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <LabTitle>01 · Landing — first half</LabTitle>
        <LandingDemo />

        <LabTitle>02 · Vault page — snippet</LabTitle>
        <VaultDemo />

        <LabTitle>03 · MNEMON — snippet</LabTitle>
        <MnemonDemo />
      </div>

      {/* Wider container so the docs sidebar + article breathe on desktop. */}
      <div className="mx-auto max-w-7xl">
        <LabTitle>04 · Docs — snippet (shipped format)</LabTitle>
        <DocsDemo />
      </div>
    </div>
  );
}
