/**
 * HEGEMON_V2 strategy constants and curves (Morpho Vault V2 reallocator).
 *
 * Mirrors apps/config/src/strategies/hegemon.ts in the HEGEMON_V2 bot repo —
 * keep in sync with the bot when retuning. Differences vs the V1 policy
 * (lib/strategy/adaptiveCurve.ts): tighter bell (U0 0.88, SIGMA 0.05), higher
 * critical threshold (0.95), no planner-side concentration cap or min-active
 * (per-market limits are the vault's on-chain caps), deallocation haircut,
 * and native liquidity-adapter rotation with a buffer floor.
 */

export const HEGEMON_V2_CONSTANTS = {
  // Utilization regime thresholds
  U0: 0.88, // bell-curve peak (slightly below the IRM's 90% target)
  SIGMA: 0.05, // bell-curve width
  U_OPT_LOW: 0.78, // deposits never push a market's utilization below this
  U_SAT: 0.92, // saturated band start: inflow allowed but downweighted
  U_CRIT: 0.95, // no deposits at or above; withdrawals never push a market above

  // Exit safety
  EXIT_MIN: 0.06, // exitRatio floor: below this, no new deposits
  EXIT_POWER: 1.5, // convexity of the exit-safety penalty

  // Cooldown hysteresis (early release conditions)
  U_RECOVERY: 0.86,
  EXIT_RECOVERY: 0.1,

  // Saturated band
  SAT_INFLOW_MULT: 0.4,

  // Softmax over max-normalized scores
  SOFTMAX_T: 0.2,

  // Churn control (bips of totalAssets per market delta)
  MIN_REALLOC_BPS_DELTA: 25,

  // Risk-override lane trigger (fraction of totalAssets in critical markets)
  CRIT_WEIGHT_RISK: 0.25,

  // Cooldowns after risk-lane exits (deposits only)
  RISK_COOLDOWN_HOURS: 2,
  LIQUIDITY_COOLDOWN_MINUTES: 30,

  // Deallocation haircut (bips of the computed max withdrawal)
  DEALLOC_HAIRCUT_BPS: 9950,

  // Liquidity-market management
  LIQUIDITY_ROTATION_FACTOR: 2, // challenger must beat incumbent by this factor
  LIQUIDITY_BUFFER_BPS: 500, // 5% of totalAssets floored in the liquidity market
} as const;

/** Bell curve centered on U0: exp(−((u − U0)/SIGMA)²) */
export function utilAttractivenessV2(u: number): number {
  const diff = (u - HEGEMON_V2_CONSTANTS.U0) / HEGEMON_V2_CONSTANTS.SIGMA;
  return Math.exp(-(diff * diff));
}

/**
 * What the scorer actually applies: the bell, throttled by SAT_INFLOW_MULT in
 * the saturated band [U_SAT, U_CRIT) and hard-gated to zero at U_CRIT.
 */
export function effectiveUtilAttractivenessV2(u: number): number {
  if (u >= HEGEMON_V2_CONSTANTS.U_CRIT) return 0;
  const bell = utilAttractivenessV2(u);
  if (u >= HEGEMON_V2_CONSTANTS.U_SAT) return bell * HEGEMON_V2_CONSTANTS.SAT_INFLOW_MULT;
  return bell;
}
