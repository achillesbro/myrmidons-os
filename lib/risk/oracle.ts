import type { OracleBlock, OracleLeg } from "./schemas";

// Feeds whose price is derived, not spot: Pendle PT feeds (a PT always
// trades at a discount to its underlying) and on-chain exchange/redemption
// rates. Read from each feed's self-description, like provider inference.
const STRUCTURAL_DESC = /pendle|exchange rate|redemption rate/i;

// An oracle composing a derived leg (ERC4626 vault hook, Curve LP, hardcoded
// peg, Pendle PT, exchange-rate feed) deviates from the DefiLlama SPOT cross
// by construction — its deviation is a fingerprint, not a depeg signal. Used
// to tone down the VS_DEFILLAMA row and suppress the table's DEPEG badge.
// MODT wrappers are judged by their primary/backup oracles' legs.
export function isStructuralOracle(o: OracleBlock | null | undefined): boolean {
  if (!o) return false;
  if (o.family === "constant-peg" || o.family === "curve-stableswap") return true;
  const legs: OracleLeg[] = [
    ...o.legs,
    ...(o.modt ? [...o.modt.primary.legs, ...o.modt.backup.legs] : []),
  ];
  return legs.some(
    (l) =>
      l.role.endsWith("vault") || (l.description != null && STRUCTURAL_DESC.test(l.description))
  );
}
