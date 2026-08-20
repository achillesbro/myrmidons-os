"use client";

import { useMemo } from "react";
import { useMarketFlows, useMarketHealth } from "@/lib/mnemon/queries";
import type { Liquidation, WhaleFlow } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import {
  chainOf,
  fmtAge,
  fmtAmount,
  fmtEventTime,
  fmtPct,
  fmtUsd,
  pairLabel,
  MNEMON_CHAINS,
} from "@/lib/mnemon/format";
import { CopyableAddr } from "./CopyableAddr";
import { FilterPill } from "./MnemonMarketsTab";
import { cn } from "@/lib/utils";

// MNEMON flows view: the whale-flow feed (single events ≥ 5% of a market's
// supply, trailing 14d) and the liquidation feed (trailing 30d). Everything is
// anchored to the archive's newest INGESTED event (data_through), so the whole
// tab is gated on `synced` — during the initial history backfill it shows a
// syncing state instead of presenting the past as "the last 24 hours".

const FLOW_TONE: Record<string, string> = {
  Supply: "text-success",
  Borrow: "text-gold",
  Withdraw: "text-danger",
  Repay: "text-text-dim",
  Liquidation: "text-danger",
};

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="h-10 px-3 border-b border-border bg-panel flex items-center justify-between">
      <h3 className="font-mono font-bold text-white text-xs uppercase tracking-widest">{title}</h3>
      {sub && (
        <span className="text-[9px] font-mono uppercase tracking-widest text-text-dim/60">
          {sub}
        </span>
      )}
    </div>
  );
}

function WhaleRow({ w, pair }: { w: WhaleFlow; pair: string }) {
  return (
    <tr className="border-b border-border/40 font-mono hover:bg-white/5">
      <td className="px-3 py-2 text-xs text-text-dim whitespace-nowrap">{fmtEventTime(w.ts)}</td>
      <td className="px-3 py-2 text-xs text-text">{pair}</td>
      <td className={cn("px-3 py-2 text-xs uppercase", FLOW_TONE[w.type ?? ""] ?? "text-text")}>
        {w.type ?? "—"}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right text-xs",
          (w.flow ?? 0) > 0 ? "text-success" : "text-danger"
        )}
      >
        {fmtAmount(w.flow, w.loan_symbol, { signed: true })}
      </td>
      <td className="px-3 py-2 text-right text-xs text-gold">
        {fmtPct(w.pct_of_supply, 1)}
      </td>
      <td className="px-3 py-2 text-right text-xs">
        <CopyableAddr addr={w.account} />
      </td>
    </tr>
  );
}

function LiquidationRow({ l, pair }: { l: Liquidation; pair: string }) {
  return (
    <tr className="border-b border-border/40 font-mono hover:bg-white/5">
      <td className="px-3 py-2 text-xs text-text-dim whitespace-nowrap">{fmtEventTime(l.ts)}</td>
      <td className="px-3 py-2 text-xs text-text">{pair}</td>
      <td className="px-3 py-2 text-right text-xs text-danger">{fmtUsd(l.repaid_usd)}</td>
      <td className="px-3 py-2 text-right text-xs text-text">{fmtUsd(l.seized_usd)}</td>
      <td
        className={cn(
          "px-3 py-2 text-right text-xs",
          (l.bad_debt_assets ?? 0) > 0 ? "text-danger" : "text-text-dim/50"
        )}
        title="Bad debt socialized to lenders (loan-token units)"
      >
        {(l.bad_debt_assets ?? 0) > 0 ? fmtAmount(l.bad_debt_assets, l.loan_symbol) : "0"}
      </td>
      <td className="px-3 py-2 text-right text-xs">
        <CopyableAddr addr={l.borrower} />
      </td>
      <td className="px-3 py-2 text-right text-xs">
        <CopyableAddr addr={l.liquidator} />
      </td>
    </tr>
  );
}

// chainId: filter feeds and KPIs to one chain; null = all chains. The chain
// pill row mirrors the markets tab; the state lives in the page.
export function MnemonFlowsTab({
  chainId = null,
  onChainChange,
}: {
  chainId?: number | null;
  onChainChange?: (id: number | null) => void;
}) {
  const { data, isLoading, isError } = useMarketFlows();
  const healthQuery = useMarketHealth();
  const onChain = <T extends { chain_id?: number | null }>(rows: T[] | undefined): T[] =>
    (rows ?? []).filter((r) => chainId == null || chainOf(r) === chainId);
  const flowMarkets = useMemo(() => onChain(data?.markets), [data, chainId]); // eslint-disable-line react-hooks/exhaustive-deps
  const whaleFlows = useMemo(() => onChain(data?.whale_flows), [data, chainId]); // eslint-disable-line react-hooks/exhaustive-deps
  const liquidations = useMemo(() => onChain(data?.liquidations), [data, chainId]); // eslint-disable-line react-hooks/exhaustive-deps

  // market_id -> "kHYPE / USDT0" pair label, joined from market_health.
  const pairById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of healthQuery.data?.markets ?? []) {
      map.set(m.market_id, pairLabel(m.collateral_symbol, m.loan_symbol));
    }
    return map;
  }, [healthQuery.data]);
  const pair = (id: string) => pairById.get(id) ?? `${id.slice(0, 10)}…`;

  const synced = data?.synced === true;
  const totalLiqs = useMemo(
    () => flowMarkets.reduce((acc, m) => acc + (m.n_liquidations_30d ?? 0), 0),
    [flowMarkets]
  );
  const biggestMover = useMemo(() => {
    let best: { id: string; v: number; sym: string | null } | null = null;
    for (const m of flowMarkets) {
      const v = m.net_supply_24h ?? 0;
      if (best == null || Math.abs(v) > Math.abs(best.v)) {
        best = { id: m.market_id, v, sym: m.loan_symbol };
      }
    }
    return best && best.v !== 0 ? best : null;
  }, [flowMarkets]);

  if (isError) {
    return (
      <div className="h-40 flex flex-col items-center justify-center gap-2 border-l border-t border-border bg-bg-base">
        <div className="text-danger font-mono text-sm uppercase tracking-widest">
          DATA_UNAVAILABLE
        </div>
        <div className="text-text-dim/60 font-mono text-xs">
          Could not load the MNEMON flow snapshot
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border-l border-t border-border bg-bg-base content-start">
        <GridKpi
          label="Flow Data"
          value={
            <GlitchTypeText
              loading={isLoading}
              value={data ? (synced ? "SYNCED" : "SYNCING") : "—"}
              mode="text"
            />
          }
          subValue={
            <span className="text-text-dim font-mono">
              <GlitchTypeText
                loading={isLoading}
                value={
                  data?.data_through
                    ? `THROUGH ${data.data_through.slice(0, 16).replace("T", " ")}Z`
                    : "NO_EVENTS_YET"
                }
                mode="text"
              />
            </span>
          }
          accent={isLoading ? "default" : synced ? "success" : "gold"}
          cornerIndicator={isLoading ? "default" : synced ? "success" : "gold"}
        />
        <GridKpi
          label="Whale Flows 14D"
          value={
            <GlitchTypeText
              loading={isLoading}
              value={synced ? String(whaleFlows.length) : "—"}
              mode="text"
            />
          }
          subValue={<span className="text-text-dim font-mono">SINGLE EVENT ≥ 5% OF SUPPLY</span>}
        />
        <GridKpi
          label="Liquidations 30D"
          value={
            <GlitchTypeText
              loading={isLoading}
              value={synced ? String(totalLiqs) : "—"}
              mode="text"
            />
          }
          accent={!isLoading && synced && totalLiqs > 0 ? "gold" : "default"}
        />
        <GridKpi
          label="Biggest Mover 24H"
          value={
            <GlitchTypeText
              loading={isLoading || healthQuery.isLoading}
              value={
                synced && biggestMover
                  ? fmtAmount(biggestMover.v, biggestMover.sym, { signed: true })
                  : "—"
              }
              mode="text"
            />
          }
          subValue={
            synced && biggestMover ? (
              <span className="text-text-dim font-mono">{pair(biggestMover.id)}</span>
            ) : undefined
          }
        />
      </div>

      {/* Chain filter — same layout as the markets tab */}
      {!isLoading && data && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-l border-t border-b border-border/40 bg-bg-base">
          <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono mr-1">
            CHAIN
          </span>
          <FilterPill
            label="ALL"
            count={(data.markets ?? []).length}
            active={chainId === null}
            onClick={() => onChainChange?.(null)}
          />
          {MNEMON_CHAINS.map((c) => (
            <FilterPill
              key={c.id}
              label={c.label}
              count={(data.markets ?? []).filter((m) => chainOf(m) === c.id).length}
              active={chainId === c.id}
              onClick={() => onChainChange?.(c.id)}
            />
          ))}
        </div>
      )}

      {/* Syncing state replaces the feeds while the archive ingests history */}
      {!isLoading && data && !synced ? (
        <div className="border-l border-t border-border bg-bg-base">
          <div className="h-64 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-gold font-mono text-sm uppercase tracking-widest animate-pulse">
              FLOW_HISTORY_SYNCING
            </div>
            <div className="text-text-dim/70 font-mono text-xs leading-relaxed max-w-md">
              MNEMON is ingesting this chain&apos;s full Morpho event history
              {data.data_through ? (
                <>
                  {" "}
                  — currently through{" "}
                  <span className="text-text">{data.data_through.slice(0, 10)}</span>
                </>
              ) : null}
              . Flow windows, whale flows and liquidations activate once the
              cursor reaches the present.
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Whale feed */}
          <div className="border-l border-t border-border bg-bg-base">
            <SectionHeader title="Whale Flows" sub="TRAILING 14D" />
            {isLoading ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                <GlitchTypeText loading value="" mode="text" />
              </div>
            ) : whaleFlows.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                NO_WHALE_FLOWS (no single event ≥ 5% of a market&apos;s supply)
              </div>
            ) : (
              <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[720px] text-left border-collapse">
                  <thead>
                    <tr className="bg-panel text-[9px] uppercase text-text-dim border-b border-border tracking-widest font-mono">
                      <th className="px-3 py-2 font-normal">WHEN</th>
                      <th className="px-3 py-2 font-normal">MARKET</th>
                      <th className="px-3 py-2 font-normal">TYPE</th>
                      <th className="px-3 py-2 font-normal text-right">FLOW</th>
                      <th className="px-3 py-2 font-normal text-right">% OF SUPPLY</th>
                      <th className="px-3 py-2 font-normal text-right">ACCOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {whaleFlows.slice(0, 40).map((w, i) => (
                      <WhaleRow key={`${w.tx_hash}-${i}`} w={w} pair={pair(w.market_id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Liquidation feed */}
          <div className="border-l border-t border-border bg-bg-base">
            <SectionHeader title="Liquidations" sub="TRAILING 30D" />
            {isLoading ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                <GlitchTypeText loading value="" mode="text" />
              </div>
            ) : liquidations.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                NO_LIQUIDATIONS_30D
              </div>
            ) : (
              <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                <table className="w-full min-w-[760px] text-left border-collapse">
                  <thead>
                    <tr className="bg-panel text-[9px] uppercase text-text-dim border-b border-border tracking-widest font-mono">
                      <th className="px-3 py-2 font-normal">WHEN</th>
                      <th className="px-3 py-2 font-normal">MARKET</th>
                      <th className="px-3 py-2 font-normal text-right">REPAID</th>
                      <th className="px-3 py-2 font-normal text-right">SEIZED</th>
                      <th className="px-3 py-2 font-normal text-right">BAD DEBT</th>
                      <th className="px-3 py-2 font-normal text-right">BORROWER</th>
                      <th className="px-3 py-2 font-normal text-right">LIQUIDATOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidations.slice(0, 40).map((l, i) => (
                      <LiquidationRow key={`${l.tx_hash}-${i}`} l={l} pair={pair(l.market_id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footnote */}
      <div className="px-3 py-3 text-[10px] font-mono text-text-dim/50 leading-relaxed border-l border-border bg-bg-base">
        Every Morpho Blue market event on the tracked chains (HyperEVM +
        Robinhood Chain), ingested every 15 min. Flow
        amounts are loan-token units; liquidation sizes are USD at the nearest
        archived price. Windows anchor to the newest ingested event
        {data?.generated_at ? ` · snapshot ${fmtAge(data.generated_at)} old` : ""}. Not
        investment advice.
      </div>
    </div>
  );
}
