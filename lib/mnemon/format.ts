import { BROKEN_REASON_LABELS } from "./schemas";

// Display formatting shared by the MNEMON pane summary and the /tools/mnemon
// page. Percentages are fractions (0.083 -> "8.30%"); USD collapses to k/M/B.

export const STALE_MINUTES = 45;

export function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
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
  { id: 999, label: "HYPEREVM", tag: "HEVM" },
  { id: 4663, label: "ROBINHOOD", tag: "RHC" },
] as const;

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
