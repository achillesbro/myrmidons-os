"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { GridKpi } from "@/components/ui/grid-kpi";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { LandingFeed } from "@/components/landing/LandingFeed";
import { WORDMARK_ROWS } from "@/lib/landing/wordmark";
import { useVaultMetadata, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis } from "@/lib/morpho/view";
import { useMarketHealth } from "@/lib/mnemon/queries";
import { computeMarketStats, isRealMarket } from "@/lib/mnemon/aggregate";
import { fmtAge, fmtPct, fmtUsd } from "@/lib/mnemon/format";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";

/**
 * Landing page — the explainer for first-time visitors (the terminal moved to
 * /terminal and stays the product surface). Structure and copy per the agreed
 * plan: hero → the loop → MNEMON (intelligence) → HEGEMON (execution) →
 * observability → system state → contact. Terminal aesthetic is the styling
 * system, not an animation: all copy renders immediately; GlitchTypeText only
 * accents micro-labels as sections scroll into view (it already respects
 * prefers-reduced-motion).
 */

const GITHUB_URL = "https://github.com/achillesbro";
const X_URL = "https://x.com/0xachilles";
const EXPLORER_ADDR = (addr: string) => `https://hyperevmscan.io/address/${addr}`;

/** Fire once when the element scrolls into view — drives the label reveals. */
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

/** `[ 01 // HOW_IT_WORKS ]` micro-label, glitch-typed when scrolled to. */
function SectionLabel({ index, name }: { index: string; name: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className="text-[9px] uppercase tracking-widest text-gold font-mono mb-4">
      <GlitchTypeText loading={!inView} value={`[ ${index} // ${name} ]`} mode="text" />
    </div>
  );
}

/** Gold corner ticks on a bordered panel — CSS-drawn so the frame reflows;
 *  reads as ASCII without living on a character grid. */
function CornerFrame({ children, className }: { children: ReactNode; className?: string }) {
  const tick = "absolute w-3 h-3 border-gold/70 pointer-events-none";
  return (
    <div className={cn("relative border border-border/50 bg-bg-base", className)}>
      <span aria-hidden className={cn(tick, "top-0 left-0 border-t-2 border-l-2")} />
      <span aria-hidden className={cn(tick, "top-0 right-0 border-t-2 border-r-2")} />
      <span aria-hidden className={cn(tick, "bottom-0 left-0 border-b-2 border-l-2")} />
      <span aria-hidden className={cn(tick, "bottom-0 right-0 border-b-2 border-r-2")} />
      {children}
    </div>
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

function LandingHeader() {
  return (
    <header className="border-b border-border/60 bg-bg-base">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="brand justify-center">
          <div className="brand-primary">MYRMIDONS</div>
          <div className="brand-secondary">ALGORITHMIC STRATEGIES</div>
        </div>
        <nav className="flex items-center gap-4 sm:gap-6 font-mono text-[10px] font-bold uppercase tracking-widest">
          <Link href="/tools/mnemon" className="hidden sm:block text-text-dim hover:text-text transition-colors">
            MNEMON
          </Link>
          <Link href="/vaults" className="hidden sm:block text-text-dim hover:text-text transition-colors">
            VAULTS
          </Link>
          <Link
            href="/terminal"
            className="border border-gold text-gold px-3 py-1.5 hover:bg-gold/10 transition-colors"
          >
            &gt; BOOT TERMINAL
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <section className="pt-14 pb-16 sm:pt-20 sm:pb-24">
      <div ref={ref} className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-6">
        <GlitchTypeText loading={!inView} value="MYRMIDONS OS // HYPEREVM // CHAIN 999" mode="text" />
      </div>
      <pre
        aria-hidden
        className="font-mono leading-[1.2] text-gold select-none overflow-hidden mb-8"
        style={{
          fontSize: "clamp(5px, 1.35vw, 11px)",
          textShadow:
            "0 0 6px color-mix(in oklab, var(--gold) 45%, transparent), 0 0 18px color-mix(in oklab, var(--gold) 22%, transparent)",
        }}
      >
        {WORDMARK_ROWS.join("\n")}
      </pre>
      <h1 className="sr-only">MYRMIDONS</h1>
      <p className="text-2xl sm:text-4xl font-bold uppercase tracking-tight leading-tight max-w-3xl">
        Intelligence and execution for onchain credit<span className="text-gold">.</span>
      </p>
      <p className="mt-6 max-w-2xl font-mono text-sm sm:text-base text-text/80 leading-relaxed">
        MYRMIDONS is a research and execution stack for onchain lending markets. It continuously
        observes every Morpho market on HyperEVM, classifies which ones are real and investable,
        and reallocates vault capital toward the best of them — automatically, transparently,
        around the clock.
      </p>
      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        BUILT ON MORPHO &middot; RUNNING ON HYPEREVM &middot; FULLY OBSERVABLE
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <CtaLink href="/terminal" primary>
          &gt; BOOT TERMINAL
        </CtaLink>
        <CtaLink href="/tools/mnemon">&gt; EXPLORE MARKETS</CtaLink>
      </div>
    </section>
  );
}

const LOOP_STEPS = [
  {
    step: "01",
    title: "OBSERVE",
    body: (
      <>
        MNEMON samples every Morpho market on HyperEVM every 15 minutes — supply and borrow
        rates, utilization, available liquidity, borrower health. An independent archive, not a
        wrapper around someone else&apos;s API.
      </>
    ),
  },
  {
    step: "02",
    title: "CLASSIFY",
    body: (
      <>
        Every snapshot runs through a broken-market classifier and investability rules: real
        collateral, liquidity deep enough to enter and exit, no abnormal rate behavior. A 12,000%
        APY on a $40 dust market is noise, not opportunity — most dashboards can&apos;t tell the
        difference.
      </>
    ),
  },
  {
    step: "03",
    title: "ALLOCATE",
    body: (
      <>
        HEGEMON, the reallocator, moves vault capital along a utilization-targeting curve — churn-
        and yield-gated so it trades signal, not noise. Every move is simulated before it is sent
        onchain.
      </>
    ),
  },
];

function TheLoop() {
  return (
    <section className="py-14 sm:py-20 border-t border-border/40">
      <SectionLabel index="01" name="HOW_IT_WORKS" />
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-6">
        One loop, run without pause
      </h2>
      <div className="overflow-x-auto mb-8">
        <pre className="font-mono text-[11px] sm:text-xs text-text-dim leading-relaxed whitespace-pre">
          {"[ MNEMON ] ──▶ [ CLASSIFIER ] ──▶ [ HEGEMON ] ──▶ onchain"}
        </pre>
      </div>
      <div className="grid md:grid-cols-3 border-l border-t border-border/50">
        {LOOP_STEPS.map((s) => (
          <div key={s.step} className="border-r border-b border-border/50 p-5 sm:p-6">
            <div className="text-[10px] font-mono text-gold tracking-widest mb-2">{s.step}</div>
            <h3 className="text-sm font-bold uppercase tracking-widest mb-3">{s.title}</h3>
            <p className="font-mono text-[13px] text-text/75 leading-relaxed">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MnemonSection() {
  const { data, isLoading, isError } = useMarketHealth();
  // Idle markets (null collateral) are vault cash, not lending markets.
  const markets = (data?.markets ?? []).filter(isRealMarket);
  const stats = computeMarketStats(markets);
  // On fetch failure show dashes, not zeros — zeros read as real data.
  const n = (v: number) => (isError ? "—" : String(v));
  const usd = (v: number) => (isError ? "—" : fmtUsd(v));

  return (
    <section className="py-14 sm:py-20 border-t border-border/40">
      <SectionLabel index="02" name="INTELLIGENCE" />
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide">
              MNEMON — the memory
            </h2>
            <StatusIndicator status="live" />
          </div>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-4">
            An independent, 15-minute-sampled archive of every Morpho market on HyperEVM: supply
            and borrow APY, utilization spells, liquidity depth, borrower risk — plus a
            broken-market classifier the raw API can&apos;t give you.
          </p>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-6">
            &ldquo;Best APY&rdquo; here always means best <em>investable</em> APY: non-broken
            markets with at least $10k of usable liquidity. Everything else is filtered before it
            can pollute a benchmark.
          </p>
          <CtaLink href="/tools/mnemon">&gt; RUN MNEMON</CtaLink>
        </div>
        <CornerFrame>
          <div className="grid grid-cols-2 border-l border-t border-border/50 m-3">
            <GridKpi
              label="Markets Tracked"
              value={
                <GlitchTypeText loading={isLoading} value={n(stats.markets)} mode="number" />
              }
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
    </section>
  );
}

function VaultTile({
  name,
  asset,
  address,
  chainId,
  route,
}: {
  name: string;
  asset: string;
  address: string;
  chainId: number;
  route: string;
}) {
  const metadata = useVaultMetadata(address, chainId, true);
  const apy = useVaultApy(address, chainId, true);
  const kpis = pickKpis(metadata.data ?? null, apy.data ?? null);
  const loading = metadata.isLoading || apy.isLoading;

  return (
    <Link href={route} className="block group">
      <CornerFrame className="p-5 transition-colors group-hover:bg-white/5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold uppercase tracking-widest">{name}</h3>
          <StatusIndicator status="dev" />
        </div>
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-5">
          {`MORPHO VAULT V2 // ${asset} // HEGEMON_V2`}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
              TVL
            </div>
            <div className="text-xl font-bold tracking-tight">
              <GlitchTypeText loading={loading} value={kpis.tvlUsd ?? "—"} mode="text" />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
              NET APY
            </div>
            <div className="text-xl font-bold tracking-tight text-gold">
              <GlitchTypeText loading={loading} value={kpis.netApyPct ?? "—"} mode="text" />
            </div>
          </div>
        </div>
        <div className="mt-5 text-[10px] font-bold uppercase tracking-widest font-mono text-text-dim group-hover:text-gold transition-colors">
          &gt; OPEN VAULT
        </div>
      </CornerFrame>
    </Link>
  );
}

function HegemonSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border/40">
      <SectionLabel index="03" name="EXECUTION" />
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
        HEGEMON — the hands
      </h2>
      <p className="font-mono text-sm text-text/80 leading-relaxed max-w-3xl mb-8">
        An autonomous reallocator for Morpho Vault V2: one bot process managing the MYRMIDONS
        vaults, scoring markets on a utilization bell (target U₀ = 0.88) with hard saturation
        guards, and moving capital only when the simulated yield gain clears churn and gas
        thresholds. Depositors hold standard ERC-4626 vault shares; the strategy layer only ever
        reallocates between whitelisted Morpho markets.
      </p>
      <div className="grid md:grid-cols-2 gap-5">
        <VaultTile
          name="MYRMIDONS_USDT0"
          asset="USDT0"
          address={HEGEMON_V2_VAULT_ADDRESS}
          chainId={HEGEMON_V2_VAULT_CHAIN_ID}
          route="/vaults/usdt0-v2"
        />
        <VaultTile
          name="MYRMIDONS_USDC"
          asset="USDC"
          address={USDC_V2_VAULT_ADDRESS}
          chainId={USDC_V2_VAULT_CHAIN_ID}
          route="/vaults/usdc-v2"
        />
      </div>
    </section>
  );
}

function ObservabilitySection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border/40">
      <SectionLabel index="04" name="OBSERVABILITY" />
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
            No dashboard theater
          </h2>
          <p className="font-mono text-sm text-text/80 leading-relaxed mb-4">
            Every decision the reallocator makes — plans, simulations, transactions, skipped ticks
            and why — is streamed live to this site. Every position is verifiable onchain.
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
        <LandingFeed />
      </div>
    </section>
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
    <section className="py-14 sm:py-20 border-t border-border/40">
      <SectionLabel index="05" name="SYSTEM_STATE" />
      <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-6">
        Where things stand
      </h2>
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
      <p className="mt-6 font-mono text-[11px] text-text-dim leading-relaxed max-w-3xl">
        MYRMIDONS is an early-stage system under active development. The vaults are standard
        Morpho Vault V2 contracts; the strategy layer on top is unaudited. Nothing on this site is
        financial advice — allocate accordingly.
      </p>
    </section>
  );
}

function ContactSection() {
  return (
    <section className="py-14 sm:py-20 border-t border-border/40">
      <SectionLabel index="06" name="CONTACT" />
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-8">
        <div>
          <h2 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-3">
            Built by 0xachilles
          </h2>
          <p className="font-mono text-sm text-text/80 leading-relaxed max-w-xl mb-6">
            Data pipeline, strategy engine, contracts integration and this interface — one
            operator, fully accountable. Questions, partnerships, or a look under the hood:
          </p>
          <div className="flex flex-wrap gap-3">
            <CtaLink href={GITHUB_URL} external>
              GITHUB // ACHILLESBRO
            </CtaLink>
            <CtaLink href={X_URL} external>
              X // @0XACHILLES
            </CtaLink>
          </div>
        </div>
        <CtaLink href="/terminal" primary>
          &gt; BOOT TERMINAL
        </CtaLink>
      </div>
      <div className="mt-14 pt-6 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-widest text-text-dim">
        <span>MYRMIDONS(1) · HYPEREVM · 2026</span>
        <span>(c) Myrmidons Strategies</span>
      </div>
    </section>
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
    <div className="min-h-screen bg-bg-base text-text">
      <LandingHeader />
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
