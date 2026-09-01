import type { OracleBlock } from "./schemas";

// An oracle composing an exchange-rate leg (ERC4626 vault hook, Curve LP,
// hardcoded peg) deviates from the DefiLlama SPOT cross by construction —
// its deviation is a fingerprint, not a depeg signal. Used to tone down the
// VS_DEFILLAMA row and suppress the table's DEPEG badge for such markets.
export function isStructuralOracle(o: OracleBlock | null | undefined): boolean {
  if (!o) return false;
  return (
    o.family === "constant-peg" ||
    o.family === "curve-stableswap" ||
    o.legs.some((l) => l.role.endsWith("vault"))
  );
}
