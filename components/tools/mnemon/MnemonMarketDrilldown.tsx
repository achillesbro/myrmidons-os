"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { TerminalScrollLoader } from "@/components/ui/terminal-scroll-loader";
import type {
  DepegSpell,
  FlowsMarketEntry,
  Liquidation,
  MarketHealthEntry,
} from "@/lib/mnemon/schemas";
import {
  chainOf,
  fmtAge,
  fmtAmount,
  fmtDurationMin,
  explorerAddressUrl,
  explorerTxUrl,
  fmtEventTime,
  fmtPct,
  fmtPrice,
  fmtRatio,
  fmtSignedPct,
  fmtUsd,
} from "@/lib/mnemon/format";
import { CopyableAddr } from "./CopyableAddr";
import { borrowUsdOf, isInvestable, isSignificantLiquidation } from "@/lib/mnemon/aggregate";
import { MarketSparkline } from "./MarketSparkline";
import { useRiskMarkets } from "@/lib/risk/queries";
import { isStructuralOracle } from "@/lib/risk/oracle";
import type { ModtSide, OracleBlock } from "@/lib/risk/schemas";
import { cn } from "@/lib/utils";

// The MNEMON per-market drill-down: 7d APY/util sparkline with a MARKET
// stat block + 30d liquidation feed at its right, then the 3x2 risk grid —
// Borrower Risk / Lender Book / Utilization / Collateral / Oracle / Flows.
// Risk-model values come from myrmidons-api (useRiskMarkets), including the
// ORACLE panel's identity block (api schema 1.1). Shared by the
// /tools/mnemon table and the vault-page allocation tables (each mounts it
// fresh on expand, so the glitch-reveal fires each time).

type Tone = "danger" | "gold" | "success" | "default";

const TONE_CLASS: Record<Tone, string> = {
  danger: "text-danger",
  gold: "text-gold",
  success: "text-success",
  default: "text-text",
};

function Metric({
  label,
  value,
  tone = "default",
  title,
  loading = false,
  glitchMode = "text",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  title?: string;
  loading?: boolean;
  glitchMode?: "text" | "number" | "auto";
}) {
  const content =
    typeof value === "string" || typeof value === "number" ? (
      <GlitchTypeText loading={loading} value={value} mode={glitchMode} />
    ) : (
      value
    );
  return (
    <div className="flex justify-between gap-3 text-[10px] font-mono" title={title}>
      <span className="text-text-dim">{label}</span>
      <span className={TONE_CLASS[tone]}>{content}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-3 bg-bg-base space-y-1.5">
      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono border-b border-border/20 pb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

// Health-factor colour: <1.05 is one bad candle from liquidation, <1.2 is thin.
function hfTone(hf: number | null | undefined): Tone {
  if (hf == null) return "default";
  if (hf < 1.05) return "danger";
  if (hf < 1.2) return "gold";
  return "success";
}

// Oracle-vs-DefiLlama deviation colour: >5% is a hard decoupling, >2% drift.
function devTone(dev: number | null | undefined): Tone {
  if (dev == null) return "default";
  const abs = Math.abs(dev);
  if (abs >= 0.05) return "danger";
  if (abs >= 0.02) return "gold";
  return "default";
}

// Lender concentration colour: one address holding most of the supply means a
// single withdrawal can spike utilization (and yield).
function concTone(pct: number | null | undefined): Tone {
  if (pct == null) return "default";
  if (pct >= 0.75) return "danger";
  if (pct >= 0.5) return "gold";
  return "default";
}

// Colour for HEGEMON's utilization band pill.
function bandTone(label: string | null | undefined): Tone {
  switch (label) {
    case "CRITICAL":
      return "danger";
    case "SATURATED":
      return "gold";
    case "OPTIMAL":
      return "success";
    default:
      return "default";
  }
}

// ─── Oracle identity display (risk API `oracle` block) ────────────────────

// The MorphoChainlinkOracleV2 feed slots, in contract order. Always shown
// (empty slot = address(0)) — that IS the shape of a Morpho oracle.
const FEED_SLOTS = ["base_feed_1", "base_feed_2", "quote_feed_1", "quote_feed_2"] as const;

// Provider inference. The archive's vendor field is deliberately strict
// (Chainlink / Pyth / ERC4626 / "Push-based (unknown)"), but most push feeds
// name their provider in their own description() — reading that is not
// guessing. Order matters: PENDLE before the chainlink pattern ("Pendle
// Chainlink-compatible Oracle").
const DESC_PROVIDER: [RegExp, string][] = [
  [/redstone/i, "REDSTONE"],
  [/pendle/i, "PENDLE"],
  [/pyth/i, "PYTH"],
  [/chainlink/i, "CHAINLINK"],
  [/stork/i, "STORK"],
  [/chronicle/i, "CHRONICLE"],
  [/api3/i, "API3"],
  [/exchange rate|redemption rate/i, "ONCHAIN RATE"],
  [/fixed .* price/i, "FIXED PRICE"],
];

function legProvider(leg: OracleBlock["legs"][number]): string | null {
  if (leg.vendor === "Chainlink") return "CHAINLINK";
  if (leg.vendor === "Pyth") return "PYTH";
  if (leg.vendor === "ERC4626") return "ERC4626";
  for (const [re, name] of DESC_PROVIDER) {
    if (leg.description && re.test(leg.description)) return name;
  }
  return null;
}

// One-line provider summary: family first (bespoke oracles have a named
// author), then the distinct providers of the legs ("CHAINLINK × ERC4626"),
// then honest fallbacks.
function oracleProvider(o: OracleBlock): { label: string; tone: Tone } {
  if (o.broken) return { label: `BROKEN (${o.broken.toUpperCase()})`, tone: "danger" };
  if (o.family === "meta-deviation-timelock") return { label: "STEAKHOUSE", tone: "default" };
  if (o.family === "curve-stableswap") return { label: "STAKEDAO", tone: "default" };
  if (o.family === "constant-peg") return { label: "CONSTANT PEG", tone: "gold" };
  const providers = [
    ...new Set(o.legs.map(legProvider).filter((v): v is string => v != null)),
  ];
  if (providers.length > 0) return { label: providers.join(" × "), tone: "default" };
  if (o.legs.length > 0) return { label: "UNKNOWN FEED", tone: "gold" };
  if (o.kind === "feed") return { label: "DIRECT FEED", tone: "default" };
  if (o.kind == null) return { label: "UNRESOLVED", tone: "gold" };
  if (o.kind === "opaque" || o.kind === "oracle") return { label: "UNVERIFIED", tone: "gold" };
  return { label: o.kind.toUpperCase(), tone: "default" };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

// One MODT side (primary/backup oracle) summarized by its legs: the feed
// descriptions joined the way the composition reads (base × base ÷ quote),
// falling back to the oracle's short address when its legs aren't probed yet.
function modtSideText(side: ModtSide): string | undefined {
  if (side.legs.length === 0) return undefined; // ExplorerAddr shows the address
  return truncate(side.legs.map((l) => l.description ?? `${l.address.slice(0, 6)}…`).join(" × "), 24);
}

function modtSideTitle(label: string, side: ModtSide): string {
  const legs = side.legs.length
    ? side.legs
        .map((l) => `${l.role}: ${l.description ?? l.address}${l.vendor ? ` (${l.vendor})` : ""}`)
        .join(" · ")
    : "composition not probed yet";
  return `${label} ${side.address} — ${legs}`;
}

function fmtHours(seconds: number | null | undefined): string {
  return seconds != null ? `${Math.round(seconds / 3600)}H` : "—";
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) — no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied!" : "Click to copy full market ID"}
      className="font-mono text-text-dim/70 hover:text-gold transition-colors cursor-pointer"
    >
      {copied ? "COPIED ✓" : `${id.slice(0, 10)}…${id.slice(-6)} ⧉`}
    </button>
  );
}

// Explorer-linked address: short form (or a feed's self-description) that
// opens the chain explorer's address page. stopPropagation keeps the click
// from toggling the host table row.
function ExplorerAddr({
  chainId,
  address,
  text,
  title,
}: {
  chainId: number;
  address: string;
  text?: string;
  title?: string;
}) {
  const url = explorerAddressUrl(chainId, address);
  const label = text ?? `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (!url) return <span title={title ?? address}>{label}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="hover:text-gold transition-colors"
      title={title ?? `View ${address} on the explorer`}
    >
      {label} ↗
    </a>
  );
}

export function MnemonMarketDrilldown({
  market,
  bestInvestableApy,
  hegemonStatus,
  flow,
  flowsSynced,
  depegSpells,
  liquidations,
}: {
  market: MarketHealthEntry;
  bestInvestableApy: number | null;
  // HEGEMON's utilization band (OPTIMAL/SATURATED/CRITICAL) for this market,
  // passed by the vault pages. Omitted on the standalone MNEMON tool.
  hegemonStatus?: string | null;
  // This market's flow windows from market_flows.json (undefined = the caller
  // doesn't fetch flows; null = fetched but no events for this market).
  flow?: FlowsMarketEntry | null;
  // false while the MNEMON flow cursor is catching up — windows describe the
  // past, so the panel shows a syncing state instead. Only meaningful when the
  // caller fetches flows.
  flowsSynced?: boolean;
  depegSpells?: DepegSpell[];
  // The full 30d liquidation feed; filtered to this market for the chart's
  // gold markers.
  liquidations?: Liquidation[];
}) {
  // Risk-model outputs (myrmidons-api): latest values for the RISK panel.
  // Keyed (chain_id, market_id) — a market_id hash collision across chains
  // is practically impossible, but check anyway.
  const riskQuery = useRiskMarkets();
  const riskEntry = riskQuery.data?.markets[market.market_id];
  const risk = riskEntry && riskEntry.chain_id === chainOf(market) ? riskEntry : undefined;
  const cap = risk?.liq_capacity ?? undefined;
  const oracle = risk?.oracle ?? undefined;
  const structuralDev = isStructuralOracle(oracle);
  const legByRole = new Map((oracle?.legs ?? []).map((l) => [l.role, l]));
  // The four feed slots only exist on MorphoChainlinkOracleV2-shaped
  // contracts — bespoke wrappers (MODT, opaque customs) have none, so
  // rendering 0x0 there would claim a shape the contract doesn't have.
  const showSlots =
    oracle != null &&
    (oracle.kind === "oracle-resolved" ||
      oracle.family === "constant-peg" ||
      oracle.legs.length > 0);
  const riskMetric = (name: string) => risk?.metrics[name];

  const marketDepegs = (depegSpells ?? [])
    .filter((s) => s.market_id === market.market_id)
    .sort((a, b) => (a.open === b.open ? b.threshold - a.threshold : a.open ? -1 : 1));
  const worstDepeg = marketDepegs[0];

  // This market's significant 30d liquidation events (dust filtered, same
  // rule as the FLOWS tab), newest first. Same sync gating as the chart's
  // liquidation markers.
  const borrowUsd = borrowUsdOf(market);
  const marketLiqs = (liquidations ?? [])
    .filter((l) => l.market_id === market.market_id && isSignificantLiquidation(l, borrowUsd))
    .sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));

  const br = market.borrower_risk;
  const sc = market.supplier_concentration;
  const showFlows = flow !== undefined; // caller fetches flows -> render the panel

  // Volume bars + liquidation markers only when the flow archive is current —
  // stale flow history would misalign with the always-fresh APY line.
  const flowHistory = flowsSynced ? (flow?.flow_history ?? undefined) : undefined;
  const liquidationTs = flowsSynced
    ? marketLiqs.filter((l) => l.ts != null).map((l) => l.ts as string)
    : undefined;
  const hasFlowStrip =
    (flowHistory?.some((p) => p.net_supply_flow || p.net_borrow_flow) ?? false) ||
    (liquidationTs?.length ?? 0) > 0;

  // "vs best" is measured against the best *investable* market (non-broken,
  // deep liquidity) — not the raw APY leader, which is usually a broken/dust
  // market with an absurd rate. Non-investable markets show "—" (no benchmark).
  const investable = isInvestable(market);
  const isLeader =
    investable &&
    bestInvestableApy != null &&
    market.supply_apy != null &&
    market.supply_apy >= bestInvestableApy - 1e-9;
  const vsBest = !investable
    ? "—"
    : isLeader
      ? "BEST"
      : bestInvestableApy != null && market.supply_apy != null
        ? `−${fmtPct(bestInvestableApy - market.supply_apy)}`
        : "—";

  // One-shot reveal on mount: metric values glitch in, chart shows the
  // terminal-scroll loader briefly first.
  const [revealed, setRevealed] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setRevealed(true), 450);
    const t2 = setTimeout(() => setChartReady(true), 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="p-4 bg-panel/40 border-t border-border space-y-4">
      {/* Chart + spells */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className={hasFlowStrip ? "lg:col-span-2 min-h-[16rem] h-64" : "lg:col-span-2 min-h-[12rem] h-48"}>
          <div className="flex items-baseline justify-between gap-3 text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
            <span>
              {hasFlowStrip
                ? "SUPPLY_APY / UTILIZATION / NET_FLOWS // 7D"
                : "SUPPLY_APY / UTILIZATION // 7D"}
            </span>
            <span className="normal-case tracking-normal">
              <CopyableId id={market.market_id} />
            </span>
          </div>
          <div className="h-[calc(100%-1.25rem)]">
            {chartReady ? (
              <MarketSparkline
                history={market.history}
                flowHistory={flowHistory}
                liquidationTs={liquidationTs}
                loanSymbol={market.loan_symbol}
              />
            ) : (
              <TerminalScrollLoader
                variant="chart"
                className="h-full w-full border-0"
                seed={`mnemon-chart-${market.market_id}`}
              />
            )}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
            LIQUIDATIONS // 30D
          </div>
          <div className="text-[10px] font-mono text-text-dim/60 leading-snug mb-2">
            This market&apos;s liquidations repaying &gt;5% of the book — each is a
            borrower seized and collateral sold.{" "}
            <span className="text-danger">BAD_DEBT</span> = the shortfall was
            socialized to lenders.
          </div>
          {flow !== undefined && !flowsSynced ? (
            <div className="text-[10px] font-mono text-gold/70">
              SYNCING — the flow archive is still catching up for this chain.
            </div>
          ) : marketLiqs.length > 0 ? (
            <div className="space-y-0.5">
              {/* Fixed grid tracks so header and rows align column-for-column. */}
              <div className="grid grid-cols-[5rem_1fr_1fr_3.5rem] gap-x-2 items-center text-[9px] font-mono uppercase tracking-wider text-text-dim/60 border-b border-border/20 pb-1">
                <span>WHEN</span>
                <span className="text-right">REPAID</span>
                <span className="text-right">SEIZED</span>
                <span className="text-right">TX</span>
              </div>
              {marketLiqs.slice(0, 6).map((l, i) => {
                const badDebt = (l.bad_debt_assets ?? 0) > 0;
                const txUrl = l.tx_hash ? explorerTxUrl(chainOf(market), l.tx_hash) : null;
                return (
                  <div
                    key={`${l.tx_hash}-${i}`}
                    className="grid grid-cols-[5rem_1fr_1fr_3.5rem] gap-x-2 items-center py-1 border-b border-border/20 last:border-0 text-[10px] font-mono"
                    title={
                      badDebt
                        ? `Bad debt socialized to lenders: ${fmtAmount(l.bad_debt_assets, l.loan_symbol)}`
                        : undefined
                    }
                  >
                    <span className={badDebt ? "text-danger" : "text-text-dim"}>
                      <GlitchTypeText loading={!revealed} value={fmtEventTime(l.ts)} mode="text" />
                      {badDebt && <span aria-hidden> !</span>}
                    </span>
                    <span className="text-danger text-right">
                      <GlitchTypeText loading={!revealed} value={fmtUsd(l.repaid_usd)} mode="text" />
                    </span>
                    <span className="text-text-dim/70 text-right">
                      <GlitchTypeText loading={!revealed} value={fmtUsd(l.seized_usd)} mode="text" />
                    </span>
                    {txUrl && l.tx_hash ? (
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-right text-text-dim/70 hover:text-gold transition-colors"
                        title={`View ${l.tx_hash} on the explorer`}
                      >
                        {l.tx_hash.slice(2, 6)}… ↗
                      </a>
                    ) : (
                      <span className="text-right text-text-dim/40">—</span>
                    )}
                  </div>
                );
              })}
              {marketLiqs.length > 6 && (
                <div className="text-[9px] font-mono text-text-dim/50 pt-1">
                  +{marketLiqs.length - 6} more in the FLOWS tab
                </div>
              )}
            </div>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">
              NO_LIQUIDATIONS_30D
            </div>
          )}
        </div>
      </div>

      {/* Metric panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
        <Panel title="Borrower Risk">
          {/* Two columns (3x2) so this 6-metric tile matches its 4-row
              neighbours' height instead of towering over them. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {br ? (
              <>
                <Metric label="BORROWERS" value={br.borrowers} loading={!revealed} glitchMode="number" />
                <Metric
                  label="MIN_HEALTH"
                  value={fmtRatio(br.min_hf)}
                  tone={hfTone(br.min_hf)}
                  title="Lowest borrower health factor — below 1.00 is liquidatable"
                  loading={!revealed}
                />
                <Metric
                  label="TOP1_CONC"
                  value={fmtPct(riskMetric("top1_borrow_share")?.value, 0)}
                  tone={concTone(riskMetric("top1_borrow_share")?.value)}
                  title="MYRMIDONS risk model: share of debt held by the single largest borrower"
                  loading={!revealed || riskQuery.isLoading}
                />
                <Metric
                  label="TOP3_CONC"
                  value={fmtPct(riskMetric("top3_borrow_share")?.value, 0)}
                  tone={(riskMetric("top3_borrow_share")?.value ?? 0) > 0.6 ? "gold" : "default"}
                  title="MYRMIDONS risk model: share of debt held by the 3 largest borrowers"
                  loading={!revealed || riskQuery.isLoading}
                />
                <Metric
                  label="NEAR_LIQ"
                  value={
                    br.borrowers_hf_lt_105 != null
                      ? `${br.borrowers_hf_lt_105} · ${fmtPct(br.pct_debt_hf_lt_105, 0)}`
                      : "—"
                  }
                  tone={(br.pct_debt_hf_lt_105 ?? 0) > 0.1 ? "danger" : "default"}
                  title="Borrowers within 5% of liquidation (HF < 1.05) · their share of debt"
                  loading={!revealed}
                />
              </>
            ) : (
              <div className="col-span-2 text-[10px] font-mono text-text-dim/50">NO_BORROWERS</div>
            )}
          <Metric
            label="CAPACITY"
            value={cap?.capacity_ratio != null ? `${fmtRatio(cap.capacity_ratio)}×` : "—"}
            tone={
              cap?.capacity_ratio == null
                ? "default"
                : cap.capacity_ratio >= 1
                  ? "success"
                  : cap.capacity_ratio >= 0.25
                    ? "gold"
                    : "danger"
            }
            loading={!revealed || riskQuery.isLoading}
            title={`MYRMIDONS risk model: fraction of this market's WHOLE debt that could be profitably liquidated in one sweep at current DEX+Core liquidity (≥1× = the full book clears). Under simultaneous same-collateral stress: ${cap?.capacity_ratio_grouped != null ? `${fmtRatio(cap.capacity_ratio_grouped)}×` : "—"} · max tolerable slippage ${fmtPct(cap?.max_slippage_used)} · ${cap?.as_of ? `${fmtAge(cap.as_of)} old` : "no data yet"}`}
          />
          </div>
        </Panel>

        <Panel title="Lender Book">
          {sc ? (
            <>
              <Metric label="SUPPLIERS" value={sc.suppliers} loading={!revealed} glitchMode="number" />
              <Metric
                label="TOP1_SHARE"
                value={fmtPct(riskMetric("top1_supply_share")?.value, 0)}
                tone={concTone(riskMetric("top1_supply_share")?.value)}
                title="MYRMIDONS risk model: share of this market's supply held by its single largest lender — the address that can unilaterally move utilization (and yield) by withdrawing. Often a Morpho vault; that IS the answer."
                loading={!revealed || riskQuery.isLoading}
              />
              <Metric
                label="TOP3_SHARE"
                value={fmtPct(riskMetric("top3_supply_share")?.value, 0)}
                tone={concTone(riskMetric("top3_supply_share")?.value)}
                title="MYRMIDONS risk model: share of supply held by the 3 largest lenders"
                loading={!revealed || riskQuery.isLoading}
              />
              <Metric label="TOP1_ADDR" value={<CopyableAddr addr={sc.top1_supplier} />} />
            </>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">NO_SUPPLIER_DATA</div>
          )}
        </Panel>

        <Panel title="Rates & Util">
          {/* Two columns: 7 metrics (band included) stay within ~4 rows. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {hegemonStatus && (
            <Metric
              label="HEGEMON"
              value={hegemonStatus}
              tone={bandTone(hegemonStatus)}
              title="HEGEMON's utilization band for this market (OPTIMAL / SATURATED / CRITICAL), from the strategy's U_OPT/U_SAT/U_CRIT thresholds — a simplified view of the strategy's stance, not its full gate."
              loading={!revealed}
            />
          )}
          <Metric label="BORROW_APY" value={fmtPct(market.borrow_apy)} loading={!revealed} />
          <Metric
            label="VS_BEST"
            value={vsBest}
            tone={isLeader ? "success" : "default"}
            title="APY vs the best investable market (non-broken, ≥ $50k liquidity). '—' = this market isn't investable, so the comparison is meaningless."
            loading={!revealed}
          />
          <Metric
            label="AVG_7D"
            value={fmtPct(riskMetric("avg_util_7d")?.value, 1)}
            title="MYRMIDONS risk model: time-weighted mean utilization over the last 7 days"
            loading={!revealed || riskQuery.isLoading}
          />
          <Metric
            label="AVG_30D"
            value={fmtPct(riskMetric("avg_util_30d")?.value, 1)}
            title="MYRMIDONS risk model: time-weighted mean utilization over the last 30 days"
            loading={!revealed || riskQuery.isLoading}
          />
          <Metric
            label="TIME>95% 30D"
            value={fmtPct(riskMetric("time_at_utilization_95_30d")?.value, 1)}
            tone={(riskMetric("time_at_utilization_95_30d")?.value ?? 0) > 0.2 ? "gold" : "default"}
            title="MYRMIDONS risk model: share of the last 30 days spent above 95% utilization"
            loading={!revealed || riskQuery.isLoading}
          />
          <Metric
            label="TIME>99% 30D"
            value={fmtPct(riskMetric("time_at_utilization_99_30d")?.value, 1)}
            tone={(riskMetric("time_at_utilization_99_30d")?.value ?? 0) > 0.1 ? "danger" : "default"}
            title="MYRMIDONS risk model: share of the last 30 days spent above 99% utilization (near-frozen)"
            loading={!revealed || riskQuery.isLoading}
          />
          </div>
        </Panel>

        <Panel title="Collateral">
          {/* Pure collateral price risk; LLTV lives here because the buffer
              metrics below are defined by it (buffer = 1 - LLTV). */}
          <Metric label="LLTV" value={fmtPct(market.lltv, 0)} loading={!revealed} />
          <Metric
            label="VOL_7D"
            value={fmtPct(riskMetric("realized_vol_7d")?.value, 0)}
            title="MYRMIDONS risk model: annualized realized volatility of the collateral price, 7d of hourly returns"
            loading={!revealed || riskQuery.isLoading}
          />
          <Metric
            label="VOL_30D"
            value={fmtPct(riskMetric("realized_vol_30d")?.value, 0)}
            title="MYRMIDONS risk model: annualized realized volatility of the collateral price, 30d of hourly returns"
            loading={!revealed || riskQuery.isLoading}
          />
          <Metric
            label="BREACH_24H"
            value={fmtPct(riskMetric("buffer_breach_freq_24h")?.value)}
            tone={(riskMetric("buffer_breach_freq_24h")?.value ?? 0) > 0 ? "gold" : "default"}
            loading={!revealed || riskQuery.isLoading}
            title={`MYRMIDONS risk model: share of the last 30d where the collateral fell through the market's whole liquidation cushion (1 − LLTV) within 24 hours. Within 1 hour: ${fmtPct(riskMetric("buffer_breach_freq_1h")?.value)}`}
          />
          <Metric
            label="MAX_DD_30D"
            value={fmtPct(riskMetric("max_drawdown_30d")?.value)}
            loading={!revealed || riskQuery.isLoading}
            title={`MYRMIDONS risk model: worst peak-to-trough collateral price drawdown over the last 30 days · ${riskMetric("max_drawdown_30d")?.as_of ? `${fmtAge(riskMetric("max_drawdown_30d")?.as_of)} old` : "no data yet"}`}
          />
        </Panel>

        <Panel title="Oracle">
          {/* Two columns: identity + the four MorphoChainlinkOracleV2 feed
              slots (empty slot = address(0), shown as 0x0 — that IS the
              shape of a Morpho oracle) stay within ~5 rows. */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {oracle ? (
              <>
                <Metric
                  label="PROVIDER"
                  value={oracleProvider(oracle).label}
                  tone={oracleProvider(oracle).tone}
                  title={`Oracle identity from the MNEMON archive (immutable on-chain config, probed ${oracle.fetched_at ? fmtAge(oracle.fetched_at) : "—"} ago). Contract kind: ${oracle.kind ?? "unresolved"}${oracle.family === "meta-deviation-timelock" ? " · Steakhouse MetaOracleDeviationTimelock: serves a primary oracle, fails over to a backup when they deviate past a threshold for a timelock" : oracle.family ? ` · family: ${oracle.family}` : ""}. Provider names of push feeds are read from each feed's own description.`}
                  loading={!revealed || riskQuery.isLoading}
                />
                <Metric
                  label="ADDRESS"
                  value={<ExplorerAddr chainId={chainOf(market)} address={oracle.address} />}
                />
                {showSlots &&
                  FEED_SLOTS.map((role) => {
                    const leg = legByRole.get(role);
                    return (
                      <Metric
                        key={role}
                        label={role.toUpperCase()}
                        value={
                          leg ? (
                            <ExplorerAddr
                              chainId={chainOf(market)}
                              address={leg.address}
                              text={leg.description ? truncate(leg.description, 22) : undefined}
                              title={`${leg.vendor ?? "unknown vendor"} · ${leg.address}`}
                            />
                          ) : (
                            <span className="text-text-dim/40">0x0</span>
                          )
                        }
                        loading={!revealed || riskQuery.isLoading}
                      />
                    );
                  })}
                {oracle.legs
                  .filter((l) => l.role.endsWith("vault"))
                  .map((leg) => (
                    <Metric
                      key={leg.role}
                      label={leg.role.toUpperCase()}
                      value={
                        <ExplorerAddr
                          chainId={chainOf(market)}
                          address={leg.address}
                          text={leg.description ? truncate(leg.description, 22) : undefined}
                          title={`ERC4626 exchange-rate hook · ${leg.address}`}
                        />
                      }
                      loading={!revealed || riskQuery.isLoading}
                    />
                  ))}
                {oracle.modt && (
                  <>
                    <Metric
                      label="PRIMARY"
                      value={
                        <ExplorerAddr
                          chainId={chainOf(market)}
                          address={oracle.modt.primary.address}
                          text={modtSideText(oracle.modt.primary)}
                          title={modtSideTitle("Primary oracle", oracle.modt.primary)}
                        />
                      }
                      loading={!revealed || riskQuery.isLoading}
                    />
                    <Metric
                      label="BACKUP"
                      value={
                        <ExplorerAddr
                          chainId={chainOf(market)}
                          address={oracle.modt.backup.address}
                          text={modtSideText(oracle.modt.backup)}
                          title={modtSideTitle("Backup oracle", oracle.modt.backup)}
                        />
                      }
                      loading={!revealed || riskQuery.isLoading}
                    />
                    {oracle.modt.threshold_bps != null && (
                      <Metric
                        label="FAILOVER"
                        value={`${oracle.modt.threshold_bps} BPS · ${fmtHours(oracle.modt.challenge_timelock_s)}`}
                        title={`Fails over to the backup when primary and backup deviate by more than ${oracle.modt.threshold_bps} bps for the challenge timelock (${fmtHours(oracle.modt.challenge_timelock_s)}); heals back after ${fmtHours(oracle.modt.healing_timelock_s)}. Challenge and heal are permissionless.`}
                        loading={!revealed || riskQuery.isLoading}
                      />
                    )}
                  </>
                )}
                <Metric
                  label="OWNER"
                  value={
                    oracle.owner_status === "ok"
                      ? "OWNED"
                      : oracle.owner_status === "none"
                        ? "IMMUTABLE"
                        : "—"
                  }
                  tone={oracle.owner_status === "ok" ? "gold" : oracle.owner_status === "none" ? "success" : "default"}
                  title="OWNED = the oracle contract exposes an admin that can change what it serves (an upgradable feed is the real risk surface). IMMUTABLE = no owner. Describes the oracle wrapper, not the upstream feeds."
                  loading={!revealed || riskQuery.isLoading}
                />
                <Metric
                  label="SHARED_FEEDS"
                  value={oracle.shared_feed_markets != null ? `${oracle.shared_feed_markets} MKTS` : "—"}
                  tone={(oracle.shared_feed_markets ?? 0) >= 10 ? "gold" : "default"}
                  title="Blast radius: how many tracked markets (this one included) read at least one of this oracle's feeds — a compromised or broken upstream feed hits them all at once."
                  loading={!revealed || riskQuery.isLoading}
                />
              </>
            ) : (
              <div className="col-span-2 text-[10px] font-mono text-text-dim/50">
                {riskQuery.isLoading ? "LOADING…" : "NO_ORACLE_DATA"}
              </div>
            )}
            <Metric
              label="PRICE"
              value={
                market.oracle_price != null
                  ? `${fmtPrice(market.oracle_price)} ${market.loan_symbol ?? ""}`.trim()
                  : "—"
              }
              title={`Price of 1 ${market.collateral_symbol ?? "collateral"} in ${market.loan_symbol ?? "loan"} terms`}
              loading={!revealed}
            />
            <Metric
              label="VS_DEFILLAMA"
              value={
                market.oracle_deviation != null && structuralDev
                  ? `${fmtSignedPct(market.oracle_deviation)} · STRUCT`
                  : fmtSignedPct(market.oracle_deviation)
              }
              tone={structuralDev ? "default" : devTone(market.oracle_deviation)}
              title={
                structuralDev
                  ? "Morpho oracle vs the DefiLlama collateral/loan SPOT cross. This oracle composes an exchange-rate/derived leg, so persistent deviation vs spot is structural — a fingerprint, not a depeg."
                  : "Morpho oracle vs the DefiLlama collateral/loan cross at the latest sample. Positive = oracle rich."
              }
              loading={!revealed}
            />
            {worstDepeg && (
              <Metric
                label="DEPEG_30D"
                value={`${marketDepegs.length}× · ${fmtDurationMin(worstDepeg.duration_min)}${worstDepeg.open ? " · OPEN" : ""}`}
                tone={worstDepeg.open ? (worstDepeg.threshold >= 0.05 ? "danger" : "gold") : "default"}
                title={`Oracle-vs-DefiLlama decoupling episodes (|deviation| ≥ 2%) in the last 30d; showing the most severe episode's duration. Peak ${fmtSignedPct(worstDepeg.peak_deviation)}.`}
                loading={!revealed}
              />
            )}
          </div>
        </Panel>

        {showFlows && (
          <Panel title="Flows (loan units)">
            {flowsSynced === false ? (
              <div className="text-[10px] font-mono text-gold/80">
                SYNCING_HISTORY — flow windows not current yet
              </div>
            ) : flow ? (
              <>
                <Metric
                  label="NET_SUPPLY_24H"
                  value={fmtAmount(flow.net_supply_24h, flow.loan_symbol, { signed: true })}
                  tone={
                    (flow.net_supply_24h ?? 0) > 0
                      ? "success"
                      : (flow.net_supply_24h ?? 0) < 0
                        ? "danger"
                        : "default"
                  }
                  title={`In ${fmtAmount(flow.supply_in_24h, flow.loan_symbol)} · out ${fmtAmount(flow.supply_out_24h, flow.loan_symbol)}`}
                  loading={!revealed}
                />
                <Metric
                  label="NET_SUPPLY_7D"
                  value={fmtAmount(flow.net_supply_7d, flow.loan_symbol, { signed: true })}
                  title={`In ${fmtAmount(flow.supply_in_7d, flow.loan_symbol)} · out ${fmtAmount(flow.supply_out_7d, flow.loan_symbol)}`}
                  loading={!revealed}
                />
                <Metric
                  label="NET_BORROW_24H"
                  value={fmtAmount(flow.net_borrow_24h, flow.loan_symbol, { signed: true })}
                  title="New borrows minus repays (liquidation repayments included)"
                  loading={!revealed}
                />
                <Metric
                  label="LIQUIDATIONS_30D"
                  value={flow.n_liquidations_30d ?? 0}
                  tone={(flow.n_liquidations_30d ?? 0) > 0 ? "gold" : "default"}
                  loading={!revealed}
                  glitchMode="number"
                />
              </>
            ) : (
              <div className="text-[10px] font-mono text-text-dim/50">
                NO_FLOWS_30D (no market events in the window)
              </div>
            )}
          </Panel>
        )}
      </div>
    </div>
  );
}
