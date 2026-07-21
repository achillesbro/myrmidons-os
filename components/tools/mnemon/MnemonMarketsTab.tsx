"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useMarketHealth, useUtilSpells } from "@/lib/mnemon/queries";
import type { MarketHealthEntry, UtilSpell } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { TerminalScrollLoader } from "@/components/ui/terminal-scroll-loader";
import {
  fmtPct,
  fmtUsd,
  fmtAge,
  fmtRatio,
  fmtPrice,
  fmtDurationMin,
  ageMinutes,
  reasonLabel,
  pairLabel,
  STALE_MINUTES,
} from "@/lib/mnemon/format";
import { MarketSparkline } from "./MarketSparkline";
import { computeMarketStats } from "@/lib/mnemon/aggregate";
import { cn } from "@/lib/utils";

type SortKey =
  | "market"
  | "util"
  | "supply_apy"
  | "apy_target"
  | "supply"
  | "available"
  | "status";

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "market", label: "MARKET", align: "left" },
  { key: "util", label: "UTIL", align: "right" },
  { key: "supply_apy", label: "SUPPLY APY", align: "right" },
  { key: "apy_target", label: "APY@TARGET", align: "right" },
  { key: "supply", label: "SUPPLY", align: "right" },
  { key: "available", label: "AVAILABLE", align: "right" },
  { key: "status", label: "STATUS", align: "right" },
];

// Text columns default to ascending (A→Z), numeric to descending (biggest first).
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  market: "asc",
  util: "desc",
  supply_apy: "desc",
  apy_target: "desc",
  supply: "desc",
  available: "desc",
  status: "desc",
};

function sortValue(m: MarketHealthEntry, key: SortKey): number | string | null {
  switch (key) {
    case "market":
      return pairLabel(m.collateral_symbol, m.loan_symbol).toLowerCase();
    case "util":
      return m.utilization;
    case "supply_apy":
      return m.supply_apy;
    case "apy_target":
      return m.apy_at_target;
    case "supply":
      return m.supply_usd;
    case "available":
      return m.available_usd;
    case "status":
      return m.is_broken ? 1 : 0;
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

function StatusCell({ market }: { market: MarketHealthEntry }) {
  const label = reasonLabel(market.broken_reason);
  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      {market.is_broken && label && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-danger">
          {label}
        </span>
      )}
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full shrink-0",
          market.is_broken ? "bg-danger" : "bg-success"
        )}
        style={{
          boxShadow: market.is_broken
            ? "0 0 6px color-mix(in oklab, var(--danger) 55%, transparent)"
            : "0 0 6px color-mix(in oklab, var(--success) 55%, transparent)",
        }}
      />
    </span>
  );
}

function SpellRow({ spell }: { spell: UtilSpell }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-border/20 last:border-0">
      <span className="text-[10px] font-mono text-text-dim">
        u ≥ {(spell.threshold * 100).toFixed(0)}%
      </span>
      <span className="text-[10px] font-mono text-text">
        {fmtDurationMin(spell.duration_min)}
      </span>
      <span className="text-[10px] font-mono text-text-dim/70">
        peak {spell.peak_u != null ? `${(spell.peak_u * 100).toFixed(1)}%` : "—"}
      </span>
      {spell.open ? (
        <span
          title="Ongoing — the market is still at this utilization as of the latest sample"
          className="text-[9px] font-mono uppercase tracking-wider text-gold border border-gold/50 px-1"
        >
          OPEN
        </span>
      ) : (
        <span
          title="Ended — utilization has since dropped back below the threshold"
          className="text-[9px] font-mono uppercase tracking-wider text-text-dim/50"
        >
          CLOSED
        </span>
      )}
    </div>
  );
}

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
  // Scalar values glitch-reveal like the vault-page KPIs; richer nodes
  // (e.g. the copyable ID button) render as-is.
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

function Drilldown({
  market,
  spells,
}: {
  market: MarketHealthEntry;
  spells: UtilSpell[];
}) {
  const marketSpells = spells
    .filter((s) => s.market_id === market.market_id)
    .sort((a, b) => (a.open === b.open ? b.threshold - a.threshold : a.open ? -1 : 1));

  const br = market.borrower_risk;
  const reg = market.utilization_regime;
  const spread = market.spread_to_best;

  // One-shot reveal on expand (Drilldown mounts fresh per row): metric values
  // glitch in, and the chart shows the terminal-scroll loader briefly first —
  // mirroring the vault pages' load treatment.
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
        <div className="lg:col-span-2 min-h-[12rem] h-48">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
            SUPPLY_APY / UTILIZATION // 7D
          </div>
          <div className="h-[calc(100%-1.25rem)]">
            {chartReady ? (
              <MarketSparkline history={market.history} />
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
            UTILIZATION_SPELLS // 30D
          </div>
          <div className="text-[10px] font-mono text-text-dim/60 leading-snug mb-2">
            Stretches this market sat at or above near-full utilization — when
            liquidity is thin and lenders may not be able to withdraw.{" "}
            <span className="text-gold">OPEN</span> = ongoing now,{" "}
            <span className="text-text-dim">CLOSED</span> = ended.
          </div>
          {marketSpells.length > 0 ? (
            <div className="space-y-0.5">
              {marketSpells.slice(0, 6).map((s, i) => (
                <SpellRow key={`${s.threshold}-${s.start_ts}-${i}`} spell={s} />
              ))}
            </div>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">
              NO_SPELLS (never held u ≥ 92% in the last 30d)
            </div>
          )}
        </div>
      </div>

      {/* Metric panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
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
        </Panel>

        <Panel title="Market">
          <Metric label="BORROW_APY" value={fmtPct(market.borrow_apy)} loading={!revealed} />
          <Metric label="LLTV" value={fmtPct(market.lltv, 0)} loading={!revealed} />
          <Metric
            label="VS_BEST"
            value={
              spread == null ? "—" : spread >= -0.0001 ? "BEST" : `−${fmtPct(-spread)}`
            }
            tone={spread != null && spread >= -0.0001 ? "success" : "default"}
            title="APY gap below the best non-broken market (0 = this is the leader)"
            loading={!revealed}
          />
          <Metric label="MARKET_ID" value={<CopyableId id={market.market_id} />} />
        </Panel>
      </div>
    </div>
  );
}

export function MnemonMarketsTab() {
  const { data, isLoading, isError } = useMarketHealth();
  const spellsQuery = useUtilSpells();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // null = the export's default order (healthy first, then by supply desc).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const markets = useMemo(() => data?.markets ?? [], [data]);
  const broken = useMemo(() => markets.filter((m) => m.is_broken), [markets]);
  const stats = useMemo(() => computeMarketStats(markets), [markets]);
  const reasonSummary = useMemo(() => {
    const reasons = broken.reduce<Record<string, number>>((acc, m) => {
      const r = m.broken_reason ?? "unknown";
      acc[r] = (acc[r] ?? 0) + 1;
      return acc;
    }, {});
    return Object.entries(reasons)
      .map(([r, n]) => `${n} ${reasonLabel(r) ?? r.toUpperCase()}`)
      .join(" · ");
  }, [broken]);
  const min = ageMinutes(data?.generated_at);
  const stale = min != null && min > STALE_MINUTES;

  const sortedMarkets = useMemo(() => {
    if (!sortKey) return markets;
    const arr = [...markets];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls always last
      if (vb == null) return -1;
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : (va as number) - (vb as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [markets, sortKey, sortDir]);

  const onSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    } else if (sortDir === DEFAULT_DIR[key]) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(null); // third click restores default order
    }
  };

  return (
    <div className="flex flex-col">
      {/* KPI header strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-l border-t border-border bg-bg-base content-start">
        <GridKpi
          label="Total Supply"
          value={<GlitchTypeText loading={isLoading} value={fmtUsd(stats.totalSupplyUsd)} mode="text" />}
          subValue={
            <span className="text-text-dim font-mono">
              <GlitchTypeText loading={isLoading} value={`${stats.markets} MARKETS`} mode="text" />
            </span>
          }
        />
        <GridKpi
          label="Deployable Liq."
          value={<GlitchTypeText loading={isLoading} value={fmtUsd(stats.deployableLiquidityUsd)} mode="text" />}
          subValue={
            <span className="text-text-dim font-mono">
              <GlitchTypeText loading={isLoading} value={`${stats.deployableCount} MARKETS ≥ $10K`} mode="text" />
            </span>
          }
        />
        <GridKpi
          label="Best Deployable APY"
          value={
            <GlitchTypeText
              loading={isLoading}
              value={stats.bestDeployableApy != null ? fmtPct(stats.bestDeployableApy) : "—"}
              mode="text"
            />
          }
          accent="gold"
          cornerIndicator="gold"
        />
        <GridKpi
          label="Broken"
          value={<GlitchTypeText loading={isLoading} value={String(stats.brokenCount)} mode="number" />}
          subValue={
            reasonSummary ? (
              <span className="text-text-dim font-mono">
                <GlitchTypeText loading={isLoading} value={reasonSummary} mode="text" />
              </span>
            ) : undefined
          }
          accent={stats.brokenCount ? "danger" : "success"}
          cornerIndicator={stats.brokenCount ? "danger" : "success"}
        />
        <GridKpi
          label="At-Risk"
          value={<GlitchTypeText loading={isLoading} value={String(stats.atRiskCount)} mode="number" />}
          subValue={<span className="text-text-dim font-mono">BORROWER HF &lt; 1.05</span>}
          accent={stats.atRiskCount ? "gold" : "default"}
          cornerIndicator={stats.atRiskCount ? "gold" : "default"}
        />
        <GridKpi
          label="Data Age"
          value={<GlitchTypeText loading={isLoading} value={fmtAge(data?.generated_at)} mode="text" />}
          subValue={<span className="text-text-dim font-mono">15M CADENCE</span>}
          accent={stale ? "gold" : "default"}
          cornerIndicator={stale ? "gold" : "default"}
        />
      </div>

      {/* Table */}
      <div className="border-l border-t border-border bg-bg-base">
        <div className="h-10 px-3 border-b border-border bg-panel flex items-center">
          <h3 className="font-mono font-bold text-white text-xs uppercase tracking-widest">
            <GlitchTypeText loading={isLoading} value="HyperEVM Morpho Markets" mode="text" />
          </h3>
        </div>

        {isLoading ? (
          <TerminalScrollLoader variant="table" className="h-64 w-full border-0" seed="mnemon-markets" />
        ) : isError ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <div className="text-danger font-mono text-sm uppercase tracking-widest">
              DATA_UNAVAILABLE
            </div>
            <div className="text-text-dim/60 font-mono text-xs">
              Could not load the MNEMON archive
            </div>
          </div>
        ) : markets.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-text-dim/60 font-mono text-sm">
            NO_MARKETS
          </div>
        ) : (
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[720px] text-left border-collapse">
              <thead>
                <tr className="bg-panel text-[9px] uppercase text-text-dim border-b border-border tracking-widest">
                  {COLS.map((c) => {
                    const active = sortKey === c.key;
                    return (
                      <th
                        key={c.key}
                        className={cn(
                          "px-3 py-2 font-mono font-normal",
                          c.align === "right" ? "text-right" : "text-left"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onSort(c.key)}
                          title="Click to sort"
                          className={cn(
                            "inline-flex items-center gap-1 uppercase tracking-widest hover:text-white transition-colors cursor-pointer",
                            c.align === "right" && "flex-row-reverse",
                            active && "text-gold"
                          )}
                        >
                          {c.label}
                          <span className="text-[8px] w-2 inline-block">
                            {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sortedMarkets.map((m) => {
                  const open = expandedId === m.market_id;
                  return (
                    <Fragment key={m.market_id}>
                      <tr
                        onClick={() => setExpandedId(open ? null : m.market_id)}
                        className={cn(
                          "border-b border-border/40 font-mono cursor-pointer transition-colors",
                          m.is_broken ? "bg-danger/5 hover:bg-danger/10" : "hover:bg-white/5",
                          open && "bg-white/5"
                        )}
                      >
                        <td className="px-3 py-2 text-xs text-text">
                          <span className="inline-flex items-center gap-2">
                            <span
                              aria-hidden
                              className={cn(
                                "text-[10px] text-text-dim/60 transition-transform",
                                open && "rotate-90"
                              )}
                            >
                              ▸
                            </span>
                            {pairLabel(m.collateral_symbol, m.loan_symbol)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-text-dim">
                          {fmtPct(m.utilization, 1)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gold">
                          {fmtPct(m.supply_apy)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-text-dim">
                          {fmtPct(m.apy_at_target)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-text">{fmtUsd(m.supply_usd)}</td>
                        <td className="px-3 py-2 text-right text-xs text-text">
                          {fmtUsd(m.available_usd)}
                        </td>
                        <td className="px-3 py-2 text-right text-xs">
                          <StatusCell market={m} />
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={COLS.length} className="p-0">
                            <Drilldown market={m} spells={spellsQuery.data?.spells ?? []} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footnote */}
      <div className="px-3 py-3 text-[10px] font-mono text-text-dim/50 leading-relaxed border-l border-border bg-bg-base">
        MNEMON archive · sampled every 15 min · APY uses the HEGEMON bot&apos;s
        AdaptiveCurveIRM math (fee assumed 0). Broken flags:{" "}
        <span className="text-danger">RATE_RATCHET</span> (runaway rate),{" "}
        <span className="text-danger">PINNED_UTIL</span> (stuck at full
        utilization), <span className="text-danger">DUST</span> (&lt; $1k
        supply). Not investment advice.
      </div>
    </div>
  );
}
