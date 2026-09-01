"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  useDepegSpells,
  useMarketFlows,
  useMarketHealth,
} from "@/lib/mnemon/queries";
import type { FlowsMarketEntry, MarketHealthEntry } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import {
  fmtAmount,
  fmtLltv,
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
import { CopyableId, MnemonMarketDrilldown } from "./MnemonMarketDrilldown";
import { FilterSelect } from "./FilterSelect";
import { useRiskMarkets } from "@/lib/risk/queries";
import { isStructuralOracle, oracleProviders } from "@/lib/risk/oracle";
import type { OracleBlock } from "@/lib/risk/schemas";
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

// Lender-concentration / oracle micro-badges shown when a market trips a
// risk threshold; the broken reason (if any) keeps its place. `oracle` is
// the risk API's identity block (optional — callers without the risk query
// simply show no oracle badge, and DEPEG falls back to spot-only logic).
export function StatusCell({
  market,
  oracle,
}: {
  market: MarketHealthEntry;
  oracle?: OracleBlock | null;
}) {
  const label = reasonLabel(market.broken_reason);
  const top1 = market.supplier_concentration?.top1_supply_pct;
  const dev = market.oracle_deviation;
  // Structural oracles (exchange-rate legs, hardcoded pegs) deviate from the
  // spot cross by construction — a DEPEG badge there is noise, not signal.
  const structural = isStructuralOracle(oracle);
  const oracleAlarm =
    oracle?.kind === "oracle-broken" ? "broken" : oracle?.kind === "opaque" ? "opaque" : null;
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
      {dev != null && Math.abs(dev) >= 0.02 && !structural && (
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
      {oracleAlarm && (
        <span
          title={
            oracleAlarm === "broken"
              ? `Oracle contract is broken (${oracle?.broken ?? "unpriceable"}) — the market cannot price collateral`
              : "Oracle contract is opaque — MNEMON could not resolve its price source; treat pricing as unverified"
          }
          className={cn(
            "text-[9px] font-mono uppercase tracking-wider",
            oracleAlarm === "broken" ? "text-danger" : "text-gold"
          )}
        >
          ORACLE
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
export function FlowCell({
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
  const flowsQuery = useMarketFlows();
  const depegQuery = useDepegSpells();
  // Risk API oracle identity for the status badges (also fetched by each
  // drill-down; TanStack dedupes on the query key).
  const riskQuery = useRiskMarkets();
  const oracleFor = (m: MarketHealthEntry): OracleBlock | null | undefined => {
    const e = riskQuery.data?.markets[m.market_id];
    return e && e.chain_id === chainOf(m) ? e.oracle : undefined;
  };
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
  // Quick filter by oracle provider (CHAINLINK, REDSTONE, ...); null = all.
  // Vocabulary comes from lib/risk/oracle.ts oracleProviders — a market can
  // match several (a composed oracle depends on every provider it reads).
  const [oracleFilter, setOracleFilter] = useState<string | null>(null);
  // Free-text search by market id (the export carries no oracle address —
  // widen the matcher if that ever ships).
  const [search, setSearch] = useState("");

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
  // A filter picked on one chain may not exist on another — drop the picks.
  useEffect(() => {
    setLoanFilter(null);
    setOracleFilter(null);
  }, [chainId]);
  // Provider tokens per market, from the risk API's oracle blocks.
  const providersByMarket = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const m of markets) {
      const e = riskQuery.data?.markets[m.market_id];
      out.set(m.market_id, oracleProviders(e && e.chain_id === chainOf(m) ? e.oracle : null));
    }
    return out;
  }, [markets, riskQuery.data]);
  // The loan/oracle filters and the search drive BOTH the table and the KPI
  // tiles; the dropdown options + counts stay derived from the full set.
  const filteredMarkets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return markets.filter(
      (m) =>
        (loanFilter == null || m.loan_symbol === loanFilter) &&
        (oracleFilter == null ||
          (providersByMarket.get(m.market_id) ?? []).includes(oracleFilter)) &&
        (q === "" || m.market_id.toLowerCase().includes(q))
    );
  }, [markets, loanFilter, oracleFilter, providersByMarket, search]);
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

  // Oracle providers present, with per-provider market counts, biggest first.
  const oracleOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of markets) {
      for (const p of providersByMarket.get(m.market_id) ?? []) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([provider, count]) => ({ provider, count }));
  }, [markets, providersByMarket]);

  const sortedMarkets = useMemo(() => {
    if (!sortKey) {
      // Default (feed) order is supply-descending: still sink broken markets
      // to the bottom, keeping each group's relative order.
      return [
        ...filteredMarkets.filter((m) => !m.is_broken),
        ...filteredMarkets.filter((m) => m.is_broken),
      ];
    }
    const arr = [...filteredMarkets];
    arr.sort((a, b) => {
      // Broken markets always sink to the bottom (except when sorting by
      // status itself): a ratcheted market's phantom supply would otherwise
      // put it at the very top of the default supply-descending view.
      if (sortKey !== "status" && !!a.is_broken !== !!b.is_broken) {
        return a.is_broken ? 1 : -1;
      }
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

        {/* Chain + loan-token filters — searchable dropdowns (the pill rows
            stopped scaling once the archive hit 7 chains / 60+ loan tokens) */}
        {!isLoading && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-b border-border/40">
            <FilterSelect
              label="CHAIN"
              totalCount={allMarkets.length}
              options={MNEMON_CHAINS.map((c) => ({
                value: String(c.id),
                label: c.label,
                count: chainCounts.get(c.id) ?? 0,
              }))}
              value={chainId == null ? null : String(chainId)}
              onChange={(v) => onChainChange?.(v == null ? null : Number(v))}
            />
            {loanTokens.length > 1 && (
              <FilterSelect
                label="LOAN"
                totalCount={markets.length}
                options={loanTokens.map((t) => ({
                  value: t.symbol,
                  label: t.symbol,
                  count: t.count,
                }))}
                value={loanFilter}
                onChange={setLoanFilter}
              />
            )}
            {oracleOptions.length > 1 && (
              <FilterSelect
                label="ORACLE"
                totalCount={markets.length}
                options={oracleOptions.map((o) => ({
                  value: o.provider,
                  label: o.provider,
                  count: o.count,
                }))}
                value={oracleFilter}
                onChange={setOracleFilter}
              />
            )}
            <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
              <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
                SEARCH
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="MARKET ID"
                className="flex-1 max-w-xs bg-transparent border border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-text placeholder:text-text-dim/50 focus:outline-none focus:border-gold"
              />
            </div>
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
                                    title={`LLTV ${fmtLltv(m.lltv)}`}
                                  >
                                    {fmtLltv(m.lltv)}
                                  </span>
                                )}
                                {!rowLoading && (
                                  <span className="text-[9px]">
                                    <CopyableId id={m.market_id} />
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
                              <StatusCell market={m} oracle={oracleFor(m)} />
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={COLS.length} className="p-0">
                                <MnemonMarketDrilldown
                                  market={m}
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
        MNEMON archive (seven chains) · snapshots every 10 min · APY uses the HEGEMON bot&apos;s
        AdaptiveCurveIRM math (fee assumed 0). Broken flags:{" "}
        <span className="text-danger">RATE_RATCHET</span> (runaway rate),{" "}
        <span className="text-danger">PINNED_UTIL</span> (stuck at full
        utilization), <span className="text-danger">DUST</span> (&lt; $1k
        supply). Badges: <span className="text-gold">CONC</span> (one lender ≥
        50% of supply), <span className="text-gold">DEPEG</span> (oracle ≥ 2%
        off the DefiLlama cross; suppressed for exchange-rate oracles where
        that deviation is structural), <span className="text-danger">ORACLE</span>{" "}
        (oracle contract broken or unverified). NET 24H is in loan-token units.
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
