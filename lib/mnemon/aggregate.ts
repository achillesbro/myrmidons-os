import type { MarketHealthEntry } from "./schemas";

// Market-wide KPI aggregates, computed FE-side from the market_health snapshot.

// Fallback floor for pre-v4 snapshots only; the live rule is the server's
// `investable` field (MNEMON INVESTABLE_MIN_AVAILABLE_USD, $50k).
export const DEPLOYABLE_MIN_AVAILABLE_USD = 50_000;
// A borrower within 5% of liquidation (health factor < 1.05) flags market risk.
export const AT_RISK_HF = 1.05;

// A market you could actually invest in: no abnormal behaviour (not flagged
// broken) AND deep enough liquidity to enter/exit. This is the reference set
// for "best APY" comparisons — a 12,000% dust market is not a real benchmark.
// The server computes this (schema_version 4 `investable`) so every consumer
// agrees; the local rule only covers stale pre-v4 snapshots.
export function isInvestable(m: MarketHealthEntry): boolean {
  return (
    m.investable ??
    (!m.is_broken && (m.available_usd ?? 0) >= DEPLOYABLE_MIN_AVAILABLE_USD)
  );
}

// Idle markets (no collateral) are the vault's un-allocated cash position, not
// real lending markets — filtered out of the analyser.
export function isRealMarket(m: MarketHealthEntry): boolean {
  return m.collateral_symbol != null;
}

export interface MarketStats {
  markets: number;
  totalSupplyUsd: number;
  deployableLiquidityUsd: number;
  bestDeployableApy: number | null;
  deployableCount: number;
  brokenCount: number;
  atRiskCount: number;
}

export function computeMarketStats(markets: MarketHealthEntry[]): MarketStats {
  let totalSupplyUsd = 0;
  let deployableLiquidityUsd = 0;
  let bestDeployableApy: number | null = null;
  let deployableCount = 0;
  let brokenCount = 0;
  let atRiskCount = 0;

  for (const m of markets) {
    if (m.supply_usd != null) totalSupplyUsd += m.supply_usd;
    if (m.is_broken) {
      brokenCount += 1;
    } else if (m.available_usd != null) {
      // Only non-broken liquidity is genuinely usable.
      deployableLiquidityUsd += m.available_usd;
    }

    const hf = m.borrower_risk?.min_hf;
    if (hf != null && hf < AT_RISK_HF) atRiskCount += 1;

    if (isInvestable(m)) {
      deployableCount += 1;
      if (m.supply_apy != null && (bestDeployableApy == null || m.supply_apy > bestDeployableApy)) {
        bestDeployableApy = m.supply_apy;
      }
    }
  }

  return {
    markets: markets.length,
    totalSupplyUsd,
    deployableLiquidityUsd,
    bestDeployableApy,
    deployableCount,
    brokenCount,
    atRiskCount,
  };
}
