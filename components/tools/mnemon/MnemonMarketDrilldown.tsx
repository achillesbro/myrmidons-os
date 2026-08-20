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
  fmtPct,
  fmtPrice,
  fmtRatio,
  fmtSignedPct,
} from "@/lib/mnemon/format";
import { CopyableAddr } from "./CopyableAddr";
import { isInvestable } from "@/lib/mnemon/aggregate";
import { MarketSparkline } from "./MarketSparkline";
import { useRiskMarkets } from "@/lib/risk/queries";
import { cn } from "@/lib/utils";

// The MNEMON per-market drill-down: 7d APY/util sparkline, the RISK panel
// (myrmidons-api model outputs — capacity, buffer breach, drawdown), and
// Borrower Risk / Utilization / Collateral / Market panels. Shared by the /tools/mnemon
// table and the vault-page allocation tables (each mounts it fresh on
// expand, so the glitch-reveal fires each time).

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
  const riskMetric = (name: string) => risk?.metrics[name];

  const marketDepegs = (depegSpells ?? [])
    .filter((s) => s.market_id === market.market_id)
    .sort((a, b) => (a.open === b.open ? b.threshold - a.threshold : a.open ? -1 : 1));
  const worstDepeg = marketDepegs[0];

  const br = market.borrower_risk;
  const reg = market.utilization_regime;
  const sc = market.supplier_concentration;
  const showFlows = flow !== undefined; // caller fetches flows -> render the panel

  // Volume bars + liquidation markers only when the flow archive is current —
  // stale flow history would misalign with the always-fresh APY line.
  const flowHistory = flowsSynced ? (flow?.flow_history ?? undefined) : undefined;
  const liquidationTs = flowsSynced
    ? (liquidations ?? [])
        .filter((l) => l.market_id === market.market_id && l.ts != null)
        .map((l) => l.ts as string)
    : undefined;
  const hasFlowStrip =
    (flowHistory?.some((p) => p.net_supply_flow) ?? false) || (liquidationTs?.length ?? 0) > 0;

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
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
            {hasFlowStrip
              ? "SUPPLY_APY / UTILIZATION / NET_FLOW // 7D"
              : "SUPPLY_APY / UTILIZATION // 7D"}
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
            RISK // MYRMIDONS MODEL
          </div>
          <div className="text-[10px] font-mono text-text-dim/60 leading-snug mb-2">
            Model outputs on top of the raw archive: can this market&apos;s debt
            be liquidated profitably at on-chain liquidity, and how often has
            the collateral gapped through its liquidation cushion.
          </div>
          {riskQuery.isError || (!riskQuery.isLoading && !risk) ? (
            <div className="text-[10px] font-mono text-text-dim/50">
              RISK_DATA_UNAVAILABLE (model has no rows for this market yet)
            </div>
          ) : (
            <div className="space-y-1.5">
              <Metric
                label="CAPACITY"
                value={
                  cap?.capacity_ratio != null ? `${fmtRatio(cap.capacity_ratio)}×` : "—"
                }
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
                title={`Fraction of this market's WHOLE debt that could be profitably liquidated in one sweep at current DEX+Core liquidity (≥1× = the full book clears). Under simultaneous same-collateral stress: ${cap?.capacity_ratio_grouped != null ? `${fmtRatio(cap.capacity_ratio_grouped)}×` : "—"} · max tolerable slippage ${fmtPct(cap?.max_slippage_used)}`}
              />
              <Metric
                label="BREACH_1H"
                value={fmtPct(riskMetric("buffer_breach_freq_1h")?.value)}
                tone={(riskMetric("buffer_breach_freq_1h")?.value ?? 0) > 0 ? "danger" : "default"}
                loading={!revealed || riskQuery.isLoading}
                title="Share of the last 30d where the collateral fell through the market's whole liquidation cushion (1 − LLTV) within one hour"
              />
              <Metric
                label="BREACH_24H"
                value={fmtPct(riskMetric("buffer_breach_freq_24h")?.value)}
                tone={(riskMetric("buffer_breach_freq_24h")?.value ?? 0) > 0 ? "gold" : "default"}
                loading={!revealed || riskQuery.isLoading}
                title="Share of the last 30d where the collateral fell through the market's whole liquidation cushion (1 − LLTV) within 24 hours"
              />
              <Metric
                label="MAX_DD_30D"
                value={fmtPct(riskMetric("max_drawdown_30d")?.value)}
                loading={!revealed || riskQuery.isLoading}
                title="Worst peak-to-trough collateral price drawdown over the last 30 days"
              />
              <div className="text-[9px] font-mono text-text-dim/50 pt-1">
                capacity {cap?.as_of ? fmtAge(cap.as_of) : "—"} · metrics{" "}
                {riskMetric("max_drawdown_30d")?.as_of
                  ? fmtAge(riskMetric("max_drawdown_30d")?.as_of)
                  : "—"}{" "}
                old
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Metric panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border border border-border">
        <Panel title="Borrower Risk">
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
              <Metric
                label="TOP3_CONC"
                value={fmtPct(br.top3_debt_pct, 0)}
                tone={(br.top3_debt_pct ?? 0) > 0.6 ? "gold" : "default"}
                title="Share of debt held by the 3 largest borrowers"
                loading={!revealed}
              />
            </>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">NO_BORROWERS</div>
          )}
        </Panel>

        <Panel title="Lender Book">
          {sc ? (
            <>
              <Metric label="SUPPLIERS" value={sc.suppliers} loading={!revealed} glitchMode="number" />
              <Metric
                label="TOP1_SHARE"
                value={fmtPct(sc.top1_supply_pct, 0)}
                tone={concTone(sc.top1_supply_pct)}
                title="Share of this market's supply held by its single largest lender — the address that can unilaterally move utilization (and yield) by withdrawing. Often a Morpho vault; that IS the answer."
                loading={!revealed}
              />
              <Metric
                label="TOP3_SHARE"
                value={fmtPct(sc.top3_supply_pct, 0)}
                tone={concTone(sc.top3_supply_pct)}
                title="Share of supply held by the 3 largest lenders"
                loading={!revealed}
              />
              <Metric label="TOP1_ADDR" value={<CopyableAddr addr={sc.top1_supplier} />} />
            </>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">NO_SUPPLIER_DATA</div>
          )}
        </Panel>

        <Panel title="Utilization">
          {reg ? (
            <>
              <Metric label="AVG_7D" value={fmtPct(reg.avg_util_7d, 1)} loading={!revealed} />
              <Metric label="AVG_30D" value={fmtPct(reg.avg_util_30d, 1)} loading={!revealed} />
              <Metric
                label="TIME>95% 30D"
                value={fmtPct(reg.pct_time_gt95_30d, 1)}
                tone={(reg.pct_time_gt95_30d ?? 0) > 0.2 ? "gold" : "default"}
                title="Share of the last 30 days spent above 95% utilization"
                loading={!revealed}
              />
              <Metric
                label="TIME>99% 30D"
                value={fmtPct(reg.pct_time_gt99_30d, 1)}
                tone={(reg.pct_time_gt99_30d ?? 0) > 0.1 ? "danger" : "default"}
                title="Share of the last 30 days spent above 99% utilization (near-frozen)"
                loading={!revealed}
              />
            </>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">—</div>
          )}
        </Panel>

        <Panel title="Collateral">
          <Metric
            label="ORACLE"
            value={
              market.oracle_price != null
                ? `${fmtPrice(market.oracle_price)} ${market.loan_symbol ?? ""}`.trim()
                : "—"
            }
            title={`Price of 1 ${market.collateral_symbol ?? "collateral"} in ${market.loan_symbol ?? "loan"} terms`}
            loading={!revealed}
          />
          <Metric
            label="VOL_7D"
            value={fmtPct(market.collateral_vol_7d, 0)}
            title="Annualized 7-day price volatility of the collateral"
            loading={!revealed}
          />
          <Metric label="VOL_30D" value={fmtPct(market.collateral_vol_30d, 0)} loading={!revealed} />
          <Metric
            label="VS_DEFILLAMA"
            value={fmtSignedPct(market.oracle_deviation)}
            tone={devTone(market.oracle_deviation)}
            title="Morpho oracle vs the DefiLlama collateral/loan cross at the latest sample. Positive = oracle rich. Exchange-rate oracles (LSTs, RWAs) show a persistent structural deviation — read it as a fingerprint, not automatically a depeg."
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
        </Panel>

        <Panel title="Market">
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
          <Metric label="LLTV" value={fmtPct(market.lltv, 0)} loading={!revealed} />
          <Metric
            label="VS_BEST"
            value={vsBest}
            tone={isLeader ? "success" : "default"}
            title="APY vs the best investable market (non-broken, ≥ $50k liquidity). '—' = this market isn't investable, so the comparison is meaningless."
            loading={!revealed}
          />
          <Metric label="MARKET_ID" value={<CopyableId id={market.market_id} />} />
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
