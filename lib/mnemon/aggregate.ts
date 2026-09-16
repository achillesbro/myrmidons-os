import type { Liquidation, MarketHealthEntry } from "./schemas";

// Market-wide KPI aggregates, computed FE-side from the market_health snapshot.

// Fallback floor for pre-v4 snapshots only; the live rule is the server's
// `investable` field (MNEMON INVESTABLE_MIN_AVAILABLE_USD, $50k).
export const DEPLOYABLE_MIN_AVAILABLE_USD = 50_000;

// A market you could actually invest in. Since MNEMON export v8 (2026-09-16)
// the server flag is a gate model (exit liquidity/regime, rate, oracle
// overprice, bad debt, DEX liquidatability of at-risk debt, 1h flicker
// guard) with `investable_reasons` / `investable_warnings` beside it. This is
// the reference set for "best APY" comparisons — a 12,000% dust market is not
// a real benchmark. The local rule only covers stale pre-v4 snapshots.
export function isInvestable(m: MarketHealthEntry): boolean {
  // ponytail: FE override of the server flag — MNEMON's gates don't include
  // "oracle returned no price at the latest sample"; drop this once they do.
  if (isUnpriced(m)) return false;
  return (
    m.investable ??
    (!m.is_broken && (m.available_usd ?? 0) >= DEPLOYABLE_MIN_AVAILABLE_USD)
  );
}

// The Morpho oracle returned NO price at MNEMON's latest sample (the call
// reverted or the feed is dead). Without a price the market cannot compute
// health factors, so NO position can be liquidated: an underwater book
// accrues bad debt to lenders unchecked. Nobody should deposit here. Explicit
// null only — a missing key is a pre-v2 snapshot, not a dead oracle.
/**
 * Resolve a human market reference for the terminal: `COLL/LOAN[@LLTV]`
 * (`whype/usdc`, `whype/usdc@77`) or a market-id prefix (`0xd7d382…`, ≥ 6
 * hex chars), among the markets on `chainId`. Two markets can share a pair
 * at different LLTVs — an ambiguous ref lists them instead of guessing.
 */
export function resolveMarketRef(
  markets: MarketHealthEntry[],
  ref: string,
  chainId: number
): { ok: true; market: MarketHealthEntry } | { ok: false; error: string; candidates: string[] } {
  const onChain = markets.filter((m) => (m.chain_id ?? 999) === chainId);
  const describe = (m: MarketHealthEntry) =>
    `${m.collateral_symbol}/${m.loan_symbol}@${m.lltv != null ? Math.round(m.lltv * 100) : "?"}  ${m.market_id}`;
  let hits: MarketHealthEntry[];
  if (/^0x[0-9a-f]{6,64}$/i.test(ref)) {
    const p = ref.toLowerCase();
    hits = onChain.filter((m) => m.market_id.toLowerCase().startsWith(p));
  } else {
    const match = ref.match(/^([^/@\s]+)\/([^/@\s]+)(?:@(\d+)%?)?$/);
    if (!match) return { ok: false, error: "BAD_MARKET_REF  use COLL/LOAN[@LLTV] or a market id prefix", candidates: [] };
    const [, coll, loan, lltv] = match;
    hits = onChain.filter(
      (m) =>
        m.collateral_symbol?.toLowerCase() === coll.toLowerCase() &&
        m.loan_symbol?.toLowerCase() === loan.toLowerCase() &&
        (lltv == null || (m.lltv != null && Math.round(m.lltv * 100) === Number(lltv)))
    );
  }
  if (hits.length === 1) return { ok: true, market: hits[0] };
  if (hits.length === 0) return { ok: false, error: `MARKET_NOT_FOUND  ${ref} on chain ${chainId}`, candidates: [] };
  return { ok: false, error: `AMBIGUOUS_MARKET  ${ref} — pick one:`, candidates: hits.map(describe) };
}

export function isUnpriced(m: MarketHealthEntry): boolean {
  return m.oracle_price === null;
}

// Idle markets (no collateral) are the vault's un-allocated cash position, not
// real lending markets — filtered out of the analyser.
export function isRealMarket(m: MarketHealthEntry): boolean {
  return m.collateral_symbol != null;
}

// Dust liquidations: repaying ≤ this fraction of the market's borrow is noise
// (mirrors the whale-flow ≥5%-of-supply bar). Shared by every liquidation feed.
export const DUST_LIQ_PCT_OF_BORROW = 0.05;

/** The market's current borrow in USD (supply − available); null when unpriced. */
export function borrowUsdOf(m: MarketHealthEntry): number | null {
  if (m.supply_usd == null || m.available_usd == null) return null;
  return Math.max(m.supply_usd - m.available_usd, 0);
}

// Dust filter for a liquidation feed. Borrow is the market's CURRENT borrow,
// not borrow at event time — close enough to drop $0 noise. Rows with no
// repaid_usd are dust by definition; a market with no borrow figure (or a
// fully-repaid book) is kept, not hidden.
export function isSignificantLiquidation(
  l: Liquidation,
  borrowUsd: number | null | undefined
): boolean {
  if (!l.repaid_usd) return false;
  return borrowUsd == null || borrowUsd === 0 || l.repaid_usd / borrowUsd > DUST_LIQ_PCT_OF_BORROW;
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
    if (m.is_broken) {
      // Broken markets stay listed (with their reason pill) but count toward
      // NO aggregate: a ratcheted market's "supply" is phantom interest
      // accrual (Arbitrum K/USDC claimed $6.1B), and summing it would
      // poison the headline the same way it would poison best-APY.
      brokenCount += 1;
    } else {
      if (m.supply_usd != null) totalSupplyUsd += m.supply_usd;
      if (m.available_usd != null) deployableLiquidityUsd += m.available_usd;
    }

    // At-risk (v8): the liquidatable gate failed — a bad day would push more
    // debt into liquidation than the DEX can absorb within the bonus. Broken
    // markets are counted as broken, not at risk.
    if (!m.is_broken && (m.investable_reasons ?? []).includes("liquidatable")) atRiskCount += 1;

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
