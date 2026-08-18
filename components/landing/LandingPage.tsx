"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { GridKpi } from "@/components/ui/grid-kpi";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { CornerFrame } from "@/components/ui/corner-frame";
import { LandingFeed } from "@/components/landing/LandingFeed";
import { VaultTileCard } from "@/components/vault/VaultTileCard";
import { BellCurveChart } from "@/components/vault/BellCurveChart";
import { WORDMARK_ROWS, WORDMARK_CHARSET } from "@/lib/landing/wordmark";
import { useMarketHealth } from "@/lib/mnemon/queries";
import { computeMarketStats, isInvestable, isRealMarket } from "@/lib/mnemon/aggregate";
import { fmtAge, fmtPct, fmtRatio, fmtUsd, pairLabel } from "@/lib/mnemon/format";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import {
  USDT0_VAULT_ADDRESS,
  USDT0_VAULT_CHAIN_ID,
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";

/**
 * Landing page — the explainer for first-time visitors (the terminal lives at
 * /terminal and stays the product surface). Chrome comes from the shared site
 * Header (fixed, h-14 — hence the pt-14 on the wrapper), so the landing
 * matches the tools/vault pages.
 *
 * Reveal system: nothing ever shows a blinking caret. Text renders invisibly
 * (layout is reserved) until its section scrolls into view, then glitch-types
 * in (RevealText); section top rules draw in left-to-right; panels fade up
 * (RevealBox). GlitchTypeText itself honors prefers-reduced-motion, and the
 * CSS transitions carry motion-reduce fallbacks.
 */

const GITHUB_URL = "https://github.com/achillesbro";
const X_URL = "https://x.com/0xachilles";
const EXPLORER_ADDR = (addr: string) => `https://hyperevmscan.io/address/${addr}`;

/** Fire once when the element scrolls into view — drives all reveals. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "-40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

/** Glitch-types `value` in when scrolled to (after delayMs). Before that the
 *  text sits invisible in the layout — no caret, no reflow. */
function RevealText({
  value,
  className,
  delayMs = 0,
  revealMs,
  charset,
}: {
  value: string;
  className?: string;
  delayMs?: number;
  revealMs?: number;
  charset?: string;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const [go, setGo] = useState(false);
  useEffect(() => {
    if (!inView) return;
    if (delayMs <= 0) {
      setGo(true);
      return;
    }
    const t = setTimeout(() => setGo(true), delayMs);
    return () => clearTimeout(t);
  }, [inView, delayMs]);
  return (
    <span ref={ref} className={className}>
      {go ? (
        <GlitchTypeText loading={false} value={value} mode="text" revealMs={revealMs} charset={charset} />
      ) : (
        <span className="opacity-0" aria-hidden>
          {value}
        </span>
      )}
    </span>
  );
}

/** Fade-up wrapper for panels/frames. */
function RevealBox({
  children,
  className,
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delayMs}ms` }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none motion-reduce:opacity-100 motion-reduce:translate-y-0",
        inView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Section shell: top rule draws in left-to-right, then the `[ NN // NAME ]`
 *  micro-label glitch-types. */
function Section({
  index,
  name,
  children,
  className,
}: {
  index: string;
  name: string;
  children: ReactNode;
  className?: string;
}) {
  const { ref, inView } = useInView<HTMLElement>();
  return (
    <section ref={ref} className={cn("relative py-14 sm:py-20", className)}>
      <span
        aria-hidden
        className={cn(
          "absolute top-0 left-0 h-px bg-border/50 transition-[width] duration-700 ease-out motion-reduce:transition-none motion-reduce:w-full",
          inView ? "w-full" : "w-0"
        )}
      />
      <div className="text-[9px] uppercase tracking-widest text-gold font-mono mb-4">
        <RevealText value={`[ ${index} // ${name} ]`} delayMs={150} />
      </div>
      {children}
    </section>
  );
}

function CtaLink({
  href,
  children,
  primary = false,
  external = false,
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  external?: boolean;
}) {
  const className = cn(
    "inline-flex items-center gap-2 border px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest font-mono transition-colors",
    primary
      ? "border-gold text-gold glow-border-gold hover:bg-gold/10"
      : "border-border text-text hover:bg-border/10"
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

function Hero() {
  return (
    <section className="pt-12 pb-16 sm:pt-16 sm:pb-24">
      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-6">
        <RevealText value="MYRMIDONS OS // HYPEREVM // CHAIN 999" />
      </div>

      {/* Boot-sequence wordmark: same white block-glyph ASCII, row-staggered
          reveal out of block static; brand-title fallback on phones, exactly
          like the terminal boot. */}
      <div
        aria-hidden
        className="hidden sm:block font-mono text-white whitespace-pre select-none overflow-hidden mb-8"
        style={{ fontSize: "clamp(0.5rem, 0.95vw, 0.68rem)", lineHeight: 2.2 }}
      >
        {WORDMARK_ROWS.map((row, i) => (
          <div key={i}>
            <RevealText value={row} delayMs={100 + i * 90} revealMs={450} charset={WORDMARK_CHARSET} />
          </div>
        ))}
      </div>
      <div className="sm:hidden mb-8">
        <span className="font-brand text-3xl font-bold tracking-wide text-white glow-gold">
          MYRMIDONS
        </span>
      </div>

      <h1 className="sr-only">MYRMIDONS — intelligence and execution for onchain credit</h1>
      <p className="text-2xl sm:text-4xl font-bold uppercase tracking-tight leading-tight max-w-3xl">
        <RevealText
          value="Intelligence and execution for onchain credit"
          delayMs={500}
          revealMs={700}
        />
        <span className="text-gold">.</span>
      </p>
      <p className="mt-6 max-w-2xl font-mono text-sm sm:text-base text-text/80 leading-relaxed">
        <RevealText
          delayMs={800}
          revealMs={900}
          value="MYRMIDONS is a research and execution stack for onchain lending markets. It continuously observes every Morpho market on HyperEVM, classifies which ones are real and investable, and reallocates vault capital toward the best of them — automatically, transparently, around the clock."
        />
      </p>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        <RevealText delayMs={1100} value="BUILT ON MORPHO · RUNNING ON HYPEREVM · FULLY OBSERVABLE" />
      </p>
      <RevealBox delayMs={1200} className="mt-8 flex flex-wrap gap-3">
        <CtaLink href="/terminal" primary>
          &gt; BOOT TERMINAL
        </CtaLink>
        <CtaLink href="/tools/mnemon">&gt; EXPLORE MARKETS</CtaLink>
      </RevealBox>
    </section>
  );
}

const LOOP_STEPS = [
  {
    step: "01",
    title: "OBSERVE",
    body: "MNEMON samples every Morpho market on HyperEVM every 15 minutes — supply and borrow rates, utilization, available liquidity, borrower health. An independent archive, not a wrapper around someone else's API.",
  },
  {
    step: "02",
    title: "CLASSIFY",
    body: "Every snapshot runs through a broken-market classifier and investability rules: real collateral, liquidity deep enough to enter and exit, no abnormal rate behavior. A 12,000% APY on a $40 dust market is noise, not opportunity — most dashboards can't tell the difference.",
  },
  {
    step: "03",
    title: "ALLOCATE",
    body: "HEGEMON, the reallocator, moves vault capital along a utilization-targeting curve — churn- and yield-gated so it trades signal, not noise. Every move is simulated before it is sent onchain.",
  },
];

function TheLoop() {
  return (
    <Section index="01" name="HOW_IT_WORKS">
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-6">
        <RevealText value="One loop, run without pause" delayMs={250} />
      </h2>
      <div className="overflow-x-auto mb-8">
        <pre className="font-mono text-[11px] sm:text-xs text-text-dim leading-relaxed whitespace-pre">
          <RevealText
            value="[ MNEMON ] ──▶ [ CLASSIFIER ] ──▶ [ HEGEMON ] ──▶ onchain"
            delayMs={400}
            revealMs={600}
          />
        </pre>
      </div>
      <div className="grid md:grid-cols-3 border-l border-t border-border/50">
        {LOOP_STEPS.map((s, i) => (
          <RevealBox key={s.step} delayMs={i * 140} className="border-r border-b border-border/50 p-5 sm:p-6">
            <div className="text-[10px] font-mono text-gold tracking-widest mb-2">{s.step}</div>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-3">{s.title}</h3>
            <p className="font-mono text-[13px] text-text/75 leading-relaxed">
              <RevealText value={s.body} delayMs={i * 140 + 200} revealMs={800} />
            </p>
          </RevealBox>
        ))}
      </div>
    </Section>
  );
}

/** Best investable market by supply APY — the concrete "what MNEMON can do". */
function bestInvestable(markets: MarketHealthEntry[]): MarketHealthEntry | null {
  let best: MarketHealthEntry | null = null;
  for (const m of markets) {
    if (!isInvestable(m) || m.supply_apy == null) continue;
    if (best == null || (best.supply_apy ?? -Infinity) < m.supply_apy) best = m;
  }
  return best;
}

function MnemonSection() {
  const { data, isLoading, isError } = useMarketHealth();
  // Idle markets (null collateral) are vault cash, not lending markets.
  const markets = (data?.markets ?? []).filter(isRealMarket);
  const stats = computeMarketStats(markets);
  const best = bestInvestable(markets);
  // On fetch failure show dashes, not zeros — zeros read as real data.
  const n = (v: number) => (isError ? "—" : String(v));
  const usd = (v: number) => (isError ? "—" : fmtUsd(v));

  return (
    <Section index="02" name="INTELLIGENCE">
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide">
              <RevealText value="MNEMON — the memory" delayMs={250} />
            </h2>
            <StatusIndicator status="live" />
          </div>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-4">
            <RevealText
              delayMs={400}
              revealMs={800}
              value="An independent, 15-minute-sampled archive of every Morpho market on HyperEVM: supply and borrow APY, utilization spells, liquidity depth, borrower risk — plus a broken-market classifier the raw API can't give you."
            />
          </p>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-6">
            <RevealText
              delayMs={600}
              revealMs={800}
              value={'"Best APY" here always means best investable APY: non-broken markets with at least $10k of usable liquidity. Everything else is filtered before it can pollute a benchmark.'}
            />
          </p>
          <RevealBox delayMs={700}>
            <CtaLink href="/tools/mnemon">&gt; RUN MNEMON</CtaLink>
          </RevealBox>
        </div>
        <RevealBox delayMs={300}>
          <CornerFrame>
            <div className="grid grid-cols-2 border-l border-t border-border/50 m-3 mb-0">
              <GridKpi
                label="Markets Tracked"
                value={<GlitchTypeText loading={isLoading} value={n(stats.markets)} mode="number" />}
                className="border-r border-b border-border/50"
              />
              <GridKpi
                label="Total Supply"
                value={<GlitchTypeText loading={isLoading} value={usd(stats.totalSupplyUsd)} mode="text" />}
                className="border-r border-b border-border/50"
              />
              <GridKpi
                label="Best Investable APY"
                value={
                  <GlitchTypeText
                    loading={isLoading}
                    value={stats.bestDeployableApy != null ? fmtPct(stats.bestDeployableApy) : "—"}
                    mode="text"
                  />
                }
                accent="gold"
                cornerIndicator="gold"
                className="border-r border-b border-border/50"
              />
              <GridKpi
                label="Investable Markets"
                value={
                  <GlitchTypeText loading={isLoading} value={n(stats.deployableCount)} mode="number" />
                }
                subValue={
                  <span className="text-text-dim font-mono text-[10px]">
                    <GlitchTypeText
                      loading={isLoading}
                      value={
                        isError
                          ? "ARCHIVE UNREACHABLE"
                          : stats.brokenCount > 0
                            ? `${stats.brokenCount} BROKEN FILTERED · DATA AGE ${fmtAge(data?.generated_at)}`
                            : `DATA AGE ${fmtAge(data?.generated_at)}`
                      }
                      mode="text"
                    />
                  </span>
                }
                accent={isLoading || isError ? "default" : "success"}
                cornerIndicator={isLoading || isError ? "default" : "success"}
                className="border-r border-b border-border/50"
              />
            </div>
            {/* Live sample of the archive: the market its own rules rank best */}
            <div className="m-3 mt-0 border border-border/50 border-t-0 p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-[9px] uppercase tracking-widest text-gold font-mono">
                  BEST INVESTABLE MARKET
                </span>
                <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
                  {`RANKED BY MNEMON'S OWN RULES`}
                </span>
              </div>
              <div className="flex items-baseline gap-3 mb-3">
                <span className="text-base font-bold tracking-tight font-mono">
                  <GlitchTypeText
                    loading={isLoading}
                    value={best ? pairLabel(best.collateral_symbol, best.loan_symbol) : "—"}
                    mode="text"
                  />
                </span>
                <span className="text-[10px] font-mono text-text-dim uppercase tracking-widest">
                  <GlitchTypeText
                    loading={isLoading}
                    value={best?.lltv != null ? `LLTV ${fmtPct(best.lltv, 0)}` : ""}
                    mode="text"
                  />
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "SUPPLY APY", value: best ? fmtPct(best.supply_apy) : "—", gold: true },
                  { label: "UTILIZATION", value: best ? fmtPct(best.utilization) : "—" },
                  { label: "AVAILABLE", value: best ? fmtUsd(best.available_usd) : "—" },
                  {
                    label: "MIN BORROWER HF",
                    value: best?.borrower_risk?.min_hf != null ? fmtRatio(best.borrower_risk.min_hf) : "—",
                  },
                ].map((s) => (
                  <div key={s.label}>
                    <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
                      {s.label}
                    </div>
                    <div className={cn("text-sm font-bold tracking-tight font-mono", s.gold && "text-gold")}>
                      <GlitchTypeText loading={isLoading} value={s.value} mode="text" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CornerFrame>
        </RevealBox>
      </div>
    </Section>
  );
}

const STRATEGY_POINTS = [
  {
    key: "score",
    label: "score = yield × bell(u)",
    body: "Markets are scored on real yield weighted by a bell curve over utilization, centered on the target U₀ = 0.88 (σ = 0.05) — near-target markets are worth more than raw APY says.",
  },
  {
    key: "sat",
    label: "U ≥ 0.92 → ×0.4",
    body: "In the saturated band the inflow attractiveness is cut to 40%: markets running hot stop attracting new capital before they become a trap.",
  },
  {
    key: "crit",
    label: "U ≥ 0.95 → 0",
    body: "At critical utilization attractiveness goes to zero — exit liquidity outranks yield, always.",
  },
  {
    key: "gates",
    label: "churn + yield gates",
    body: "A move executes only if the simulated gain clears churn and gas thresholds. No trading noise for its own sake.",
  },
];

function HegemonSection() {
  return (
    <Section index="03" name="EXECUTION">
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
        <RevealText value="HEGEMON — the hands" delayMs={250} />
      </h2>
      <p className="font-mono text-sm text-text/80 leading-relaxed max-w-3xl mb-8">
        <RevealText
          delayMs={400}
          revealMs={800}
          value="An autonomous reallocator for Morpho Vault V2: one bot process managing the MYRMIDONS vaults. Depositors hold standard ERC-4626 vault shares; the strategy layer only ever reallocates between whitelisted Morpho markets."
        />
      </p>
      <div className="grid lg:grid-cols-5 gap-8 lg:gap-12 items-start mb-10">
        <div className="lg:col-span-2 space-y-5">
          {STRATEGY_POINTS.map((p, i) => (
            <div key={p.key}>
              <div className="text-[11px] font-mono font-bold text-gold tracking-wider mb-1">
                <RevealText value={p.label} delayMs={300 + i * 150} />
              </div>
              <p className="font-mono text-[12px] text-text/75 leading-relaxed">
                <RevealText value={p.body} delayMs={400 + i * 150} revealMs={700} />
              </p>
            </div>
          ))}
        </div>
        <RevealBox delayMs={350} className="lg:col-span-3">
          <CornerFrame className="p-4">
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
              UTILIZATION ATTRACTIVENESS — WHAT THE SCORER ACTUALLY APPLIES
            </div>
            <BellCurveChart height={300} />
          </CornerFrame>
        </RevealBox>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <RevealBox delayMs={100}>
          <VaultTileCard
            name="MYRMIDONS_USDT0"
            secondary="MORPHO VAULT V2 // USDT0 // HEGEMON_V2"
            address={HEGEMON_V2_VAULT_ADDRESS}
            chainId={HEGEMON_V2_VAULT_CHAIN_ID}
            route="/vaults/usdt0-v2"
          />
        </RevealBox>
        <RevealBox delayMs={240}>
          <VaultTileCard
            name="MYRMIDONS_USDC"
            secondary="MORPHO VAULT V2 // USDC // HEGEMON_V2"
            address={USDC_V2_VAULT_ADDRESS}
            chainId={USDC_V2_VAULT_CHAIN_ID}
            route="/vaults/usdc-v2"
          />
        </RevealBox>
      </div>
    </Section>
  );
}

function ObservabilitySection() {
  return (
    <Section index="04" name="OBSERVABILITY">
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
            <RevealText value="No dashboard theater" delayMs={250} />
          </h2>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-4">
            <RevealText
              delayMs={400}
              revealMs={700}
              value="Every decision the reallocator makes — plans, simulations, transactions, skipped ticks and why — is streamed live to this site. Every position is verifiable onchain."
            />
          </p>
          <ul className="font-mono text-[12px] text-text/70 leading-relaxed space-y-2">
            <li className="flex gap-2">
              <span className="text-gold shrink-0">└─</span>
              <span>
                USDT0 vault:{" "}
                <a
                  href={EXPLORER_ADDR(HEGEMON_V2_VAULT_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-dim underline decoration-border/60 underline-offset-2 hover:text-gold break-all"
                >
                  {HEGEMON_V2_VAULT_ADDRESS}
                </a>
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-gold shrink-0">└─</span>
              <span>
                USDC vault:{" "}
                <a
                  href={EXPLORER_ADDR(USDC_V2_VAULT_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-dim underline decoration-border/60 underline-offset-2 hover:text-gold break-all"
                >
                  {USDC_V2_VAULT_ADDRESS}
                </a>
              </span>
            </li>
          </ul>
        </div>
        <RevealBox delayMs={300}>
          <LandingFeed />
        </RevealBox>
      </div>
    </Section>
  );
}

const SYSTEM_ROWS: {
  name: string;
  detail: string;
  status: "live" | "dev" | "offline";
  note: string;
}[] = [
  {
    name: "MNEMON",
    detail: "MARKET INTELLIGENCE ARCHIVE",
    status: "live",
    note: "15-MIN CADENCE",
  },
  {
    name: "MYRMIDONS_USDT0",
    detail: "MORPHO VAULT V2 // HEGEMON_V2",
    status: "dev",
    note: "DEPOSITS OPEN",
  },
  {
    name: "MYRMIDONS_USDC",
    detail: "MORPHO VAULT V2 // HEGEMON_V2",
    status: "dev",
    note: "DEPOSITS OPEN",
  },
  {
    name: "HEGEMON V1",
    detail: "MORPHO METAMORPHO // USDT0",
    status: "offline",
    note: "DEPRECATED — WITHDRAWALS OPEN",
  },
];

function SystemStateSection() {
  return (
    <Section index="05" name="SYSTEM_STATE">
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-6">
        <RevealText value="Where things stand" delayMs={250} />
      </h2>
      <RevealBox delayMs={300}>
        <div className="border-l border-t border-border/50">
          {SYSTEM_ROWS.map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(11rem,1fr)_2fr_auto] gap-x-4 gap-y-1 items-center border-r border-b border-border/50 px-4 py-3"
            >
              <div className="font-mono text-[12px] font-bold uppercase tracking-widest">
                {row.name}
              </div>
              <div className="hidden sm:block font-mono text-[10px] uppercase tracking-widest text-text-dim">
                {row.detail} · {row.note}
              </div>
              <StatusIndicator status={row.status} />
            </div>
          ))}
        </div>
      </RevealBox>
      <p className="mt-6 font-mono text-[11px] text-text-dim leading-relaxed max-w-3xl">
        <RevealText
          delayMs={450}
          revealMs={700}
          value="MYRMIDONS is an early-stage system under active development. The vaults are standard Morpho Vault V2 contracts; the strategy layer on top is unaudited. Nothing on this site is financial advice — allocate accordingly."
        />
      </p>
    </Section>
  );
}

function ContactSection() {
  return (
    <Section index="06" name="CONTACT">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
            <RevealText value="Built by 0xachilles" delayMs={250} />
          </h2>
          <p className="font-mono text-sm text-text/80 leading-relaxed max-w-xl mb-6">
            <RevealText
              delayMs={400}
              revealMs={700}
              value="Data pipeline, strategy engine, contracts integration and this interface — one operator, fully accountable. Questions, partnerships, or a look under the hood:"
            />
          </p>
          <RevealBox delayMs={500} className="flex flex-wrap gap-3">
            <CtaLink href={GITHUB_URL} external>
              GITHUB // ACHILLESBRO
            </CtaLink>
            <CtaLink href={X_URL} external>
              X // @0XACHILLES
            </CtaLink>
          </RevealBox>
        </div>
        <RevealBox delayMs={600}>
          <CtaLink href="/terminal" primary>
            &gt; BOOT TERMINAL
          </CtaLink>
        </RevealBox>
      </div>
      <div className="mt-14 pt-6 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-widest text-text-dim">
        <span>MYRMIDONS(1) · HYPEREVM · 2026</span>
        <span>(c) Myrmidons Strategies</span>
      </div>
    </Section>
  );
}

export function LandingPage() {
  const router = useRouter();

  // Legacy deep links: the terminal's pane bus lives in the URL hash
  // (/#file=…, /#tool=…). Anything still pointing at the old address gets
  // forwarded to the terminal with its selection intact.
  useEffect(() => {
    const hash = window.location.hash;
    if (/(?:file|tool)=/.test(hash)) {
      router.replace(`/terminal${hash}`);
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-bg-base text-text pt-14">
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        <Hero />
        <TheLoop />
        <MnemonSection />
        <HegemonSection />
        <ObservabilitySection />
        <SystemStateSection />
        <ContactSection />
      </main>
    </div>
  );
}
