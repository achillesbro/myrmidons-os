"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { GridKpi } from "@/components/ui/grid-kpi";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { CornerFrame } from "@/components/ui/corner-frame";
import { VaultTileCard } from "@/components/vault/VaultTileCard";
import { BellCurveChart } from "@/components/vault/BellCurveChart";
import { ReallocatorTerminal } from "@/components/vault/ReallocatorTerminal";
import { MnemonMarketDrilldown } from "@/components/tools/mnemon/MnemonMarketDrilldown";
import { LastReallocTxProvider } from "@/lib/logs/last-realloc-context";
import { WORDMARK_ROWS, WORDMARK_CHARSET } from "@/lib/landing/wordmark";
import { useDepegSpells, useMarketFlows, useMarketHealth, useUtilSpells } from "@/lib/mnemon/queries";
import { computeMarketStats, isInvestable, isRealMarket } from "@/lib/mnemon/aggregate";
import { fmtAge, fmtPct, fmtUsd, pairLabel } from "@/lib/mnemon/format";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";

/**
 * Landing page. The explainer for first-time visitors; the terminal lives at
 * /terminal and stays the product surface. Chrome comes from the shared site
 * Header (fixed, h-14, hence the pt-14 on the wrapper), so the landing
 * matches the tools/vault pages.
 *
 * Reveal system: text glitch-types in as it scrolls into view, at the same
 * default GlitchTypeText speed the pane tables use. Until then it sits
 * invisible in the layout (space reserved, no caret, no reflow). Section top
 * rules draw in left-to-right. Containers get no transition of their own.
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

/** Glitch-types `value` in when scrolled to (after delayMs), at the default
 *  GlitchTypeText speed the tables use. Before that the text sits invisible
 *  in the layout: no caret, no reflow. `overflow-wrap:anywhere` contains the
 *  scrambled tail (one long unbroken run, since the scramble replaces spaces
 *  too) inside the column while the animation plays; it changes nothing for
 *  the final text, whose words all fit their lines. */
function RevealText({
  value,
  className,
  delayMs = 0,
  charset,
}: {
  value: string;
  className?: string;
  delayMs?: number;
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
    <span ref={ref} className={cn("[overflow-wrap:anywhere]", className)}>
      {go ? (
        <GlitchTypeText loading={false} value={value} mode="text" charset={charset} />
      ) : (
        <span className="opacity-0" aria-hidden>
          {value}
        </span>
      )}
    </span>
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
  label,
  primary = false,
  external = false,
  delayMs = 0,
}: {
  href: string;
  label: string;
  primary?: boolean;
  external?: boolean;
  delayMs?: number;
}) {
  const className = cn(
    "inline-flex items-center gap-2 border px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest font-mono transition-colors",
    primary
      ? "border-gold text-gold glow-border-gold hover:bg-gold/10"
      : "border-border text-text hover:bg-border/10"
  );
  const content = <RevealText value={label} delayMs={delayMs} />;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  );
}

function Hero() {
  return (
    <section className="pt-12 pb-16 sm:pt-16 sm:pb-24">
      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-6">
        <RevealText value="MYRMIDONS OS // HYPEREVM · ROBINHOOD CHAIN" />
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
            <RevealText value={row} delayMs={100 + i * 90} charset={WORDMARK_CHARSET} />
          </div>
        ))}
      </div>
      <div className="sm:hidden mb-8">
        <span className="font-brand text-3xl font-bold tracking-wide text-white glow-gold">
          MYRMIDONS
        </span>
      </div>

      <h1 className="sr-only">MYRMIDONS, intelligence and execution for onchain credit</h1>
      <p className="text-2xl sm:text-4xl font-bold uppercase tracking-tight leading-tight max-w-3xl font-header">
        <RevealText value="Intelligence and execution for onchain credit" delayMs={500} />
        <span className="text-gold">.</span>
      </p>
      <p className="mt-6 max-w-2xl font-mono text-sm sm:text-base text-text/80 leading-relaxed">
        <RevealText
          delayMs={800}
          value="MYRMIDONS is a research and execution stack for onchain lending markets. It continuously observes every Morpho market on HyperEVM and Robinhood Chain, classifies which ones are real and investable, and reallocates vault capital toward the best of them. Automated, transparent, around the clock."
        />
      </p>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        <RevealText delayMs={1100} value="BUILT ON MORPHO · LIVE ON HYPEREVM + ROBINHOOD CHAIN · FULLY OBSERVABLE" />
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <CtaLink href="/terminal" label="> BOOT TERMINAL" primary delayMs={1200} />
        <CtaLink href="/tools/mnemon" label="> EXPLORE MARKETS" delayMs={1300} />
      </div>
    </section>
  );
}

const LOOP_STEPS = [
  {
    step: "01",
    title: "OBSERVE",
    body: "MNEMON samples every Morpho market on HyperEVM and Robinhood Chain every 15 minutes: supply and borrow rates, utilization, available liquidity, borrower health. The archive is sampled and stored on MYRMIDONS infrastructure, independent of the Morpho API.",
  },
  {
    step: "02",
    title: "CLASSIFY",
    body: "Every snapshot runs through a broken-market classifier and investability rules: real collateral, liquidity deep enough to enter and exit, no abnormal rate behavior. A 12,000% APY on a $40 dust market fails these checks before it can skew a single benchmark.",
  },
  {
    step: "03",
    title: "ALLOCATE",
    body: "HEGEMON, the reallocator, moves vault capital along a utilization-targeting curve, gated by churn and yield thresholds. Every move is simulated before it is sent onchain.",
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
          <RevealText value="[ MNEMON ] ──▶ [ CLASSIFIER ] ──▶ [ HEGEMON ] ──▶ onchain" delayMs={400} />
        </pre>
      </div>
      <div className="grid md:grid-cols-3 border-l border-t border-border/50">
        {LOOP_STEPS.map((s, i) => (
          <div key={s.step} className="border-r border-b border-border/50 p-5 sm:p-6">
            <div className="text-[10px] font-mono text-gold tracking-widest mb-2">
              <RevealText value={s.step} delayMs={i * 140} />
            </div>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-3">
              <RevealText value={s.title} delayMs={i * 140 + 80} />
            </h3>
            <p className="font-mono text-[13px] text-text/75 leading-relaxed">
              <RevealText value={s.body} delayMs={i * 140 + 200} />
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/** Best investable market by supply APY, the concrete "what MNEMON can do". */
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
  const spellsQuery = useUtilSpells();
  const flowsQuery = useMarketFlows();
  const depegQuery = useDepegSpells();
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
              <RevealText value="MNEMON // THE MEMORY" delayMs={250} />
            </h2>
            <StatusIndicator status="live" />
          </div>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-4">
            <RevealText
              delayMs={400}
              value="An independent archive of every Morpho market on HyperEVM and Robinhood Chain, sampled every 15 minutes: supply and borrow APY, utilization spells, liquidity depth, borrower risk, and a broken-market classifier built on top of the raw feed."
            />
          </p>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-6">
            <RevealText
              delayMs={600}
              value={'"Best APY" here always means best investable APY: non-broken markets with at least $50k of usable liquidity. Everything else is filtered out before it reaches a benchmark.'}
            />
          </p>
          <CtaLink href="/tools/mnemon" label="> RUN MNEMON" delayMs={700} />
        </div>
        <CornerFrame>
          <div className="grid grid-cols-2 border-l border-t border-border/50 m-3">
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
        </CornerFrame>
      </div>

      {/* Live sample of the archive: the market MNEMON's own rules rank best,
          rendered with the exact drill-down the /tools/mnemon table uses. */}
      <div className="mt-8">
        <CornerFrame>
          <div className="px-4 py-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-[9px] uppercase tracking-widest text-gold font-mono">
                <RevealText value="BEST INVESTABLE MARKET" delayMs={200} />
              </span>
              <span className="text-base font-bold tracking-tight font-header">
                <GlitchTypeText
                  loading={isLoading}
                  value={best ? pairLabel(best.collateral_symbol, best.loan_symbol) : "—"}
                  mode="text"
                />
              </span>
              {best?.lltv != null && (
                <span className="text-[10px] font-mono text-text-dim uppercase tracking-widest">
                  LLTV {fmtPct(best.lltv, 0)}
                </span>
              )}
            </div>
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              {`RANKED BY MNEMON'S OWN RULES`}
            </span>
          </div>
          {best ? (
            <>
              {/* The MNEMON table's headline columns for this market — the
                  drilldown deliberately omits them since the tool shows them
                  in the table row it expands from. */}
              <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: "SUPPLY APY", value: fmtPct(best.supply_apy), gold: true },
                  { label: "APY@TARGET", value: fmtPct(best.apy_at_target) },
                  { label: "SUPPLY", value: fmtUsd(best.supply_usd) },
                  { label: "AVAILABLE", value: fmtUsd(best.available_usd) },
                ].map((m) => (
                  <div key={m.label}>
                    <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
                      {m.label}
                    </div>
                    <div
                      className={cn(
                        "text-sm font-bold tracking-tight font-header",
                        m.gold && "text-gold"
                      )}
                    >
                      <GlitchTypeText loading={isLoading} value={m.value} mode="text" />
                    </div>
                  </div>
                ))}
              </div>
              <MnemonMarketDrilldown
                market={best}
                spells={spellsQuery.data?.spells ?? []}
                bestInvestableApy={stats.bestDeployableApy}
                flow={flowsQuery.data?.markets.find((f) => f.market_id === best.market_id) ?? null}
                flowsSynced={flowsQuery.data?.synced ?? false}
                depegSpells={depegQuery.data?.spells ?? []}
                liquidations={flowsQuery.data?.liquidations ?? []}
              />
            </>
          ) : (
            <div className="px-4 pb-4 font-mono text-[11px] text-text-dim">
              {isError ? "archive unreachable" : "waiting for archive…"}
            </div>
          )}
        </CornerFrame>
      </div>
    </Section>
  );
}

const STRATEGY_POINTS = [
  {
    key: "score",
    label: "score = yield × bell(u)",
    body: "Markets are scored on real yield weighted by a bell curve over utilization, centered on the target U₀ = 0.88 with σ = 0.05. A market close to target is worth more than its raw APY suggests.",
  },
  {
    key: "sat",
    label: "U ≥ 0.92 → ×0.4",
    body: "Inside the saturated band, inflow attractiveness is cut to 40%. Markets running hot stop attracting new capital before they become a trap.",
  },
  {
    key: "crit",
    label: "U ≥ 0.95 → 0",
    body: "At critical utilization the score drops to zero. Exit liquidity takes priority over yield.",
  },
  {
    key: "gates",
    label: "churn + yield gates",
    body: "A move executes only when the simulated gain clears churn and gas thresholds.",
  },
];

function HegemonSection() {
  return (
    <Section index="03" name="EXECUTION">
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
        <RevealText value="HEGEMON // THE HANDS" delayMs={250} />
      </h2>
      <p className="font-mono text-sm text-text/80 leading-relaxed max-w-3xl mb-8">
        <RevealText
          delayMs={400}
          value="An autonomous reallocator for Morpho Vault V2: one bot process managing the MYRMIDONS vaults. Depositors hold standard ERC-4626 vault shares, and the strategy layer can only move funds between whitelisted Morpho markets."
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
                <RevealText value={p.body} delayMs={400 + i * 150} />
              </p>
            </div>
          ))}
        </div>
        <div className="lg:col-span-3">
          <CornerFrame className="p-4">
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
              <RevealText value="UTILIZATION ATTRACTIVENESS // WHAT THE SCORER APPLIES" delayMs={300} />
            </div>
            <BellCurveChart height={300} />
          </CornerFrame>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-5">
        <VaultTileCard
          name="MYRMIDONS_USDT0"
          secondary="MORPHO VAULT V2 // USDT0 // HEGEMON_V2 // HYPEREVM"
          address={HEGEMON_V2_VAULT_ADDRESS}
          chainId={HEGEMON_V2_VAULT_CHAIN_ID}
          route="/vaults/usdt0-v2"
        />
        <VaultTileCard
          name="MYRMIDONS_USDC"
          secondary="MORPHO VAULT V2 // USDC // HEGEMON_V2 // HYPEREVM"
          address={USDC_V2_VAULT_ADDRESS}
          chainId={USDC_V2_VAULT_CHAIN_ID}
          route="/vaults/usdc-v2"
        />
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
            <RevealText value="Watch it run, live" delayMs={250} />
          </h2>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-4">
            <RevealText
              delayMs={400}
              value="Every decision the reallocator makes is streamed live to this site: plans, simulations, transactions, and skipped ticks with the reason they were skipped. Every position is verifiable onchain."
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
        {/* The real vault-page live feed component, so the rendering rules
            (level colors, structured titles, tx links, dedupe) match the
            vault pages exactly. No vaultFilter: both V2 vaults ride this
            stream and every event on it is ours. */}
        <CornerFrame className="overflow-hidden">
          <div className="border-b border-border/60 px-3 py-2 text-[9px] uppercase tracking-widest text-text-dim font-mono">
            TERMINAL // LIVE_FEED // HEGEMON_V2
          </div>
          <LastReallocTxProvider>
            <div className="h-80">
              <ReallocatorTerminal streamPath="/api/logs/hegemon-v2/stream" className="h-full" />
            </div>
          </LastReallocTxProvider>
        </CornerFrame>
      </div>
    </Section>
  );
}

const SYSTEM_ROWS: {
  name: string;
  detail: string;
  /** Omitted = not a running service; the row shows `chip` instead. */
  status?: "live" | "dev" | "offline";
  chip?: string;
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
    note: "DEPRECATED · WITHDRAWALS OPEN",
  },
  {
    name: "SCOPE",
    detail: "HYPEREVM (999) + ROBINHOOD CHAIN (4663) · MORPHO MARKETS ONLY",
    chip: "POC",
    note: "MORE CHAINS PLANNED",
  },
];

function SystemStateSection() {
  return (
    <Section index="05" name="SYSTEM_STATE">
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-6">
        <RevealText value="Where things stand" delayMs={250} />
      </h2>
      <div className="border-l border-t border-border/50">
        {SYSTEM_ROWS.map((row) => (
          <div
            key={row.name}
            /* Fixed-width third track: with `auto`, each row's chip width
               resized that row's fr columns and the columns drifted between
               rows. */
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(11rem,1fr)_2fr_8rem] gap-x-4 gap-y-1 items-center border-r border-b border-border/50 px-4 py-3"
          >
            <div className="font-mono text-[12px] font-bold uppercase tracking-widest">
              <RevealText value={row.name} delayMs={200} />
            </div>
            <div className="hidden sm:block font-mono text-[10px] uppercase tracking-widest text-text-dim">
              <RevealText value={`${row.detail} · ${row.note}`} delayMs={300} />
            </div>
            {row.status ? (
              <StatusIndicator status={row.status} className="justify-self-end" />
            ) : (
              <span className="justify-self-end inline-flex items-center border border-border/60 rounded px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-text-dim">
                {row.chip}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 font-mono text-[11px] text-text-dim leading-relaxed max-w-3xl">
        <RevealText
          delayMs={450}
          value="MYRMIDONS is an early-stage system under active development. The vaults are standard Morpho Vault V2 contracts; the strategy layer on top is unaudited. Nothing on this site is financial advice. Allocate accordingly."
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
              value="Data pipeline, strategy engine, contract integration and this interface, built and operated by one person. Questions, partnerships, or a look under the hood:"
            />
          </p>
          <div className="flex flex-wrap gap-3">
            <CtaLink href={GITHUB_URL} label="GITHUB // ACHILLESBRO" external delayMs={500} />
            <CtaLink href={X_URL} label="X // @0XACHILLES" external delayMs={600} />
          </div>
        </div>
        <CtaLink href="/terminal" label="> BOOT TERMINAL" primary delayMs={700} />
      </div>
    </Section>
  );
}

const FOOTER_COLUMNS: { title: string; links: { label: string; href: string; external?: boolean }[] }[] = [
  {
    title: "SITE",
    links: [
      { label: "TERMINAL", href: "/terminal" },
      { label: "VAULTS", href: "/vaults" },
      { label: "MNEMON ANALYSER", href: "/tools/mnemon" },
      { label: "BRANDING", href: "/branding" },
    ],
  },
  {
    title: "OPERATOR",
    links: [
      { label: "GITHUB // ACHILLESBRO", href: GITHUB_URL, external: true },
      { label: "X // @0XACHILLES", href: X_URL, external: true },
    ],
  },
  {
    title: "ONCHAIN",
    links: [
      { label: "USDT0 VAULT ↗", href: EXPLORER_ADDR(HEGEMON_V2_VAULT_ADDRESS), external: true },
      { label: "USDC VAULT ↗", href: EXPLORER_ADDR(USDC_V2_VAULT_ADDRESS), external: true },
      { label: "MORPHO ↗", href: "https://morpho.org", external: true },
    ],
  },
];

function SiteFooter() {
  return (
    <footer className="relative border-t border-border/40 py-10">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-8 mb-10">
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="text-[9px] uppercase tracking-widest text-gold font-mono mb-3">
              {col.title}
            </div>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-dim hover:text-gold transition-colors"
                    >
                      {l.label}
                    </a>
                  ) : (
                    <Link
                      href={l.href}
                      className="font-mono text-[10px] font-bold uppercase tracking-widest text-text-dim hover:text-gold transition-colors"
                    >
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="pt-6 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-widest text-text-dim">
        <span>MYRMIDONS(1) · 2026</span>
        <span>UNAUDITED, EARLY-STAGE SOFTWARE. NOTHING HERE IS FINANCIAL ADVICE.</span>
        <span>(c) Myrmidons Strategies</span>
      </div>
    </footer>
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
        <SiteFooter />
      </main>
    </div>
  );
}
