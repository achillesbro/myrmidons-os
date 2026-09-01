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

// Oracle identity (api schema 1.1, 2026-09-01): dimensional data from the
// MNEMON archive's oracles dim — immutable on-chain config resolved once per
// address, served without model_version/history. null while MNEMON has not
// resolved the market's oracle. Identity fields inside a block are null for
// a not-yet-probed address.
const OracleLegSchema = z.object({
  role: z.string(), // base_feed_1 | base_feed_2 | quote_feed_1 | quote_feed_2 | base_vault | quote_vault
  address: z.string(),
  vendor: z.string().nullish(), // Chainlink | Pyth | "Push-based (unknown)" | ERC4626
  description: z.string().nullish(), // "BTC / USD", or the vault's name for vault legs
});

// MODT (Steakhouse MetaOracleDeviationTimelock) failover composition: the
// wrapper serves `primary` and fails over to `backup` when they deviate past
// threshold_bps for the challenge timelock. Static config only (api 1.2);
// thresholds/timelocks are null for MODTs discovered after the seed probe.
const ModtSideSchema = z.object({
  address: z.string(),
  legs: z.array(OracleLegSchema),
});

const ModtBlockSchema = z.object({
  primary: ModtSideSchema,
  backup: ModtSideSchema,
  threshold_bps: z.number().nullish(),
  challenge_timelock_s: z.number().nullish(),
  healing_timelock_s: z.number().nullish(),
});

const OracleBlockSchema = z.object({
  address: z.string(),
  kind: z.string().nullish(), // oracle-resolved | oracle-custom | feed | oracle | oracle-broken | vault | opaque
  family: z.string().nullish(), // meta-deviation-timelock | curve-stableswap | constant-peg | custom
  owner_status: z.string().nullish(), // "ok" = upgradable admin exists; "none" = immutable
  broken: z.string().nullish(), // no-code | price-revert
  legs: z.array(OracleLegSchema),
  modt: ModtBlockSchema.nullish(),
  shared_feed_markets: z.number().nullish(),
  fetched_at: z.string().nullish(),
});

const RiskMarketSchema = z.object({
  chain_id: z.number(),
  liq_capacity: LiqCapacitySchema.nullish(),
  oracle: OracleBlockSchema.nullish(),
  metrics: z.record(z.string(), MetricValueSchema),
});

export const RiskMarketsSchema = z.object({
  generated_at: z.string(),
  schema_version: z.union([z.string(), z.number()]).nullish(),
  markets: z.record(z.string(), RiskMarketSchema),
});

export type MetricValue = z.infer<typeof MetricValueSchema>;
export type OracleLeg = z.infer<typeof OracleLegSchema>;
export type ModtSide = z.infer<typeof ModtSideSchema>;
export type OracleBlock = z.infer<typeof OracleBlockSchema>;
export type LiqCapacity = z.infer<typeof LiqCapacitySchema>;
export type RiskMarket = z.infer<typeof RiskMarketSchema>;
export type RiskMarkets = z.infer<typeof RiskMarketsSchema>;
