/**
 * AdaptiveCurveIRM-Aware Allocation Policy
 * 
 * Strategy constants and scoring functions for market allocation decisions.
 */

// Strategy constants
export const STRATEGY_CONSTANTS = {
  U_CRIT: 0.92,
  U_SAT: 0.88,
  U_OPT_LOW: 0.75,
  U0: 0.82,
  SIGMA: 0.07,
  EXIT_MIN: 0.05,
  EXIT_POWER: 2,
  SAT_INFLOW_MULT: 0.25,
  SOFTMAX_T: 0.20,
  MAX_CONCENTRATION_BPS: 4000, // 40%
  MIN_ACTIVE_MARKETS: 3,
} as const;

export type RegimeReason = "OK" | "SAT" | "CRIT" | "EXIT_MIN" | "MISSING";

export interface MarketDecision {
  marketId: string; // uniqueKey or market identifier
  marketLabel: string; // Human-readable name
  u: number | null; // utilization (0..1)
  apy: number | null; // APY as decimal (e.g., 0.05 = 5%)
  exitRatio: number | null; // borrowAssets / supplyAssets
  utilAttr: number | null; // utilAttractiveness(u)
  exitSafety: number | null; // exitSafety(exitRatio)
  scoreRawBeforeRegime: number | null;
  scoreRawAfterRegime: number | null;
  regimeReason: RegimeReason;
  softmaxWeight: number; // Final allocation weight (0..1)
  currentAllocationPct: number | null; // Current allocation percentage
}

/**
 * Clamp value to [0, 1]
 */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * Utilization attractiveness: bell curve centered at U0
 * utilAttractiveness(u) = exp(-((u-U0)/SIGMA)^2)
 */
export function utilAttractiveness(u: number): number {
  const diff = (u - STRATEGY_CONSTANTS.U0) / STRATEGY_CONSTANTS.SIGMA;
  return Math.exp(-(diff * diff));
}

/**
 * Exit safety: penalizes low exit ratios
 * exitSafety(exitRatio) = (clamp01(exitRatio))^EXIT_POWER
 */
export function exitSafety(exitRatio: number): number {
  return Math.pow(clamp01(exitRatio), STRATEGY_CONSTANTS.EXIT_POWER);
}

/**
 * Apply regime adjustments to raw score
 * Returns adjusted score and reason
 */
export function applyRegimes({
  u,
  exitRatio,
  scoreRaw,
}: {
  u: number | null;
  exitRatio: number | null;
  scoreRaw: number;
}): { scoreRaw: number; reason: RegimeReason } {
  // Missing data
  if (u === null || exitRatio === null) {
    return { scoreRaw: 0, reason: "MISSING" };
  }

  // Critical utilization: no deposits
  if (u >= STRATEGY_CONSTANTS.U_CRIT) {
    return { scoreRaw: 0, reason: "CRIT" };
  }

  // Exit ratio too low: no deposits
  if (exitRatio < STRATEGY_CONSTANTS.EXIT_MIN) {
    return { scoreRaw: 0, reason: "EXIT_MIN" };
  }

  // Saturated regime: reduce inflow
  if (u >= STRATEGY_CONSTANTS.U_SAT && u < STRATEGY_CONSTANTS.U_CRIT) {
    return {
      scoreRaw: scoreRaw * STRATEGY_CONSTANTS.SAT_INFLOW_MULT,
      reason: "SAT",
    };
  }

  // OK regime
  return { scoreRaw, reason: "OK" };
}

/**
 * Compute raw score before regime adjustments
 * scoreRaw(APY, u, exitRatio) = APY * utilAttractiveness(u) * exitSafety(exitRatio)
 */
export function scoreRaw({
  apy,
  u,
  exitRatio,
}: {
  apy: number | null;
  u: number | null;
  exitRatio: number | null;
}): number {
  if (apy === null || u === null || exitRatio === null) {
    return 0;
  }

  const utilAttr = utilAttractiveness(u);
  const exitSafe = exitSafety(exitRatio);

  return apy * utilAttr * exitSafe;
}

/**
 * Numerically stable softmax
 * Returns weights summing to 1
 * If all scores are 0 or negative, returns uniform weights for eligible markets
 */
export function softmax(
  scores: number[],
  temperature: number = STRATEGY_CONSTANTS.SOFTMAX_T
): number[] {
  if (scores.length === 0) {
    return [];
  }

  // Check if all scores are <= 0
  const maxScore = Math.max(...scores);
  if (maxScore <= 0) {
    // Return uniform weights for eligible markets (non-zero scores)
    const eligibleCount = scores.filter((s) => s > 0).length;
    if (eligibleCount === 0) {
      return scores.map(() => 0);
    }
    return scores.map((s) => (s > 0 ? 1 / eligibleCount : 0));
  }

  // Numerically stable softmax: subtract max before exp
  const scaled = scores.map((s) => (s - maxScore) / temperature);
  const expScores = scaled.map((s) => Math.exp(s));
  const sum = expScores.reduce((acc, val) => acc + val, 0);

  if (sum === 0) {
    return scores.map(() => 0);
  }

  return expScores.map((exp) => exp / sum);
}

/**
 * Compute market decisions for all markets
 */
export function computeMarketDecisions(
  markets: Array<{
    marketId: string;
    marketLabel: string;
    u: number | null;
    apy: number | null;
    exitRatio: number | null;
    currentAllocationPct: number | null;
  }>
): MarketDecision[] {
  // Compute raw scores and regime adjustments
  const decisions: MarketDecision[] = markets.map((market) => {
    const scoreRawBefore = scoreRaw({
      apy: market.apy,
      u: market.u,
      exitRatio: market.exitRatio,
    });

    const { scoreRaw: scoreRawAfter, reason } = applyRegimes({
      u: market.u,
      exitRatio: market.exitRatio,
      scoreRaw: scoreRawBefore,
    });

    const utilAttr =
      market.u !== null ? utilAttractiveness(market.u) : null;
    const exitSafe =
      market.exitRatio !== null ? exitSafety(market.exitRatio) : null;

    return {
      marketId: market.marketId,
      marketLabel: market.marketLabel,
      u: market.u,
      apy: market.apy,
      exitRatio: market.exitRatio,
      utilAttr,
      exitSafety: exitSafe,
      scoreRawBeforeRegime: scoreRawBefore > 0 ? scoreRawBefore : null,
      scoreRawAfterRegime: scoreRawAfter > 0 ? scoreRawAfter : null,
      regimeReason: reason,
      softmaxWeight: 0, // Will be computed after softmax
      currentAllocationPct: market.currentAllocationPct,
    };
  });

  // Extract scores for softmax (use after-regime scores)
  const scores = decisions.map((d) => d.scoreRawAfterRegime ?? 0);

  // Compute softmax weights
  const weights = softmax(scores, STRATEGY_CONSTANTS.SOFTMAX_T);

  // Assign weights
  decisions.forEach((decision, idx) => {
    decision.softmaxWeight = weights[idx];
  });

  // Sort by scoreRawAfterRegime (descending)
  decisions.sort((a, b) => {
    const scoreA = a.scoreRawAfterRegime ?? 0;
    const scoreB = b.scoreRawAfterRegime ?? 0;
    return scoreB - scoreA;
  });

  return decisions;
}

