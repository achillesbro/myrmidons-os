"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { MnemonMarketDrilldown } from "@/components/tools/mnemon/MnemonMarketDrilldown";
import { useMarketHealth } from "@/lib/mnemon/queries";
import { computeMarketStats, isRealMarket } from "@/lib/mnemon/aggregate";
import { chainTag, fmtLltv, fmtPct, fmtPrice, fmtRatio, fmtUsd } from "@/lib/mnemon/format";
import { useVaultApy } from "@/lib/morpho/queries";
import { pickKpis } from "@/lib/morpho/view";
import { useHypePrice } from "@/lib/use-hype-price";
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
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const health = useMarketHealth();
  const { priceUsd: hypeUsd } = useHypePrice();
  const q = usePortfolio(address, health.data?.markets, hypeUsd);
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

  // ─── Totals (USD estimates; null when any leg is unpriced) ──────────────
  const sum = (xs: (number | null)[]) => (xs.some((x) => x == null) && xs.length ? null : xs.reduce<number>((a, b) => a + (b ?? 0), 0));
  const suppliedUsd = sum([...vaults.map((v) => v.assetsUsd), ...lends.map((p) => p.suppliedUsd)]);
  const borrowedUsd = sum(borrows.filter((p) => p.debt > 0n).map((p) => p.debtUsd));
  const collateralUsd = sum(borrows.map((p) => p.collateralUsd));
  const netUsd = suppliedUsd != null && borrowedUsd != null && collateralUsd != null ? suppliedUsd + collateralUsd - borrowedUsd : null;
  // Blended APY: supply-weighted yield minus debt-weighted cost, over supplied USD.
  const yieldUsd = sum([
    ...vaults.map((v) => (v.assetsUsd != null ? v.assetsUsd * (vaultApy(v.address) ?? 0) : null)),
    ...lends.map((p) => (p.suppliedUsd != null ? p.suppliedUsd * p.marketData.supplyApy : null)),
  ]);
  const costUsd = sum(borrows.filter((p) => p.debt > 0n).map((p) => (p.debtUsd != null ? p.debtUsd * p.marketData.borrowApy : null)));
  const blended = suppliedUsd && yieldUsd != null && costUsd != null ? (yieldUsd - costUsd) / suppliedUsd : null;
  const worstHealth = borrows.reduce<number | null>((w, p) => (p.health != null && (w == null || p.health < w) ? p.health : w), null);
  const loading = isConnected && (q.isLoading || health.isLoading);
  const positions = vaults.length + lends.length + borrows.length;

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">PORTFOLIO // NO_OPERATOR</div>
        <p className="text-xs font-mono text-text/70 max-w-sm text-center leading-relaxed">
          Connect a wallet to read its vault shares and Morpho Blue positions across{" "}
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
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 border-l border-t border-border">
        {kpi("TOTAL_SUPPLIED", fmtUsd(suppliedUsd), "gold", `${vaults.length} vault${vaults.length === 1 ? "" : "s"} · ${lends.length} market${lends.length === 1 ? "" : "s"}`)}
        {kpi("TOTAL_BORROWED", fmtUsd(borrowedUsd), undefined, `${borrows.filter((p) => p.debt > 0n).length} borrow${borrows.filter((p) => p.debt > 0n).length === 1 ? "" : "s"}`)}
        {kpi("NET", fmtUsd(netUsd), undefined, "supplied + collateral − debt")}
        {kpi("BLENDED_APY", blended != null ? fmtPct(blended) : "—", blended != null && blended < 0 ? "danger" : "success", "yield − borrow cost, on supplied")}
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
            <table className="w-full min-w-[40rem]">
              <thead>
                <tr className="bg-panel text-text-dim border-b border-border">
                  <th className={cn(th, "text-left")}>VAULT</th>
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
                      <td className={cn(td, "text-text")}>
                        <Link href={v.route} className="hover:text-gold transition-colors">
                          {v.name} <span className="text-text-dim/60">↗</span>
                        </Link>
                      </td>
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
            <table className="w-full min-w-[56rem]">
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
                  <Row key={`l-${p.chainId}-${p.market.market_id}`} p={p} open={open === `l-${p.market.market_id}`} onToggle={() => setOpen(open === `l-${p.market.market_id}` ? null : `l-${p.market.market_id}`)} bestApy={stats.bestDeployableApy} cols={8}>
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
            <table className="w-full min-w-[60rem]">
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
                  <Row key={`b-${p.chainId}-${p.market.market_id}`} p={p} open={open === `b-${p.market.market_id}`} onToggle={() => setOpen(open === `b-${p.market.market_id}` ? null : `b-${p.market.market_id}`)} bestApy={stats.bestDeployableApy} cols={8}>
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
        market oracle, vault assets at par for stables and HYPE spot for WHYPE. Positions read on-chain from{" "}
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

// A position row: chain tag + pair cell, then the caller's cells; expands into
// the analyser drill-down with the action panel ON.
function Row({
  p,
  open,
  onToggle,
  bestApy,
  cols,
  children,
}: {
  p: MarketPosition;
  open: boolean;
  onToggle: () => void;
  bestApy: number | null;
  cols: number;
  children: ReactNode;
}) {
  return (
    <Fragment>
      <tr onClick={onToggle} className={cn("border-b border-border/40 font-mono cursor-pointer transition-colors hover:bg-white/5", open && "bg-white/5")}>
        <td className={cn(td, "text-text")}>
          <span className="inline-flex items-center gap-2">
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
            <MnemonMarketDrilldown market={p.market} bestInvestableApy={bestApy} actions />
          </td>
        </tr>
      )}
    </Fragment>
  );
}
