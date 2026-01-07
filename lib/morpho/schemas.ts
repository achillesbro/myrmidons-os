import { z } from "zod";

// GraphQL response schemas matching Morpho API structure

const AssetSchema = z.object({
  address: z.string().optional(),
  symbol: z.string().optional(),
  name: z.string().optional(),
  decimals: z.number().optional(),
}).passthrough();

const MarketStateSchema = z.object({
  supplyAssets: z.union([z.string(), z.number()]).optional(),
  borrowAssets: z.union([z.string(), z.number()]).optional(),
  utilization: z.union([z.string(), z.number()]).optional(),
  supplyApy: z.union([z.string(), z.number()]).optional(),
  rewards: z.union([
    z.array(z.any()), // Can be an array
    z.object({
      supplyApr: z.union([z.string(), z.number()]).optional(),
    }).passthrough(),
  ]).optional(),
}).passthrough();

const MarketSchema = z.object({
  uniqueKey: z.string().optional(),
  loanAsset: AssetSchema.optional(),
  collateralAsset: z.union([AssetSchema, z.null()]).optional(),
  state: MarketStateSchema.optional(),
}).passthrough();

const AllocationSchema = z.object({
  supplyQueueIndex: z.union([z.number(), z.null()]).optional(),
  withdrawQueueIndex: z.union([z.number(), z.null()]).optional(),
  market: MarketSchema.optional(),
  supplyAssets: z.union([z.string(), z.number()]).optional(),
  supplyAssetsUsd: z.union([z.string(), z.number()]).optional(),
  supplyCap: z.union([z.string(), z.number()]).optional(),
}).passthrough();

const VaultStateSchema = z.object({
  totalAssets: z.union([z.string(), z.number()]).optional(),
  totalAssetsUsd: z.union([z.string(), z.number()]).optional(),
  totalSupply: z.union([z.string(), z.number()]).optional(),
  sharePrice: z.union([z.string(), z.number()]).optional(),
  sharePriceUsd: z.union([z.string(), z.number()]).optional(),
  apy: z.union([z.string(), z.number()]).optional(),
  netApy: z.union([z.string(), z.number()]).optional(),
  allocation: z.array(AllocationSchema).optional(),
}).passthrough();

// Vault metadata response (from vaultByAddress query)
export const VaultMetadataSchema = z.object({
  vaultByAddress: z.object({
    address: z.string(),
    name: z.string().optional(),
    symbol: z.string().optional(),
    asset: AssetSchema.optional(),
    state: VaultStateSchema.optional(),
  }).passthrough().nullable(),
}).passthrough();

// Vault allocations response (from vaultByAddress query with allocation)
export const VaultAllocationsSchema = z.object({
  vaultByAddress: z.object({
    address: z.string().optional(),
    state: z.object({
      totalAssetsUsd: z.union([z.string(), z.number()]).optional(),
      allocation: z.array(AllocationSchema).optional(),
    }).passthrough().optional(),
  }).passthrough().nullable(),
}).passthrough();

// Vault APY response (from vaultByAddress query with APY fields)
export const VaultApySchema = z.object({
  vaultByAddress: z.object({
    address: z.string(),
    state: z.object({
      apy: z.union([z.string(), z.number()]).optional(),
      netApy: z.union([z.string(), z.number()]).optional(),
      sharePrice: z.union([z.string(), z.number()]).optional(),
      sharePriceUsd: z.union([z.string(), z.number()]).optional(),
    }).passthrough().optional(),
  }).passthrough().nullable(),
}).passthrough();

// Vault history response (timeseries data)
const TimeseriesPointSchema = z.object({
  x: z.number(), // Unix timestamp
  y: z.union([z.number(), z.null()]).optional(), // Value or null
}).passthrough();

export const VaultHistorySchema = z.object({
  vaultByAddress: z.object({
    address: z.string().optional(),
    historicalState: z.object({
      netApy: z.array(TimeseriesPointSchema).optional(),
      totalAssetsUsd: z.array(TimeseriesPointSchema).optional(),
    }).passthrough().optional(),
  }).passthrough().nullable(),
}).passthrough();

// Normalized history point for frontend
export const HistoryPointSchema = z.object({
  t: z.number(), // Unix timestamp in milliseconds
  apy: z.union([z.number(), z.null()]).optional(),
  tvlUsd: z.union([z.number(), z.null()]).optional(),
});

export type VaultMetadata = z.infer<typeof VaultMetadataSchema>;
export type VaultAllocations = z.infer<typeof VaultAllocationsSchema>;
export type VaultApy = z.infer<typeof VaultApySchema>;
export type VaultHistory = z.infer<typeof VaultHistorySchema>;
export type HistoryPoint = z.infer<typeof HistoryPointSchema>;

