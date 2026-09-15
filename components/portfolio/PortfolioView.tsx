"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { isAddress, type Address } from "viem";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { MnemonMarketDrilldown } from "@/components/tools/mnemon/MnemonMarketDrilldown";
import { useDepegSpells, useMarketFlows, useMarketHealth } from "@/lib/mnemon/queries";
import type { DepegSpell, FlowsMarketEntry, Liquidation } from "@/lib/mnemon/schemas";
import { computeMarketStats, isRealMarket } from "@/lib/mnemon/aggregate";
import { chainTag, flowsSyncedFor, fmtLltv, fmtPct, fmtPrice, fmtRatio, fmtUsd } from "@/lib/mnemon/format";
import { useVaultApy } from "@/lib/morpho/queries";
import { pickKpis } from "@/lib/morpho/view";
import { formatAmount } from "@/lib/web3/format";
import { PORTFOLIO_CHAINS, PORTFOLIO_VAULTS, usePortfolio, type MarketPosition } from "@/lib/web3/portfolio";
import { HEGEMON_V2_VAULT_CHAIN_ID } from "@/lib/constants/vaults";
import { cn, formatNumberWithCommas } from "@/lib/utils";

// One wallet, every position: the three MYRMIDONS vaults and each Morpho Blue
// market the wallet supplies to or borrows from on the MNEMON-indexed chains.
// Cheap insights only — every column is a join of the on-chain position with
// the MNEMON snapshot the analyser already loads: YIELD_GAP (best investable
// market for the same loan token), EXIT (does today's liquidity cover the
// supply), health / liquidation price on borrows, MNEMON flags inline.
// Lending and borrow rows expand into the analyser's drill-down WITH the
// action panel, so a position can be adjusted here. No history, no P&L.

const th = "px-3 py-2 font-mono font-normal text-[9px] uppercase tracking-widest";
const td = "px-3 py-2 text-xs font-mono";

// One column grid for all three tables (fixed layout): a wide name column,
// then seven equal numeric tracks, so figures sit in the same vertical bands
// from VAULTS down to BORROWS. Tables with fewer columns fill from the right.
const COL_WIDTHS = ["25%", "10.5%", "10.5%", "10.5%", "10.5%", "10.5%", "10.5%", "12%"];
function ColGroup() {
  return (
    <colgroup>
      {COL_WIDTHS.map((w, i) => (
        <col key={i} style={{ width: w }} />
      ))}
    </colgroup>
  );
}
const tableCls = "w-full table-fixed min-w-[64rem]";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="border-b border-border">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-bg-base">
        <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">{title}</span>
        {hint && <span className="text-[9px] font-mono text-text-dim/60">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="px-3 py-6 text-center text-[10px] font-mono text-text-dim/50">{text}</div>;
}

function amt(v: bigint, decimals: number, sym: string, digits = 2) {
  return `${formatNumberWithCommas(Number(formatAmount(v, decimals, decimals)), digits, true)} ${sym}`;
}

const pair = (p: MarketPosition) =>
  `${p.market.collateral_symbol}/${p.market.loan_symbol}@${p.market.lltv != null ? Math.round(p.market.lltv * 100) : "?"}`;

export function PortfolioView() {
  const { address: wallet, isConnected: walletConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  // The wallet in view: `?address=0x…` when set (any wallet, read-only —
  // positions are public; drill-down actions still run as the CONNECTED
  // wallet), else the connected one. The WALLET bar below edits it.
  const router = useRouter();
  const viewAs = useSearchParams().get("address");
  const address = (viewAs && isAddress(viewAs) ? viewAs : wallet) as Address | undefined;
  const isConnected = walletConnected || Boolean(address);
  const [draft, setDraft] = useState(viewAs ?? wallet ?? "");
  const [draftError, setDraftError] = useState(false);
  // Keep the bar showing whatever is in view when the wallet or URL changes
  // underneath it (connect, disconnect, MINE).
  useEffect(() => {
    setDraft(viewAs ?? wallet ?? "");
    setDraftError(false);
  }, [viewAs, wallet]);
  const view = (target: string) => {
    const t = target.trim();
    if (!isAddress(t)) {
      setDraftError(true);
      return;
    }
    router.replace(t.toLowerCase() === wallet?.toLowerCase() ? "/portfolio" : `/portfolio?address=${t}`);
  };
  const walletBar = (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-base">
      <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono shrink-0">WALLET</span>
      <input
        type="text"
        spellCheck={false}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setDraftError(false);
        }}
        onKeyDown={(e) => e.key === "Enter" && view(draft)}
        placeholder="0x… any wallet — positions are public"
        className={cn(
          "flex-1 min-w-0 h-7 px-2 bg-bg-base border text-[11px] font-mono text-text rounded-none focus:outline-none focus:border-gold placeholder:text-text-dim/40",
          draftError ? "border-danger" : "border-border"
        )}
      />
      <button
        type="button"
        onClick={() => view(draft)}
        className="h-7 px-3 border border-border text-[9px] font-mono uppercase tracking-widest text-text-dim hover:text-gold hover:border-gold transition-colors"
      >
        VIEW
      </button>
      {wallet && address?.toLowerCase() !== wallet.toLowerCase() && (
        <button
          type="button"
          onClick={() => router.replace("/portfolio")}
          title="Back to the connected wallet"
          className="h-7 px-3 border border-gold/60 text-[9px] font-mono uppercase tracking-widest text-gold hover:bg-gold/10 transition-colors"
        >
          MINE
        </button>
      )}
      <span className="text-[9px] font-mono text-text-dim/60 shrink-0 hidden md:inline">
        {draftError
          ? <span className="text-danger">INVALID_ADDRESS</span>
          : address && wallet && address.toLowerCase() === wallet.toLowerCase()
            ? "YOUR WALLET"
            : address
              ? "READ-ONLY — actions run as your connected wallet"
              : ""}
      </span>
    </div>
  );
  const health = useMarketHealth();
  // Flows / depeg / liquidations feed the drill-down's FLOWS tile and chart
  // markers, exactly as the analyser table passes them.
  const flowsQuery = useMarketFlows();
  const depegQuery = useDepegSpells();
  const flowByMarket = new Map((flowsQuery.data?.markets ?? []).map((f) => [f.market_id, f]));
  const drill = (p: MarketPosition): DrillFeed => ({
    flow: flowByMarket.get(p.market.market_id) ?? null,
    flowsSynced: flowsSyncedFor(flowsQuery.data, p.chainId) ?? false,
    depegSpells: depegQuery.data?.spells ?? [],
    liquidations: flowsQuery.data?.liquidations ?? [],
  });
  const q = usePortfolio(address, health.data?.markets);
  // Vault APYs: fixed set, one hook each (the vault index does the same).
  const apys = [
    useVaultApy(PORTFOLIO_VAULTS[0].address, HEGEMON_V2_VAULT_CHAIN_ID, true),
    useVaultApy(PORTFOLIO_VAULTS[1].address, HEGEMON_V2_VAULT_CHAIN_ID, true),
    useVaultApy(PORTFOLIO_VAULTS[2].address, HEGEMON_V2_VAULT_CHAIN_ID, true),
  ];
  const vaultApy = (address: string): number | null => {
    const i = PORTFOLIO_VAULTS.findIndex((v) => v.address.toLowerCase() === address.toLowerCase());
    const raw = apys[i]?.data?.vaultByAddress?.state?.netApy;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  const [open, setOpen] = useState<string | null>(null);

  const realMarkets = (health.data?.markets ?? []).filter(isRealMarket);
  const stats = computeMarketStats(realMarkets);
  const data = q.data;
  const lends = (data?.markets ?? []).filter((p) => p.supplied > 0n);
  const borrows = (data?.markets ?? []).filter((p) => p.debt > 0n || p.collateralAmount > 0n);
  const vaults = data?.vaults ?? [];

  // ─── Totals (USD estimates). An unpriced leg is skipped, not fatal: the
  // total still sums the priced legs and says how many it left out.
  const priced = (xs: (number | null)[]) => xs.filter((x): x is number => x != null);
  const total = (xs: (number | null)[]) => (xs.length === 0 ? null : priced(xs).reduce((a, b) => a + b, 0));
  const supplyLegs = [...vaults.map((v) => v.assetsUsd), ...lends.map((p) => p.suppliedUsd)];
  const suppliedUsd = total(supplyLegs);
  const borrowedUsd = total(borrows.filter((p) => p.debt > 0n).map((p) => p.debtUsd));
  const collateralUsd = total(borrows.map((p) => p.collateralUsd));
  const netUsd = suppliedUsd != null ? suppliedUsd + (collateralUsd ?? 0) - (borrowedUsd ?? 0) : null;
  const unpriced = supplyLegs.length - priced(supplyLegs).length;
  // Blended APY, USD-WEIGHTED: Σ(position USD × its APY) for every supply leg
  // (vault net APY, market supply APY) minus Σ(debt USD × borrow APY), over
  // the USD of the legs that HAVE both a price and a rate — a vault whose APY
  // query is still loading is left out of numerator and denominator alike,
  // not counted as 0%.
  const ratedLegs = [
    ...vaults.map((v) => {
      const apy = vaultApy(v.address);
      return v.assetsUsd != null && apy != null ? { usd: v.assetsUsd, apy } : null;
    }),
    ...lends.map((p) => (p.suppliedUsd != null ? { usd: p.suppliedUsd, apy: p.marketData.supplyApy } : null)),
  ].filter((x): x is { usd: number; apy: number } => x != null);
  const ratedUsd = ratedLegs.reduce((a, l) => a + l.usd, 0);
  const yieldUsd = ratedLegs.reduce((a, l) => a + l.usd * l.apy, 0);
  const costUsd = total(borrows.filter((p) => p.debt > 0n).map((p) => (p.debtUsd != null ? p.debtUsd * p.marketData.borrowApy : null)));
  const blended = ratedUsd > 0 ? (yieldUsd - (costUsd ?? 0)) / ratedUsd : null;
  const approx = unpriced > 0 ? "≈ " : "";
  const worstHealth = borrows.reduce<number | null>((w, p) => (p.health != null && (w == null || p.health < w) ? p.health : w), null);
  const loading = isConnected && (q.isLoading || health.isLoading);
  const positions = vaults.length + lends.length + borrows.length;

  if (!isConnected) {
    return (
      <div>
        {walletBar}
        <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">PORTFOLIO // NO_OPERATOR</div>
        <p className="text-xs font-mono text-text/70 max-w-sm text-center leading-relaxed">
          Connect a wallet, or paste any address above, to read its vault shares and Morpho Blue positions across{" "}
          {PORTFOLIO_CHAINS.length} chains. Reads only — nothing is signed until you act on a row.
        </p>
        <button
          type="button"
          onClick={() => openConnectModal?.()}
          className="border border-gold bg-gold/80 hover:bg-gold text-text px-4 h-8 font-mono text-[10px] tracking-widest uppercase transition-colors"
        >
          CONNECT_WALLET
        </button>
        </div>
      </div>
    );
  }

  const kpi = (label: string, value: string, accent?: "gold" | "success" | "danger", sub?: string) => (
    <GridKpi
      label={label}
      accent={accent}
      value={<GlitchTypeText loading={loading} value={value} mode="text" />}
      subValue={sub && <span className="text-[10px] font-mono text-text-dim">{sub}</span>}
    />
  );

  return (
    <div>
      {walletBar}
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 border-l border-t border-border">
        {kpi("TOTAL_SUPPLIED", approx + fmtUsd(suppliedUsd), "gold", `${vaults.length} vault${vaults.length === 1 ? "" : "s"} · ${lends.length} market${lends.length === 1 ? "" : "s"}${unpriced ? ` · ${unpriced} unpriced` : ""}`)}
        {kpi("TOTAL_BORROWED", fmtUsd(borrowedUsd), undefined, `${borrows.filter((p) => p.debt > 0n).length} borrow${borrows.filter((p) => p.debt > 0n).length === 1 ? "" : "s"}`)}
        {kpi("NET", approx + fmtUsd(netUsd), undefined, "supplied + collateral − debt")}
        {kpi("BLENDED_APY", blended != null ? approx + fmtPct(blended) : "—", blended != null && blended < 0 ? "danger" : "success", "USD-weighted yield − borrow cost, on supplied")}
        {kpi(
          "WORST_HEALTH",
          worstHealth != null ? fmtRatio(worstHealth) : "—",
          worstHealth == null ? undefined : worstHealth < 1.05 ? "danger" : worstHealth < 1.2 ? "gold" : "success",
          worstHealth == null ? "no debt" : "lowest health factor"
        )}
      </div>

      {loading && positions === 0 && (
        <div className="px-3 py-3 text-[10px] font-mono text-text-dim border-b border-border">
          <GlitchTypeText loading value={`SCANNING ${PORTFOLIO_CHAINS.length} CHAINS…`} mode="text" />
        </div>
      )}
      {q.error && (
        <div className="px-3 py-2 text-[10px] font-mono text-danger border-b border-border">SCAN_FAILED  {(q.error as Error).message.slice(0, 120)}</div>
      )}
      {data && data.failedChains.length > 0 && (
        <div className="px-3 py-2 text-[10px] font-mono text-gold border-b border-border" title="The chain's public RPC did not answer within the per-chain cap — positions there are not shown, not zero">
          RPC_TIMEOUT  {data.failedChains.map(chainTag).join(" · ")} — positions on {data.failedChains.length === 1 ? "this chain" : "these chains"} not read this round
        </div>
      )}

      {/* VAULTS */}
      <Section title="VAULTS // MYRMIDONS" hint="ERC-4626 shares · HyperEVM">
        {vaults.length === 0 ? (
          <Empty text={loading ? "…" : "NO_VAULT_POSITIONS"} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <ColGroup />
              <thead>
                <tr className="bg-panel text-text-dim border-b border-border">
                  <th className={cn(th, "text-left")}>VAULT</th>
                  <th className={th} />
                  <th className={th} />
                  <th className={cn(th, "text-right")}>SHARES</th>
                  <th className={cn(th, "text-right")}>VALUE</th>
                  <th className={cn(th, "text-right")}>USD</th>
                  <th className={cn(th, "text-right")}>NET APY</th>
                  <th className={cn(th, "text-right")}>YIELD / Y</th>
                </tr>
              </thead>
              <tbody>
                {vaults.map((v) => {
                  const apy = vaultApy(v.address);
                  return (
                    <tr key={v.address} className="border-b border-border/40 hover:bg-white/5">
                      <td className={cn(td, "text-text truncate")}>
                        <Link href={v.route} className="hover:text-gold transition-colors">
                          {v.name} <span className="text-text-dim/60">↗</span>
                        </Link>
                      </td>
                      <td className={td} />
                      <td className={td} />
                      <td className={cn(td, "text-right text-text-dim")}>{formatNumberWithCommas(Number(formatAmount(v.shares, 18, 18)), 4, true)}</td>
                      <td className={cn(td, "text-right text-text")}>{amt(v.assets, v.asset.decimals, v.asset.symbol)}</td>
                      <td className={cn(td, "text-right text-text-dim")}>{fmtUsd(v.assetsUsd)}</td>
                      <td className={cn(td, "text-right text-gold")}>{apy != null ? fmtPct(apy) : "—"}</td>
                      <td className={cn(td, "text-right text-text-dim")}>{apy != null && v.assetsUsd != null ? fmtUsd(v.assetsUsd * apy) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* LENDING */}
      <Section title="LENDING // MORPHO BLUE" hint="click a row to act on it">
        {lends.length === 0 ? (
          <Empty text={loading ? "…" : "NO_LENDING_POSITIONS"} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <ColGroup />
              <thead>
                <tr className="bg-panel text-text-dim border-b border-border">
                  <th className={cn(th, "text-left")}>MARKET</th>
                  <th className={cn(th, "text-right")}>SUPPLIED</th>
                  <th className={cn(th, "text-right")}>USD</th>
                  <th className={cn(th, "text-right")}>BOOK</th>
                  <th className={cn(th, "text-right")}>APY</th>
                  <th className={cn(th, "text-right")}>YIELD_GAP</th>
                  <th className={cn(th, "text-right")}>EXIT</th>
                  <th className={cn(th, "text-right")}>FLAGS</th>
                </tr>
              </thead>
              <tbody>
                {lends.map((p) => (
                  <Row key={`l-${p.chainId}-${p.market.market_id}`} p={p} open={open === `l-${p.market.market_id}`} onToggle={() => setOpen(open === `l-${p.market.market_id}` ? null : `l-${p.market.market_id}`)} bestApy={stats.bestDeployableApy} feed={drill(p)} cols={8}>
                    <td className={cn(td, "text-right text-text")}>{amt(p.supplied, p.loan.decimals, p.loan.symbol)}</td>
                    <td className={cn(td, "text-right text-text-dim")}>{fmtUsd(p.suppliedUsd)}</td>
                    <td className={cn(td, "text-right text-text-dim")} title="Your share of the lender book">{fmtPct(p.bookShare, 2)}</td>
                    <td className={cn(td, "text-right text-gold")}>{fmtPct(p.marketData.supplyApy)}</td>
                    <td className={cn(td, "text-right")}>
                      {p.better ? (
                        <span className="text-gold" title={`${p.better.market.collateral_symbol}/${p.better.market.loan_symbol}@${Math.round((p.better.market.lltv ?? 0) * 100)} pays ${fmtPct(p.better.market.supply_apy)} — investable, same loan token, same chain`}>
                          +{fmtPct(p.better.gap)} @ {p.better.market.collateral_symbol}/{p.better.market.loan_symbol}
                        </span>
                      ) : (
                        <span className="text-success" title="No investable market on this chain pays more for this loan token">BEST</span>
                      )}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <span className={p.exitCovered ? "text-success" : "text-danger"} title={p.exitCovered ? "Current liquidity covers your whole supply" : `Only ${amt(p.marketData.liquidity, p.loan.decimals, p.loan.symbol)} withdrawable now — the rest waits for repayments`}>
                        {p.exitCovered ? "OPEN" : "QUEUED"}
                      </span>
                    </td>
                    <td className={cn(td, "text-right")}><Flags p={p} /></td>
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* BORROWS */}
      <Section title="BORROWS // MORPHO BLUE" hint="click a row to act on it">
        {borrows.length === 0 ? (
          <Empty text={loading ? "…" : "NO_BORROW_POSITIONS"} />
        ) : (
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <ColGroup />
              <thead>
                <tr className="bg-panel text-text-dim border-b border-border">
                  <th className={cn(th, "text-left")}>MARKET</th>
                  <th className={cn(th, "text-right")}>COLLATERAL</th>
                  <th className={cn(th, "text-right")}>DEBT</th>
                  <th className={cn(th, "text-right")}>LTV / LLTV</th>
                  <th className={cn(th, "text-right")}>HEALTH</th>
                  <th className={cn(th, "text-right")}>LIQ_PRICE</th>
                  <th className={cn(th, "text-right")}>BORROW APY</th>
                  <th className={cn(th, "text-right")}>FLAGS</th>
                </tr>
              </thead>
              <tbody>
                {borrows.map((p) => (
                  <Row key={`b-${p.chainId}-${p.market.market_id}`} p={p} open={open === `b-${p.market.market_id}`} onToggle={() => setOpen(open === `b-${p.market.market_id}` ? null : `b-${p.market.market_id}`)} bestApy={stats.bestDeployableApy} feed={drill(p)} cols={8}>
                    <td className={cn(td, "text-right text-text")}>
                      {amt(p.collateralAmount, p.collateral.decimals, p.collateral.symbol, 4)}
                      <span className="text-text-dim/60"> {fmtUsd(p.collateralUsd)}</span>
                    </td>
                    <td className={cn(td, "text-right text-text")}>
                      {amt(p.debt, p.loan.decimals, p.loan.symbol)}
                      <span className="text-text-dim/60"> {fmtUsd(p.debtUsd)}</span>
                    </td>
                    <td className={cn(td, "text-right")}>
                      <span className={p.ltv == null || p.market.lltv == null ? "text-text-dim" : p.ltv >= p.market.lltv * 0.95 ? "text-danger" : p.ltv >= p.market.lltv * 0.8 ? "text-gold" : "text-success"}>{p.ltv != null ? fmtPct(p.ltv, 1) : "—"}</span>
                      <span className="text-text-dim/60"> / {fmtLltv(p.market.lltv)}</span>
                    </td>
                    <td className={cn(td, "text-right")}>
                      <span className={p.health == null ? "text-text-dim" : p.health < 1.05 ? "text-danger" : p.health < 1.2 ? "text-gold" : "text-success"}>{p.health != null ? fmtRatio(p.health) : "—"}</span>
                    </td>
                    <td className={cn(td, "text-right text-text-dim")} title={`Collateral price in ${p.loan.symbol} at which the position becomes liquidatable`}>{p.liqPrice != null ? `${fmtPrice(p.liqPrice)} ${p.loan.symbol}` : "—"}</td>
                    <td className={cn(td, "text-right text-text")}>{fmtPct(p.marketData.borrowApy)}</td>
                    <td className={cn(td, "text-right")}><Flags p={p} /></td>
                  </Row>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="px-3 py-3 text-[9px] font-mono text-text-dim/60 leading-relaxed">
        USD figures are estimates: loan tokens at MNEMON&apos;s snapshot price (supply_usd ÷ on-chain supply), collateral at the
        market oracle, vault assets at par for stables and at MNEMON&apos;s WHYPE oracle price for WHYPE. Positions read on-chain from{" "}
        {PORTFOLIO_CHAINS.map(chainTag).join(" · ")}; markets MNEMON does not index are not scanned.
      </div>
    </div>
  );
}

function Flags({ p }: { p: MarketPosition }) {
  const m = p.market;
  const dev = m.oracle_deviation;
  const flags: { text: string; tone: string; title: string }[] = [];
  if (m.is_broken) flags.push({ text: (m.broken_reason ?? "BROKEN").toUpperCase(), tone: "text-danger", title: "MNEMON classifier flags this market as broken" });
  if (m.oracle_price == null && m.history.length > 0) flags.push({ text: "NO_PRICE", tone: "text-danger", title: "Oracle returned no price at the latest sample" });
  if (dev != null && Math.abs(dev) >= 0.02) flags.push({ text: "DEPEG", tone: Math.abs(dev) >= 0.05 ? "text-danger" : "text-gold", title: `Oracle deviates ${(dev * 100).toFixed(1)}% from the DefiLlama cross` });
  if (flags.length === 0) return <span className="text-text-dim/40">—</span>;
  return (
    <span className="inline-flex gap-1.5 justify-end">
      {flags.map((f) => (
        <span key={f.text} title={f.title} className={cn("text-[9px] uppercase tracking-wider", f.tone)}>
          {f.text}
        </span>
      ))}
    </span>
  );
}

// What the drill-down needs beyond the market row (FLOWS tile, chart markers).
type DrillFeed = {
  flow: FlowsMarketEntry | null;
  flowsSynced: boolean;
  depegSpells: DepegSpell[];
  liquidations: Liquidation[];
};

// A position row: chain tag + pair cell, then the caller's cells; expands into
// the analyser drill-down with the action panel ON.
function Row({
  p,
  open,
  onToggle,
  bestApy,
  feed,
  cols,
  children,
}: {
  p: MarketPosition;
  open: boolean;
  onToggle: () => void;
  bestApy: number | null;
  feed: DrillFeed;
  cols: number;
  children: ReactNode;
}) {
  return (
    <Fragment>
      <tr onClick={onToggle} className={cn("border-b border-border/40 font-mono cursor-pointer transition-colors hover:bg-white/5", open && "bg-white/5")}>
        <td className={cn(td, "text-text truncate")}>
          <span className="inline-flex items-center gap-2 max-w-full">
            <span className={cn("text-[8px] transition-transform text-text-dim", open && "rotate-90")}>▸</span>
            <span className="text-[9px] tracking-wider text-text-dim border border-border px-1">{chainTag(p.chainId)}</span>
            {pair(p)}
            <span className="text-text-dim/50 text-[10px]">{p.market.market_id.slice(0, 8)}…</span>
          </span>
        </td>
        {children}
      </tr>
      {open && (
        <tr>
          <td colSpan={cols} className="p-0">
            <MnemonMarketDrilldown market={p.market} bestInvestableApy={bestApy} actions {...feed} />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
