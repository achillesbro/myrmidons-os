"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useMarketHealth, useUtilSpells } from "@/lib/mnemon/queries";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import {
  fmtPct,
  fmtUsd,
  fmtAge,
  ageMinutes,
  reasonLabel,
  pairLabel,
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

export function MnemonMarketsTab() {
  const { data, isLoading, isError } = useMarketHealth();
  const spellsQuery = useUtilSpells();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // null = the export's default order (healthy first, then by supply desc).
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Exclude idle markets (no collateral) — vault cash, not real lending markets.
  const markets = useMemo(() => (data?.markets ?? []).filter(isRealMarket), [data]);
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
          label="Broken"
          value={<GlitchTypeText loading={isLoading} value={String(stats.brokenCount)} mode="number" />}
          subValue={
            reasonSummary ? (
              <span className="text-text-dim font-mono">
                <GlitchTypeText loading={isLoading} value={reasonSummary} mode="text" />
              </span>
            ) : undefined
          }
          accent={isLoading ? "default" : stats.brokenCount ? "danger" : "success"}
          cornerIndicator={isLoading ? "default" : stats.brokenCount ? "danger" : "success"}
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
            <GlitchTypeText loading={isLoading} value="HyperEVM Morpho Markets" mode="text" />
          </h3>
        </div>

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
