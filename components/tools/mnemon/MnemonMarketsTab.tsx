"use client";

import { Fragment, useMemo, useState } from "react";
import { useMarketHealth, useUtilSpells } from "@/lib/mnemon/queries";
import type { MarketHealthEntry, UtilSpell } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { TerminalScrollLoader } from "@/components/ui/terminal-scroll-loader";
import {
  fmtPct,
  fmtUsd,
  fmtAge,
  fmtDurationMin,
  ageMinutes,
  reasonLabel,
  pairLabel,
  STALE_MINUTES,
} from "@/lib/mnemon/format";
import { MarketSparkline } from "./MarketSparkline";
import { cn } from "@/lib/utils";

const COLS = [
  { key: "market", label: "MARKET", align: "left" as const },
  { key: "util", label: "UTIL", align: "right" as const },
  { key: "supply_apy", label: "SUPPLY APY", align: "right" as const },
  { key: "apy_target", label: "APY@TARGET", align: "right" as const },
  { key: "supply", label: "SUPPLY", align: "right" as const },
  { key: "available", label: "AVAILABLE", align: "right" as const },
  { key: "status", label: "STATUS", align: "right" as const },
];

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
        <span className="text-[9px] font-mono uppercase tracking-wider text-gold border border-gold/50 px-1">
          OPEN
        </span>
      ) : (
        <span className="text-[9px] font-mono uppercase tracking-wider text-text-dim/50">
          CLOSED
        </span>
      )}
    </div>
  );
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4 bg-panel/40 border-t border-border">
      <div className="lg:col-span-2 min-h-[12rem] h-48">
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
          SUPPLY_APY / UTILIZATION // 7D
        </div>
        <div className="h-[calc(100%-1.25rem)]">
          <MarketSparkline history={market.history} />
        </div>
      </div>
      <div>
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
          UTILIZATION_SPELLS // 30D
        </div>
        {marketSpells.length > 0 ? (
          <div className="space-y-0.5">
            {marketSpells.slice(0, 8).map((s, i) => (
              <SpellRow key={`${s.threshold}-${s.start_ts}-${i}`} spell={s} />
            ))}
          </div>
        ) : (
          <div className="text-[10px] font-mono text-text-dim/50">
            NO_SPELLS (never held u ≥ 92%)
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-border/20 space-y-1">
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-text-dim">BORROW_APY</span>
            <span className="text-text">{fmtPct(market.borrow_apy)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-text-dim">LLTV</span>
            <span className="text-text">{fmtPct(market.lltv, 0)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-mono">
            <span className="text-text-dim">MARKET_ID</span>
            <span className="text-text-dim/70">
              {market.market_id.slice(0, 10)}…{market.market_id.slice(-6)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MnemonMarketsTab() {
  const { data, isLoading, isError } = useMarketHealth();
  const spellsQuery = useUtilSpells();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const markets = useMemo(() => data?.markets ?? [], [data]);
  const broken = useMemo(() => markets.filter((m) => m.is_broken), [markets]);
  const min = ageMinutes(data?.generated_at);
  const stale = min != null && min > STALE_MINUTES;

  return (
    <div className="flex flex-col">
      {/* KPI header strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-l border-t border-border bg-bg-base content-start">
        <GridKpi
          label="Markets Tracked"
          value={<GlitchTypeText loading={isLoading} value={String(markets.length)} mode="number" />}
        />
        <GridKpi
          label="Broken"
          value={<GlitchTypeText loading={isLoading} value={String(broken.length)} mode="number" />}
          accent={broken.length ? "danger" : "success"}
          cornerIndicator={broken.length ? "danger" : "success"}
        />
        <GridKpi
          label="Healthy"
          value={
            <GlitchTypeText
              loading={isLoading}
              value={String(markets.length - broken.length)}
              mode="number"
            />
          }
          accent="success"
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
            HyperEVM Morpho Markets
          </h3>
        </div>

        {isLoading ? (
          <TerminalScrollLoader variant="chart" className="h-64 w-full border-0" seed="mnemon-markets" />
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
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className={cn(
                        "px-3 py-2 font-mono font-normal",
                        c.align === "right" ? "text-right" : "text-left"
                      )}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {markets.map((m) => {
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
