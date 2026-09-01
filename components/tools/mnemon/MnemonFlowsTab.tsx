"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketFlows, useMarketHealth } from "@/lib/mnemon/queries";
import type { Liquidation, WhaleFlow } from "@/lib/mnemon/schemas";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import {
  chainOf,
  chainTag,
  explorerTxUrl,
  flowsSyncedFor,
  fmtAge,
  fmtAmount,
  fmtEventTime,
  fmtPct,
  fmtUsd,
  pairLabel,
  MNEMON_CHAINS,
} from "@/lib/mnemon/format";
import { CopyableAddr } from "./CopyableAddr";
import { FilterSelect } from "./FilterSelect";
import { borrowUsdOf, isSignificantLiquidation } from "@/lib/mnemon/aggregate";
import { cn } from "@/lib/utils";

// MNEMON flows view: the whale-flow feed (single events ≥ 5% of a market's
// supply — the export's per-event feed carries only these, trailing 14d;
// the FE windows it to the last 24h) and the liquidation feed (trailing 30d).
// Everything is anchored to the archive's newest INGESTED event
// (data_through), so the whole tab is gated on `synced` — during the initial
// history backfill it shows a syncing state instead of presenting the past as
// "the last 24 hours".

const PAGE_SIZE = 25;

const FLOW_TONE: Record<string, string> = {
  Supply: "text-success",
  Borrow: "text-gold",
  Withdraw: "text-danger",
  Repay: "text-text-dim",
  Liquidation: "text-danger",
};

// Short explorer link for an event's tx hash, routed to the row's chain
// (hyperevmscan / RH Blockscout). "—" when the row carries no hash.
function TxLink({ txHash, chainId }: { txHash: string | null; chainId: number }) {
  const url = txHash ? explorerTxUrl(chainId, txHash) : null;
  if (!txHash || !url) return <span className="text-text-dim/40">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-text-dim/70 hover:text-gold transition-colors"
      title={`View ${txHash} on the explorer`}
    >
      {txHash.slice(2, 6)}… ↗
    </a>
  );
}

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

// Chain chip in the MARKET cell — same convention as the markets table
// (shown only on the ALL view; a single-chain view is unambiguous).
function ChainChip({ id }: { id: number }) {
  return (
    <span
      className="ml-1.5 text-[8px] font-mono uppercase tracking-wider px-1 border border-border/60 text-text-dim/70"
      title={`chain_id ${id}`}
    >
      {chainTag(id)}
    </span>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  // Direct page entry (feeds can run 30+ pages): commit on Enter or blur,
  // clamped to [1, pages]; junk input falls back to the current page.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft != null) {
      const n = parseInt(draft, 10);
      if (Number.isFinite(n)) onPage(Math.min(pages - 1, Math.max(0, n - 1)));
      setDraft(null);
    }
  };
  if (pages <= 1) return null;
  const btn =
    "px-2 py-0.5 border border-border text-text-dim hover:text-white hover:border-text-dim transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer";
  return (
    <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border/40 font-mono text-[10px] uppercase tracking-wider">
      <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)} className={btn}>
        ‹ Prev
      </button>
      <span className="text-text-dim tabular-nums flex items-center gap-1">
        <input
          value={draft ?? String(page + 1)}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          inputMode="numeric"
          aria-label="Page number"
          className="w-10 bg-transparent border border-border px-1 py-0.5 text-center text-text tabular-nums focus:outline-none focus:border-gold"
        />
        / {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages - 1}
        onClick={() => onPage(page + 1)}
        className={btn}
      >
        Next ›
      </button>
    </div>
  );
}

function WhaleRow({ w, pair, showChain }: { w: WhaleFlow; pair: string; showChain: boolean }) {
  return (
    <tr className="border-b border-border/40 font-mono hover:bg-white/5">
      <td className="px-3 py-2 text-xs text-text-dim whitespace-nowrap">{fmtEventTime(w.ts)}</td>
      <td className="px-3 py-2 text-xs text-text whitespace-nowrap">
        {pair}
        {showChain && <ChainChip id={chainOf(w)} />}
      </td>
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
      <td className="px-3 py-2 text-right text-xs font-mono">
        <TxLink txHash={w.tx_hash} chainId={chainOf(w)} />
      </td>
    </tr>
  );
}

function LiquidationRow({
  l,
  pair,
  showChain,
}: {
  l: Liquidation;
  pair: string;
  showChain: boolean;
}) {
  return (
    <tr className="border-b border-border/40 font-mono hover:bg-white/5">
      <td className="px-3 py-2 text-xs text-text-dim whitespace-nowrap">{fmtEventTime(l.ts)}</td>
      <td className="px-3 py-2 text-xs text-text whitespace-nowrap">
        {pair}
        {showChain && <ChainChip id={chainOf(l)} />}
      </td>
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
      <td className="px-3 py-2 text-right text-xs font-mono">
        <TxLink txHash={l.tx_hash} chainId={chainOf(l)} />
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
  // Free-text search over loan / collateral / tx hash / account / market id,
  // plus a loan dropdown; both apply to BOTH feeds. Pages reset on any lens.
  const [search, setSearch] = useState("");
  const [loanFilter, setLoanFilter] = useState<string | null>(null);
  const [whalePage, setWhalePage] = useState(0);
  const [liqPage, setLiqPage] = useState(0);
  useEffect(() => {
    setWhalePage(0);
    setLiqPage(0);
  }, [chainId, loanFilter, search]);
  useEffect(() => setLoanFilter(null), [chainId]);
  const onChain = <T extends { chain_id?: number | null }>(rows: T[] | undefined): T[] =>
    (rows ?? []).filter((r) => chainId == null || chainOf(r) === chainId);
  const flowMarkets = useMemo(() => onChain(data?.markets), [data, chainId]); // eslint-disable-line react-hooks/exhaustive-deps
  // market_id -> current borrow USD, for the dust filter.
  const borrowById = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const m of healthQuery.data?.markets ?? []) {
      map.set(m.market_id, borrowUsdOf(m));
    }
    return map;
  }, [healthQuery.data]);

  // Only liquidations that repaid > 5% of the market's borrow (see
  // isSignificantLiquidation for the rule and its edge cases).
  const liquidations = useMemo(
    () =>
      onChain(data?.liquidations).filter((l) =>
        isSignificantLiquidation(l, borrowById.get(l.market_id))
      ),
    [data, chainId, borrowById] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // market_id -> "kHYPE / USDT0" pair label, joined from market_health.
  const pairById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of healthQuery.data?.markets ?? []) {
      map.set(m.market_id, pairLabel(m.collateral_symbol, m.loan_symbol));
    }
    return map;
  }, [healthQuery.data]);
  const pair = (id: string) => pairById.get(id) ?? `${id.slice(0, 10)}…`;

  // Sync is per chain (schema_version 6): with one chain selected, gate on
  // that chain's cursor; on ALL, gate on the global flag.
  const synced =
    chainId == null ? data?.synced === true : flowsSyncedFor(data, chainId) === true;
  const dataThrough =
    (chainId != null ? data?.chains?.[String(chainId)]?.data_through : null) ??
    data?.data_through;

  // Whale feed window: the last 24h before the newest ingested event. The
  // export's per-event feed only carries whale events (single event ≥ 5% of
  // a market's supply) — surfacing every raw flow needs an export change.
  const cutoff = dataThrough ? Date.parse(dataThrough) - 24 * 3_600_000 : null;
  const whaleFlows = useMemo(
    () =>
      onChain(data?.whale_flows).filter(
        (w) => cutoff == null || (w.ts != null && Date.parse(w.ts) >= cutoff)
      ),
    [data, chainId, cutoff] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Search + loan lens over both feeds (case-insensitive substring).
  const q = search.trim().toLowerCase();
  const matches = (...fields: (string | null | undefined)[]) =>
    q === "" || fields.some((f) => f != null && f.toLowerCase().includes(q));
  const whaleFiltered = whaleFlows.filter(
    (w) =>
      (loanFilter == null || w.loan_symbol === loanFilter) &&
      matches(w.loan_symbol, pair(w.market_id), w.market_id, w.tx_hash, w.account)
  );
  const liqFiltered = liquidations.filter(
    (l) =>
      (loanFilter == null || l.loan_symbol === loanFilter) &&
      matches(l.loan_symbol, l.collateral_symbol, pair(l.market_id), l.market_id, l.tx_hash, l.borrower, l.liquidator)
  );
  // Loan tokens present across both feeds (event counts), most events first.
  const loanTokens = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of [...whaleFlows, ...liquidations]) {
      const s = e.loan_symbol ?? "?";
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([symbol, count]) => ({ symbol, count }));
  }, [whaleFlows, liquidations]);
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
                  dataThrough
                    ? `THROUGH ${dataThrough.slice(0, 16).replace("T", " ")}Z`
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
          label="Whale Flows 24H"
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
          subValue={
            synced ? (
              <span className="text-text-dim font-mono">
                {liquidations.length} SIGNIFICANT ({">"}5% OF BORROW)
              </span>
            ) : undefined
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

      {/* Chain + loan filters and event search — same dropdowns as the
          markets tab; the search matches loan, collateral, tx hash, account */}
      {!isLoading && data && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 border-l border-t border-b border-border/40 bg-bg-base">
          <FilterSelect
            label="CHAIN"
            totalCount={(data.markets ?? []).length}
            options={MNEMON_CHAINS.map((c) => ({
              value: String(c.id),
              label: c.label,
              count: (data.markets ?? []).filter((m) => chainOf(m) === c.id).length,
            }))}
            value={chainId == null ? null : String(chainId)}
            onChange={(v) => onChainChange?.(v == null ? null : Number(v))}
          />
          {loanTokens.length > 1 && (
            <FilterSelect
              label="LOAN"
              totalCount={whaleFlows.length + liquidations.length}
              options={loanTokens.map((t) => ({
                value: t.symbol,
                label: t.symbol,
                count: t.count,
              }))}
              value={loanFilter}
              onChange={setLoanFilter}
            />
          )}
          <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              SEARCH
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="LOAN / COLLAT / TX / ACCOUNT / MARKET ID"
              className="flex-1 max-w-xs bg-transparent border border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-text placeholder:text-text-dim/50 focus:outline-none focus:border-gold"
            />
          </div>
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
              {dataThrough ? (
                <>
                  {" "}
                  — currently through{" "}
                  <span className="text-text">{dataThrough.slice(0, 10)}</span>
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
            <SectionHeader title="Whale Flows" sub="LAST 24H" />
            {isLoading ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                <GlitchTypeText loading value="" mode="text" />
              </div>
            ) : whaleFlows.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                NO_WHALE_FLOWS_24H (no single event ≥ 5% of a market&apos;s supply)
              </div>
            ) : whaleFiltered.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                NO_MATCHES
              </div>
            ) : (
              <>
                <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[780px] text-left border-collapse">
                    <thead>
                      <tr className="bg-panel text-[9px] uppercase text-text-dim border-b border-border tracking-widest font-mono">
                        <th className="px-3 py-2 font-normal">WHEN</th>
                        <th className="px-3 py-2 font-normal">MARKET</th>
                        <th className="px-3 py-2 font-normal">TYPE</th>
                        <th className="px-3 py-2 font-normal text-right">FLOW</th>
                        <th className="px-3 py-2 font-normal text-right">% OF SUPPLY</th>
                        <th className="px-3 py-2 font-normal text-right">ACCOUNT</th>
                        <th className="px-3 py-2 font-normal text-right">TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {whaleFiltered
                        .slice(whalePage * PAGE_SIZE, (whalePage + 1) * PAGE_SIZE)
                        .map((w, i) => (
                          <WhaleRow
                            key={`${w.tx_hash}-${i}`}
                            w={w}
                            pair={pair(w.market_id)}
                            showChain={chainId == null}
                          />
                        ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={whalePage} total={whaleFiltered.length} onPage={setWhalePage} />
              </>
            )}
          </div>

          {/* Liquidation feed */}
          <div className="border-l border-t border-border bg-bg-base">
            <SectionHeader title="Liquidations" sub="TRAILING 30D · REPAID > 5% OF BORROW" />
            {isLoading ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                <GlitchTypeText loading value="" mode="text" />
              </div>
            ) : liquidations.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                NO_LIQUIDATIONS_30D (dust — repaid ≤ 5% of market borrow — filtered)
              </div>
            ) : liqFiltered.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-text-dim/60 font-mono text-xs">
                NO_MATCHES
              </div>
            ) : (
              <>
                <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                  <table className="w-full min-w-[820px] text-left border-collapse">
                    <thead>
                      <tr className="bg-panel text-[9px] uppercase text-text-dim border-b border-border tracking-widest font-mono">
                        <th className="px-3 py-2 font-normal">WHEN</th>
                        <th className="px-3 py-2 font-normal">MARKET</th>
                        <th className="px-3 py-2 font-normal text-right">REPAID</th>
                        <th className="px-3 py-2 font-normal text-right">SEIZED</th>
                        <th className="px-3 py-2 font-normal text-right">BAD DEBT</th>
                        <th className="px-3 py-2 font-normal text-right">BORROWER</th>
                        <th className="px-3 py-2 font-normal text-right">LIQUIDATOR</th>
                        <th className="px-3 py-2 font-normal text-right">TX</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liqFiltered
                        .slice(liqPage * PAGE_SIZE, (liqPage + 1) * PAGE_SIZE)
                        .map((l, i) => (
                          <LiquidationRow
                            key={`${l.tx_hash}-${i}`}
                            l={l}
                            pair={pair(l.market_id)}
                            showChain={chainId == null}
                          />
                        ))}
                    </tbody>
                  </table>
                </div>
                <Pager page={liqPage} total={liqFiltered.length} onPage={setLiqPage} />
              </>
            )}
          </div>
        </>
      )}

      {/* Footnote */}
      <div className="px-3 py-3 text-[10px] font-mono text-text-dim/50 leading-relaxed border-l border-border bg-bg-base">
        Every Morpho Blue market event on the seven tracked chains, ingested
        every 15 min. Flow
        amounts are loan-token units; liquidation sizes are USD at the nearest
        archived price. Windows anchor to the newest ingested event
        {data?.generated_at ? ` · snapshot ${fmtAge(data.generated_at)} old` : ""}. Not
        investment advice.
      </div>
    </div>
  );
}
