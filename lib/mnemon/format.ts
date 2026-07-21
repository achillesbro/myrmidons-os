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

export function fmtDurationMin(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "—";
  if (min < 60) return `${Math.round(min)}m`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ${Math.round(min % 60)}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// Short "kHYPE / USDT0" pair label; idle markets have no collateral.
export function pairLabel(
  collateral: string | null | undefined,
  loan: string | null | undefined
): string {
  const l = loan ?? "?";
  return collateral ? `${collateral} / ${l}` : `IDLE / ${l}`;
}
