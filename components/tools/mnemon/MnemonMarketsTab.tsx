"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  useDepegSpells,
  useMarketFlows,
  useMarketHealth,
  useUtilSpells,
} from "@/lib/mnemon/queries";
import type { FlowsMarketEntry, MarketHealthEntry } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import {
  fmtAmount,
  fmtPct,
  fmtUsd,
  fmtAge,
  ageMinutes,
  reasonLabel,
  pairLabel,
  chainOf,
  chainTag,
  flowsSyncedFor,
  MNEMON_CHAINS,
  STALE_MINUTES,
} from "@/lib/mnemon/format";
import { computeMarketStats, isRealMarket } from "@/lib/mnemon/aggregate";
import { MnemonMarketDrilldown } from "./MnemonMarketDrilldown";
import { cn } from "@/lib/utils";

type SortKey =
  | "market"
  | "util"
  | "supply_apy"
  | "apy_target"
  | "supply"
  | "available"
  | "flow"
  | "status";

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "market", label: "MARKET", align: "left" },
  { key: "util", label: "UTIL", align: "right" },
  { key: "supply_apy", label: "SUPPLY APY", align: "right" },
  { key: "apy_target", label: "APY@TARGET", align: "right" },
  { key: "supply", label: "SUPPLY", align: "right" },
  { key: "available", label: "AVAILABLE", align: "right" },
  { key: "flow", label: "NET 24H", align: "right" },
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
  flow: "desc",
  status: "desc",
};

function sortValue(
  m: MarketHealthEntry,
  key: SortKey,
  flowByMarket: Map<string, FlowsMarketEntry>
): number | string | null {
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
    case "flow":
      // Loan-token units — cross-token sorting is approximate; the loan-token
      // filter pills make it exact within one token.
      return flowByMarket.get(m.market_id)?.net_supply_24h ?? null;
    case "status":
      return m.is_broken ? 1 : 0;
  }
}

// Lender-concentration / oracle-deviation micro-badges shown when a market
// trips a risk threshold; the broken reason (if any) keeps its place.
function StatusCell({ market }: { market: MarketHealthEntry }) {
  const label = reasonLabel(market.broken_reason);
  const top1 = market.supplier_concentration?.top1_supply_pct;
  const dev = market.oracle_deviation;
  return (
    <span className="inline-flex items-center gap-1.5 justify-end">
      {top1 != null && top1 >= 0.5 && (
        <span
          title={`Largest lender holds ${(top1 * 100).toFixed(0)}% of supply — one withdrawal can move this market's yield`}
          className={cn(
            "text-[9px] font-mono uppercase tracking-wider",
            top1 >= 0.75 ? "text-danger" : "text-gold"
          )}
        >
          CONC
        </span>
      )}
      {dev != null && Math.abs(dev) >= 0.02 && (
        <span
          title={`Oracle deviates ${(dev * 100).toFixed(1)}% from the DefiLlama cross — structural for exchange-rate oracles, otherwise a decoupling`}
          className={cn(
            "text-[9px] font-mono uppercase tracking-wider",
            Math.abs(dev) >= 0.05 ? "text-danger" : "text-gold"
          )}
        >
          DEPEG
        </span>
      )}
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

// The NET 24H cell: signed loan-token flow, gated on the archive's flow-cursor
// sync (during the initial backfill the windows describe the past — show a
// syncing placeholder instead of stale numbers).
function FlowCell({
  flow,
  synced,
  loading,
}: {
  flow: FlowsMarketEntry | undefined;
  synced: boolean | null;
  loading: boolean;
}) {
  if (synced == null) {
    // flows snapshot not loaded (or errored) — column degrades to em-dashes
    return <span className="text-text-dim/50">—</span>;
  }
  if (!synced) {
    return (
      <span
        title="MNEMON is still ingesting flow history — the 24h window is not current yet"
        className="text-[9px] font-mono uppercase tracking-wider text-gold/70"
      >
        SYNC
      </span>
    );
  }
  const v = flow?.net_supply_24h ?? 0;
  return (
    <span className={cn(v > 0 ? "text-success" : v < 0 ? "text-danger" : "text-text-dim/50")}>
      <GlitchTypeText
        loading={loading}
        value={v === 0 ? "0" : fmtAmount(v, flow?.loan_symbol, { signed: true })}
        mode="text"
      />
    </span>
  );
}

export function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border transition-colors cursor-pointer",
        active
          ? "border-gold text-gold bg-gold/10"
          : "border-border text-text-dim hover:text-white hover:border-text-dim"
      )}
    >
      {label} <span className="opacity-50">{count}</span>
    </button>
  );
}

// chainId: filter every view (KPIs, pills, table) to one chain; null = all.
// The chain pill row renders here (same layout as the loan row) but the state
// lives in the page so it carries across tabs.
export function MnemonMarketsTab({
  chainId = null,
  onChainChange,
}: {
  chainId?: number | null;
  onChainChange?: (id: number | null) => void;
}) {
  const { data, isLoading, isError } = useMarketHealth();
  const spellsQuery = useUtilSpells();
  const flowsQuery = useMarketFlows();
  const depegQuery = useDepegSpells();
  // Flow sync is PER CHAIN (schema_version 6): a newly added chain backfills
  // for hours while the others are current. Row cells gate on their own
  // chain; the footnote gates on the selected chain (null = any view scope).
  const syncedFor = (cid: number) => flowsSyncedFor(flowsQuery.data, cid);
  const pageFlowsSynced: boolean | null = flowsQuery.data
    ? chainId == null
      ? (flowsQuery.data.synced ?? false)
      : syncedFor(chainId)
    : null;
  const flowByMarket = useMemo(
    () => new Map((flowsQuery.data?.markets ?? []).map((f) => [f.market_id, f])),
    [flowsQuery.data]
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // null = the export's default order (healthy first, then by supply desc).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  // Quick filter by loan token; null = all.
  const [loanFilter, setLoanFilter] = useState<string | null>(null);

  // Exclude idle markets (no collateral) — vault cash, not real lending
  // markets. allMarkets feeds the chain-pill counts; markets is the chain-
  // narrowed set everything else derives from (null = all chains).
  const allMarkets = useMemo(() => (data?.markets ?? []).filter(isRealMarket), [data]);
  const markets = useMemo(
    () => allMarkets.filter((m) => chainId == null || chainOf(m) === chainId),
    [allMarkets, chainId]
  );
  const chainCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const m of allMarkets) counts.set(chainOf(m), (counts.get(chainOf(m)) ?? 0) + 1);
    return counts;
  }, [allMarkets]);
  // A loan token picked on one chain may not exist on another — drop the pick.
  useEffect(() => setLoanFilter(null), [chainId]);
  // The loan-token filter drives BOTH the table and the KPI tiles; the pill
  // list + counts stay derived from the full set so every pill always shows.
  const filteredMarkets = useMemo(
    () => (loanFilter ? markets.filter((m) => m.loan_symbol === loanFilter) : markets),
    [markets, loanFilter]
  );
  const broken = useMemo(() => filteredMarkets.filter((m) => m.is_broken), [filteredMarkets]);
  const stats = useMemo(() => computeMarketStats(filteredMarkets), [filteredMarkets]);
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

  // Loan tokens present, with per-token market counts, most markets first.
  const loanTokens = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markets) {
      const s = m.loan_symbol ?? "?";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([symbol, count]) => ({ symbol, count }));
  }, [markets]);

  const sortedMarkets = useMemo(() => {
    if (!sortKey) return filteredMarkets;
    const arr = [...filteredMarkets];
    arr.sort((a, b) => {
      const va = sortValue(a, sortKey, flowByMarket);
      const vb = sortValue(b, sortKey, flowByMarket);
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
  }, [filteredMarkets, sortKey, sortDir, flowByMarket]);

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

  // One-shot cascading glitch reveal of the rows once data arrives: revealRows
  // climbs 0 → N in ~12 chunks, so each row's cells glitch-type in top-to-bottom
  // (a few at a time — smooth, not 380 cells at once). Keyed on row count so it
  // fires on first load, not on every sort or 2-min refetch.
  const [revealRows, setRevealRows] = useState(0);
  const rowCount = markets.length;
  useEffect(() => {
    if (isLoading || rowCount === 0) {
      setRevealRows(0);
      return;
    }
    setRevealRows(0);
    const step = Math.max(1, Math.ceil(rowCount / 12));
    let shown = 0;
    const id = setInterval(() => {
      shown += step;
      setRevealRows(shown);
      if (shown >= rowCount) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [isLoading, rowCount]);

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
          label="Withdrawal Liq."
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
          label="Investable"
          value={
            <GlitchTypeText loading={isLoading} value={String(stats.deployableCount)} mode="number" />
          }
          subValue={
            <span className="text-text-dim font-mono">
              <GlitchTypeText
                loading={isLoading}
                value={
                  stats.brokenCount
                    ? `${stats.brokenCount} BROKEN: ${reasonSummary}`
                    : "NON-BROKEN · ≥ $10K LIQ."
                }
                mode="text"
              />
            </span>
          }
          accent={isLoading ? "default" : "success"}
          cornerIndicator={isLoading ? "default" : "success"}
        />
        <GridKpi
          label="At-Risk"
          value={<GlitchTypeText loading={isLoading} value={String(stats.atRiskCount)} mode="number" />}
          subValue={<span className="text-text-dim font-mono">BORROWER HF &lt; 1.05</span>}
          accent={!isLoading && stats.atRiskCount ? "gold" : "default"}
          cornerIndicator={!isLoading && stats.atRiskCount ? "gold" : "default"}
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
            <GlitchTypeText loading={isLoading} value="Morpho Markets" mode="text" />
          </h3>
        </div>

        {/* Chain filter — same layout as the loan row below */}
        {!isLoading && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/40">
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono mr-1">
              CHAIN
            </span>
            <FilterPill
              label="ALL"
              count={allMarkets.length}
              active={chainId === null}
              onClick={() => onChainChange?.(null)}
            />
            {MNEMON_CHAINS.map((c) => (
              <FilterPill
                key={c.id}
                label={c.label}
                count={chainCounts.get(c.id) ?? 0}
                active={chainId === c.id}
                onClick={() => onChainChange?.(c.id)}
              />
            ))}
          </div>
        )}

        {/* Quick filter by loan token */}
        {!isLoading && loanTokens.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border/40">
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono mr-1">
              LOAN
            </span>
            <FilterPill
              label="ALL"
              count={markets.length}
              active={loanFilter === null}
              onClick={() => setLoanFilter(null)}
            />
            {loanTokens.map((t) => (
              <FilterPill
                key={t.symbol}
                label={t.symbol}
                count={t.count}
                active={loanFilter === t.symbol}
                onClick={() => setLoanFilter(t.symbol)}
              />
            ))}
          </div>
        )}

        {isError ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2">
            <div className="text-danger font-mono text-sm uppercase tracking-widest">
              DATA_UNAVAILABLE
            </div>
            <div className="text-text-dim/60 font-mono text-xs">
              Could not load the MNEMON archive
            </div>
          </div>
        ) : !isLoading && markets.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-text-dim/60 font-mono text-sm">
            NO_MARKETS
          </div>
        ) : (
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[840px] text-left border-collapse">
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
                {isLoading
                  ? // Glitch skeleton while the archive loads (blinking carets,
                    // not the scroll-loader) — matches the glitch-reveal aesthetic.
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`skeleton-${i}`} className="border-b border-border/40 font-mono">
                        {COLS.map((c) => (
                          <td
                            key={c.key}
                            className={cn(
                              "px-3 py-2 text-xs text-text-dim/40",
                              c.align === "right" ? "text-right" : "text-left"
                            )}
                          >
                            <GlitchTypeText loading value="" mode="text" />
                          </td>
                        ))}
                      </tr>
                    ))
                  : sortedMarkets.map((m, idx) => {
                      const open = expandedId === m.market_id;
                      const rowLoading = idx >= revealRows; // staggered glitch-in
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
                                <GlitchTypeText
                                  loading={rowLoading}
                                  value={pairLabel(m.collateral_symbol, m.loan_symbol)}
                                  mode="text"
                                />
                                {chainId == null && !rowLoading && (
                                  <span
                                    className="text-[8px] font-mono uppercase tracking-wider px-1 border border-border/60 text-text-dim/70"
                                    title={`chain_id ${chainOf(m)}`}
                                  >
                                    {chainTag(chainOf(m))}
                                  </span>
                                )}
                                {m.lltv != null && !rowLoading && (
                                  <span
                                    className="text-[9px] text-text-dim/50"
                                    title={`LLTV ${fmtPct(m.lltv, 0)}`}
                                  >
                                    {fmtPct(m.lltv, 0)}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-text-dim">
                              <GlitchTypeText loading={rowLoading} value={fmtPct(m.utilization, 1)} mode="text" />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gold">
                              <GlitchTypeText loading={rowLoading} value={fmtPct(m.supply_apy)} mode="text" />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-text-dim">
                              <GlitchTypeText loading={rowLoading} value={fmtPct(m.apy_at_target)} mode="text" />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-text">
                              <GlitchTypeText loading={rowLoading} value={fmtUsd(m.supply_usd)} mode="text" />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-text">
                              <GlitchTypeText loading={rowLoading} value={fmtUsd(m.available_usd)} mode="text" />
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              <FlowCell
                                flow={flowByMarket.get(m.market_id)}
                                synced={syncedFor(chainOf(m))}
                                loading={rowLoading}
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs">
                              <StatusCell market={m} />
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={COLS.length} className="p-0">
                                <MnemonMarketDrilldown
                                  market={m}
                                  spells={spellsQuery.data?.spells ?? []}
                                  bestInvestableApy={stats.bestDeployableApy}
                                  flow={flowByMarket.get(m.market_id) ?? null}
                                  flowsSynced={syncedFor(chainOf(m)) ?? false}
                                  depegSpells={depegQuery.data?.spells ?? []}
                                  liquidations={flowsQuery.data?.liquidations ?? []}
                                />
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
        MNEMON archive (HyperEVM + Robinhood Chain) · sampled every 15 min · APY uses the HEGEMON bot&apos;s
        AdaptiveCurveIRM math (fee assumed 0). Broken flags:{" "}
        <span className="text-danger">RATE_RATCHET</span> (runaway rate),{" "}
        <span className="text-danger">PINNED_UTIL</span> (stuck at full
        utilization), <span className="text-danger">DUST</span> (&lt; $1k
        supply). Badges: <span className="text-gold">CONC</span> (one lender ≥
        50% of supply), <span className="text-gold">DEPEG</span> (oracle ≥ 2%
        off the DefiLlama cross). NET 24H is in loan-token units.
        {pageFlowsSynced === false && (
          <>
            {" "}
            <span className="text-gold">
              Flow history is still syncing
              {flowsQuery.data?.data_through
                ? ` (ingested through ${flowsQuery.data.data_through.slice(0, 10)})`
                : ""}
              — flow columns activate when it catches up.
            </span>
          </>
        )}{" "}
        Not investment advice.
      </div>
    </div>
  );
}
