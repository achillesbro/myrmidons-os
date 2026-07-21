import type { MarketHealthEntry } from "./schemas";

// Market-wide KPI aggregates, computed FE-side from the market_health snapshot.

// Mirrors the HEGEMON bot's minAvailableLiquidity: a market is "deployable"
// only if you could actually enter/exit at a meaningful size.
export const DEPLOYABLE_MIN_AVAILABLE_USD = 10_000;
// A borrower within 5% of liquidation (health factor < 1.05) flags market risk.
export const AT_RISK_HF = 1.05;

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

    const deployable =
      !m.is_broken && (m.available_usd ?? 0) >= DEPLOYABLE_MIN_AVAILABLE_USD;
    if (deployable) {
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
