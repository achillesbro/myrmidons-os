import { BROKEN_REASON_LABELS, type MarketHealthEntry } from "./schemas";

// Display formatting shared by the MNEMON pane summary and the /tools/mnemon
// page. Percentages are fractions (0.083 -> "8.30%"); USD collapses to k/M/B.

export const STALE_MINUTES = 45;

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}

// LLTV is an exact protocol parameter (62.5%, 91.5%): show it verbatim with
// trailing zeros trimmed — never rounded (63% is a different market).
export function fmtLltv(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${parseFloat((v * 100).toFixed(2))}%`;
}

export function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export function ageMinutes(generatedAt: string | null | undefined): number | null {
  if (!generatedAt) return null;
  const ms = Date.now() - new Date(generatedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.floor(ms / 60_000);
}

export function fmtAge(generatedAt: string | null | undefined): string {
  const min = ageMinutes(generatedAt);
  if (min == null) return "—";
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

export function reasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return BROKEN_REASON_LABELS[reason] ?? reason.toUpperCase();
}

// MNEMON v8 investable gates (v_market_investable): one line of prose per
// reason / warning code. Thresholds are MNEMON's INVESTABLE_* constants —
// hand-copied; update when that repo retunes. Unknown codes fall back to the
// code itself so a new gate still renders.
const INVESTABLE_GATE_TEXT: Record<string, string> = {
  broken: "flagged broken by the classifier",
  idle: "idle market, no collateral",
  track_record: "fewer than 7 days of samples",
  exit_liquidity: "available liquidity below the $50k reference deposit",
  exit_regime: "utilization above 99% for more than 10% of the last 7 days",
  high_rate: "rate at target above 15%: a week of starvation, the IRM keeps pushing the rate up",
  rate_ratchet:
    "rate at target above 50%, the classifier's ratchet line: the quoted APY is not earnable and lenders cannot exit until borrowers repay",
  oracle_overprice: "the oracle prices collateral more than 2% above the DefiLlama cross",
  bad_debt: "bad debt was socialized in the last 30 days, at least 10 bps of supply",
  liquidatable:
    "selling the debt at risk on the DEX costs more than 80% of the liquidation bonus, so liquidators would not profit",
  liquidity_unverified: "no Relay quote for this pair yet",
  at_risk_unverified: "no collateral price history to size the debt at risk",
  unverified: "no gate data for this market yet",
  lender_majority: "one lender holds more than half the supply",
  lender_exit_shock: "the top lender cannot exit: the remaining supply does not cover the debt",
  lender_book_unverified: "no lender snapshot yet",
  redemption_only_collateral: "the collateral has no DEX route at any size. It is redeemed with its issuer, so the DEX gates are skipped",
  at_risk_above_quote_ladder: "the debt at risk is bigger than the largest size we quote, so the slippage shown is a lower bound",
  lltv_buffer_below_cutoff:
    "the collateral's bad-day cutoff exceeds the drop from LLTV to insolvency: one modelled bad day can push a position past profitable liquidation",
};

export function investableGateText(code: string): string {
  return INVESTABLE_GATE_TEXT[code] ?? code.replace(/_/g, " ");
}

// Banner lines (drill-down NOT_INVESTABLE strip): one row per failed gate,
// the number that tripped it against the limit. Falls back to the prose
// above when the export lacks the input. `broken` has its own banner entry.
export type GateLine = { code: string; detail: string; warn?: boolean };

export function investableGateLines(m: MarketHealthEntry): GateLine[] {
  const gi = m.investable_inputs;
  return (m.investable_reasons ?? [])
    .filter((r) => r !== "broken")
    .map((code) => {
      let detail: string | null = null;
      switch (code) {
        case "exit_liquidity":
          detail = `${fmtUsd(m.available_usd)} available, floor ${fmtUsd(gi?.deposit_usd ?? 50_000)}`;
          break;
        case "exit_regime":
          if (gi?.pinned_frac_7d != null)
            detail = `above 99% util for ${fmtPct(gi.pinned_frac_7d, 1)} of 7d, limit 10%`;
          break;
        case "high_rate":
          if (m.apy_at_target != null) detail = `${fmtPct(m.apy_at_target, 1)} at target, limit 15%`;
          break;
        case "oracle_overprice":
          if (m.oracle_deviation != null)
            detail = `oracle ${fmtSignedPct(m.oracle_deviation, 1)} vs the DefiLlama cross, limit +2%`;
          break;
        case "bad_debt":
          if (gi?.bad_debt_30d_usd != null)
            detail = `${fmtUsd(gi.bad_debt_30d_usd)} socialized in 30d, limit 10 bps of supply`;
          break;
        case "track_record":
          if (gi?.days_observed != null) detail = `${gi.days_observed.toFixed(1)} days of samples, need 7`;
          break;
        case "liquidatable":
          detail = liquidatableDetail(gi);
          break;
      }
      return { code, detail: detail ?? investableGateText(code) };
    });
}

// A null Relay slippage means no quote came back at that rung — MNEMON
// fails the gate on missing data (41 of 50 LIQUIDATABLE markets on
// 2026-09-29), so say "unverified", never "cannot be sold".
function liquidatableDetail(gi: MarketHealthEntry["investable_inputs"]): string | null {
  if (!gi) return null;
  const tail = `debt at risk ${fmtUsd(gi.at_risk_debt_usd)} · bonus ${fmtPct(gi.lif != null ? gi.lif - 1 : null, 1)}`;
  if (gi.has_dex_route === false) return `no DEX route for this collateral · ${tail}`;
  if (gi.dex_rung_slippage == null)
    return `unverified, no Relay quote${gi.dex_rung_usd != null ? ` at ${fmtUsd(gi.dex_rung_usd)}` : ""} · ${tail}`;
  return `${fmtPct(gi.dex_rung_slippage, 1)} slippage at ${fmtUsd(gi.dex_rung_usd)}, limit 80% of the bonus · ${tail}`;
}

// Soft flags worth a banner line. LENDER_MAJORITY trips on ~90% of markets
// and LLTV_BUFFER_BELOW_CUTOFF on ~70% (owner call 2026-09-29): noise in a
// warning strip, they stay in the export and the docs only.
const BANNER_HIDDEN_WARNINGS = new Set(["lender_majority", "lltv_buffer_below_cutoff"]);

export function investableWarningLines(m: MarketHealthEntry): GateLine[] {
  const gi = m.investable_inputs;
  const sc = m.supplier_concentration;
  return (m.investable_warnings ?? [])
    .filter((w) => !BANNER_HIDDEN_WARNINGS.has(w))
    .map((code) => {
      let detail: string | null = null;
      if (code === "lender_exit_shock" && gi?.util_after_top1_exit != null && gi.util_after_top1_exit > 0) {
        // debt ÷ remaining supply, inverted: what the rest of the book covers.
        detail = `top lender holds ${fmtPct(sc?.top1_supply_pct, 1)}; remaining supply covers ${fmtPct(1 / gi.util_after_top1_exit, 0)} of the debt`;
      }
      return { code, detail: detail ?? investableGateText(code), warn: true };
    });
}

// Oracle deviation is SIGNED: only an oracle ABOVE the cross endangers
// lenders (buy cheap on secondary, borrow against the inflated price, walk
// away with bad debt). Below is a haircut — borrowers liquidate early,
// lenders are over-covered — so it never colours (owner call 2026-09-29).
export function oracleDevTone(dev: number | null | undefined): "danger" | "gold" | "default" {
  if (dev == null || !Number.isFinite(dev) || dev < 0.02) return "default";
  return dev >= 0.05 ? "danger" : "gold";
}

// Unitless ratio (e.g. a health factor) — plain fixed decimals, no % or symbol.
export function fmtRatio(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

// Oracle price: thousands-separated for large values, precise for small ones.
export function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  if (abs >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (abs >= 1) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return v.toPrecision(4);
}

export function fmtDurationMin(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${Math.round(min % 60)}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// Token amount with k/M/B collapse and an explicit sign when requested —
// flow figures are LOAN-TOKEN units, not USD, so the symbol is appended.
export function fmtAmount(
  v: number | null | undefined,
  symbol?: string | null,
  { signed = false }: { signed?: boolean } = {}
): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v < 0 ? "−" : signed && v > 0 ? "+" : "";
  const abs = Math.abs(v);
  let num: string;
  if (abs >= 1e9) num = `${(abs / 1e9).toFixed(2)}B`;
  else if (abs >= 1e6) num = `${(abs / 1e6).toFixed(2)}M`;
  else if (abs >= 1e3) num = `${(abs / 1e3).toFixed(1)}k`;
  else if (abs >= 1) num = abs.toFixed(1);
  else num = abs.toPrecision(2);
  return `${sign}${num}${symbol ? ` ${symbol}` : ""}`;
}

// Signed deviation fraction: +0.0234 -> "+2.34%".
export function fmtSignedPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${(Math.abs(v) * 100).toFixed(digits)}%`;
}

// "0x1234…cdef" — feed rows show many addresses, keep them short.
export function shortAddr(addr: string | null | undefined): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Feed timestamp: relative under a day ("3h ago"), date beyond.
export function fmtEventTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms)) return "—";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

// Chains the MNEMON archive covers (export schema_version 5 stamps a
// chain_id on every row). Pre-v5 rows lack it — the archive was
// HyperEVM-only then, so null defaults to 999.
export const MNEMON_CHAINS = [
  { id: 999, label: "HYPEREVM", tag: "HEVM", explorer: "https://hyperevmscan.io" },
  { id: 4663, label: "ROBINHOOD", tag: "RHC", explorer: "https://robin.etherscan.io" },
  // Phase 1 of the every-chain expansion (2026-08-28), quoted via Relay.
  { id: 42161, label: "ARBITRUM", tag: "ARB", explorer: "https://arbiscan.io" },
  { id: 747474, label: "KATANA", tag: "KAT", explorer: "https://katanascan.com" },
  { id: 143, label: "MONAD", tag: "MON", explorer: "https://monadscan.com" },
  // Phase 2 (2026-09-01).
  { id: 1, label: "ETHEREUM", tag: "ETH", explorer: "https://etherscan.io" },
  { id: 8453, label: "BASE", tag: "BASE", explorer: "https://basescan.org" },
  // Arc (2026-09-09). Blockscout explorer since 2026-09-16.
  { id: 5042, label: "ARC", tag: "ARC", explorer: "https://explorer.arc.io" },
] as const;

export function explorerTxUrl(chainId: number, txHash: string): string | null {
  const chain = MNEMON_CHAINS.find((c) => c.id === chainId);
  return chain?.explorer ? `${chain.explorer}/tx/${txHash}` : null;
}

export function explorerAddressUrl(chainId: number, address: string): string | null {
  const chain = MNEMON_CHAINS.find((c) => c.id === chainId);
  return chain?.explorer ? `${chain.explorer}/address/${address}` : null;
}

export function chainOf(row: { chain_id?: number | null }): number {
  return row.chain_id ?? 999;
}

export function chainTag(id: number): string {
  return MNEMON_CHAINS.find((c) => c.id === id)?.tag ?? String(id);
}

// Flow-sync state for one chain (market_flows.json). null = no flows
// snapshot at all; otherwise the per-chain flag (schema_version 6), falling
// back to the global `synced` for pre-v6 snapshots. A chain absent from
// `chains` has no ingested events yet — not synced.
export function flowsSyncedFor(
  data: { synced?: boolean | null; chains?: Record<string, { synced: boolean }> | null } | null | undefined,
  chainId: number
): boolean | null {
  if (!data) return null;
  const per = data.chains?.[String(chainId)];
  if (per) return per.synced;
  if (data.chains) return false;
  return data.synced ?? false;
}

// Short "kHYPE / USDT0" pair label; idle markets have no collateral.
export function pairLabel(
  collateral: string | null | undefined,
  loan: string | null | undefined
): string {
  const l = loan ?? "?";
  return collateral ? `${collateral} / ${l}` : `IDLE / ${l}`;
}
