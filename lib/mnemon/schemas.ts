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

// Trailing 7d/30d utilization regime — all fields fractions (0–1).
const UtilizationRegimeSchema = z.object({
  avg_util_7d: z.number().nullable(),
  avg_util_30d: z.number().nullable(),
  pct_time_gt95_7d: z.number().nullable(),
  pct_time_gt95_30d: z.number().nullable(),
  pct_time_gt99_7d: z.number().nullable(),
  pct_time_gt99_30d: z.number().nullable(),
});

// Borrower-book risk from the latest positions snapshot. min_hf is a ratio;
// pct_debt_hf_lt_105 and top3_debt_pct are fractions (0–1).
const BorrowerRiskSchema = z.object({
  borrowers: z.number(),
  min_hf: z.number().nullable(),
  borrowers_hf_lt_105: z.number().nullable(),
  pct_debt_hf_lt_105: z.number().nullable(),
  top3_debt_pct: z.number().nullable(),
});

// Lender-book concentration from the latest supplier snapshot. Percentages
// are fractions (0–1). Top suppliers are often V1 vault addresses — that's
// the answer ("a vault reallocation moves this market"), not an artifact.
const SupplierConcentrationSchema = z.object({
  suppliers: z.number(),
  top1_supplier: z.string().nullable(),
  top1_supply_pct: z.number().nullable(),
  top3_supply_pct: z.number().nullable(),
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
  // schema_version 2 enrichments. All nullish so a stale v1 snapshot (missing
  // keys) still validates. Util fields are fractions (0–1), matching the export.
  spread_to_best: z.number().nullish(), // ≤ 0; APY gap below the best non-broken market
  oracle_price: z.number().nullish(), // 1 collateral priced in loan units
  collateral_vol_7d: z.number().nullish(), // annualized
  collateral_vol_30d: z.number().nullish(),
  utilization_regime: UtilizationRegimeSchema.nullish(),
  borrower_risk: BorrowerRiskSchema.nullish(),
  // schema_version 3 enrichments (nullish: v2 snapshots still validate).
  // oracle_deviation = Morpho oracle vs the DefiLlama collateral/loan cross,
  // as a fraction (+0.02 = oracle 2% rich). Exchange-rate oracles (LSTs, RWAs)
  // show persistent structural deviation — signal, not necessarily a depeg.
  oracle_deviation: z.number().nullish(),
  supplier_concentration: SupplierConcentrationSchema.nullish(),
  // schema_version 4 (nullish: v3 snapshots still validate). Server-computed
  // "deployable at size" flag: NOT is_broken AND available_usd >= the floor
  // (MNEMON's INVESTABLE_MIN_AVAILABLE_USD, $50k as of 2026-08-19). Prefer
  // this over any FE-side threshold so both always agree.
  investable: z.boolean().nullish(),
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

// --- market_flows.json --------------------------------------------------
// Per-market loan-side flow windows + the whale/liquidation feeds. IMPORTANT:
// every window anchors to `data_through` (newest INGESTED event), not wall
// clock — during the initial backfill or an ingestion outage the windows
// describe the past. Gate any "last 24h" display on `synced`; treat a missing
// key (pre-v3 snapshot) as false.

// One hourly netflow point (sparse — only hours with events). Loan-token units.
const FlowPointSchema = z.object({
  ts: z.string().nullable(),
  net_supply_flow: z.number().nullable(),
  net_borrow_flow: z.number().nullable(),
});

const FlowsMarketEntrySchema = z.object({
  market_id: z.string(),
  loan_symbol: z.string().nullable(),
  // All amounts in LOAN-TOKEN units (not USD).
  supply_in_24h: z.number().nullable(),
  supply_out_24h: z.number().nullable(),
  net_supply_24h: z.number().nullable(),
  net_borrow_24h: z.number().nullable(),
  supply_in_7d: z.number().nullable(),
  supply_out_7d: z.number().nullable(),
  net_supply_7d: z.number().nullable(),
  net_borrow_7d: z.number().nullable(),
  n_liquidations_30d: z.number().nullable(),
  // Trailing-7d hourly netflow series (nullish: pre-flow_history snapshots).
  flow_history: z.array(FlowPointSchema).nullish(),
});

const WhaleFlowSchema = z.object({
  ts: z.string().nullable(),
  market_id: z.string(),
  loan_symbol: z.string().nullable(),
  tx_hash: z.string().nullable(),
  type: z.string().nullable(), // Supply | Withdraw | Borrow | Repay | Liquidation
  account: z.string().nullable(),
  flow: z.number().nullable(), // signed, loan-token units
  pct_of_supply: z.number().nullable(), // fraction of market supply at the time
});

const LiquidationSchema = z.object({
  ts: z.string().nullable(),
  market_id: z.string(),
  loan_symbol: z.string().nullable(),
  collateral_symbol: z.string().nullable(),
  tx_hash: z.string().nullable(),
  borrower: z.string().nullable(),
  liquidator: z.string().nullable(),
  repaid_assets: z.number().nullable(), // loan units
  seized_assets: z.number().nullable(), // collateral units
  bad_debt_assets: z.number().nullable(),
  repaid_usd: z.number().nullable(),
  seized_usd: z.number().nullable(),
});

export const MarketFlowsSchema = z.object({
  schema_version: z.number(),
  generated_at: z.string(),
  data_through: z.string().nullish(),
  synced: z.boolean().nullish(),
  chain_id: z.number().nullable(),
  markets: z.array(FlowsMarketEntrySchema),
  whale_flows: z.array(WhaleFlowSchema),
  liquidations: z.array(LiquidationSchema),
});

// --- depeg_spells.json ----------------------------------------------------
// Oracle-vs-DefiLlama decoupling episodes, same island machinery as
// util_spells. Deviations are fractions; peak_deviation keeps the sign.

export const DepegSpellSchema = z.object({
  market_id: z.string(),
  threshold: z.number(),
  start_ts: z.string(),
  end_ts: z.string(),
  duration_min: z.number(),
  peak_abs_deviation: z.number().nullable(),
  peak_deviation: z.number().nullable(),
  open: z.boolean(),
});

export const DepegSpellsSchema = z.object({
  schema_version: z.number(),
  generated_at: z.string(),
  chain_id: z.number().nullable(),
  spells: z.array(DepegSpellSchema),
});

export type HistoryPoint = z.infer<typeof HistoryPointSchema>;
export type UtilizationRegime = z.infer<typeof UtilizationRegimeSchema>;
export type BorrowerRisk = z.infer<typeof BorrowerRiskSchema>;
export type MarketHealthEntry = z.infer<typeof MarketHealthEntrySchema>;
export type MarketHealth = z.infer<typeof MarketHealthSchema>;
export type UtilSpell = z.infer<typeof UtilSpellSchema>;
export type UtilSpells = z.infer<typeof UtilSpellsSchema>;
export type SupplierConcentration = z.infer<typeof SupplierConcentrationSchema>;
export type FlowPoint = z.infer<typeof FlowPointSchema>;
export type FlowsMarketEntry = z.infer<typeof FlowsMarketEntrySchema>;
export type WhaleFlow = z.infer<typeof WhaleFlowSchema>;
export type Liquidation = z.infer<typeof LiquidationSchema>;
export type MarketFlows = z.infer<typeof MarketFlowsSchema>;
export type DepegSpell = z.infer<typeof DepegSpellSchema>;
export type DepegSpells = z.infer<typeof DepegSpellsSchema>;

// The classifier reasons MNEMON emits today (v_market_health), with the
// human-facing micro-label the UI renders. Unknown reasons fall back to the
// raw string uppercased.
export const BROKEN_REASON_LABELS: Record<string, string> = {
  rate_ratchet: "RATE_RATCHET",
  pinned_util: "PINNED_UTIL",
  dust: "DUST",
};
