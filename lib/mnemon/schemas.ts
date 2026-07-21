import { z } from "zod";

// Shapes of the MNEMON archive's FE export snapshots, served from
// data.myrmidons-strategies.com (MNEMON repo: src/mnemon/jobs/export.py).
// Every numeric metric is nullable — a market may be unpriced (no USD sizing)
// or have no rate sample yet. Timestamps are ISO-8601 UTC strings.

const HistoryPointSchema = z.object({
  ts: z.string(),
  supply_apy: z.number().nullable(),
  u: z.number().nullable(),
});

export const MarketHealthEntrySchema = z.object({
  market_id: z.string(),
  loan_symbol: z.string().nullable(),
  collateral_symbol: z.string().nullable(),
  lltv: z.number().nullable(),
  ts: z.string(),
  utilization: z.number().nullable(),
  supply_apy: z.number().nullable(),
  borrow_apy: z.number().nullable(),
  apy_at_target: z.number().nullable(),
  supply_usd: z.number().nullable(),
  available_usd: z.number().nullable(),
  is_broken: z.boolean(),
  // "rate_ratchet" | "pinned_util" | "dust" | null — kept as a raw string so a
  // future classifier reason doesn't break parsing; see BROKEN_REASONS.
  broken_reason: z.string().nullable(),
  history: z.array(HistoryPointSchema),
});

export const MarketHealthSchema = z.object({
  schema_version: z.number(),
  generated_at: z.string(),
  chain_id: z.number().nullable(),
  markets: z.array(MarketHealthEntrySchema),
});

export const UtilSpellSchema = z.object({
  market_id: z.string(),
  threshold: z.number(),
  start_ts: z.string(),
  end_ts: z.string(),
  duration_min: z.number(),
  peak_u: z.number().nullable(),
  open: z.boolean(),
});

export const UtilSpellsSchema = z.object({
  schema_version: z.number(),
  generated_at: z.string(),
  chain_id: z.number().nullable(),
  spells: z.array(UtilSpellSchema),
});

export type HistoryPoint = z.infer<typeof HistoryPointSchema>;
export type MarketHealthEntry = z.infer<typeof MarketHealthEntrySchema>;
export type MarketHealth = z.infer<typeof MarketHealthSchema>;
export type UtilSpell = z.infer<typeof UtilSpellSchema>;
export type UtilSpells = z.infer<typeof UtilSpellsSchema>;

// The classifier reasons MNEMON emits today (v_market_health), with the
// human-facing micro-label the UI renders. Unknown reasons fall back to the
// raw string uppercased.
export const BROKEN_REASON_LABELS: Record<string, string> = {
  rate_ratchet: "RATE_RATCHET",
  pinned_util: "PINNED_UTIL",
  dust: "DUST",
};
