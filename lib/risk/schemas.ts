import { z } from "zod";

// Shapes of the myrmidons-api risk endpoints, served from
// api.myrmidons-strategies.com (repo myrmidons-api, contract openapi.yaml).
// Every value is nullable with a `status` — a failed computation is a
// null-valued row (`no_data` / `insufficient_history`), never a missing key.
// The as_of grid is hourly since 2026-08-20 (api v0.2.0); history points
// before that cutover are daily.

const MetricValueSchema = z.object({
  as_of: z.string(),
  value: z.number().nullable(),
  status: z.string(), // "ok" | "no_data" | "insufficient_history"
});

// Latest liq_capacity row per market. capacity_ratio = fraction of the
// market's WHOLE borrow that could be profitably liquidated in one sweep at
// current on-chain liquidity (DEX route + Core book, debt-clearing units);
// _grouped divides by the summed borrow of every market sharing the
// collateral (simultaneous-stress version).
const LiqCapacitySchema = z.object({
  as_of: z.string(),
  status: z.string(),
  capacity_ratio: z.number().nullable(),
  capacity_ratio_grouped: z.number().nullable(),
  lif: z.number().nullish(),
  max_slippage_used: z.number().nullish(),
});

const RiskMarketSchema = z.object({
  chain_id: z.number(),
  liq_capacity: LiqCapacitySchema.nullish(),
  metrics: z.record(z.string(), MetricValueSchema),
});

export const RiskMarketsSchema = z.object({
  generated_at: z.string(),
  schema_version: z.union([z.string(), z.number()]).nullish(),
  markets: z.record(z.string(), RiskMarketSchema),
});

export type MetricValue = z.infer<typeof MetricValueSchema>;
export type LiqCapacity = z.infer<typeof LiqCapacitySchema>;
export type RiskMarket = z.infer<typeof RiskMarketSchema>;
export type RiskMarkets = z.infer<typeof RiskMarketsSchema>;
