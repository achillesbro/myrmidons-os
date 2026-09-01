import type { OracleBlock, OracleLeg } from "./schemas";

// Feeds whose price is derived, not spot: Pendle PT feeds (a PT always
// trades at a discount to its underlying) and on-chain exchange/redemption
// rates. Read from each feed's self-description, like provider inference.
const STRUCTURAL_DESC = /pendle|exchange rate|redemption rate/i;

export type ProviderTone = "danger" | "gold" | "default";

const VENDOR_SHORT: Record<string, string> = {
  Chainlink: "CHAINLINK",
  Pyth: "PYTH",
  ERC4626: "ERC4626",
};

// Provider inference. The archive's vendor field is deliberately strict
// (Chainlink / Pyth / ERC4626 / "Push-based (unknown)"), but most push feeds
// name their provider in their own description() — reading that is not
// guessing. Order matters: PENDLE before the chainlink pattern ("Pendle
// Chainlink-compatible Oracle").
const DESC_PROVIDER: [RegExp, string][] = [
  [/redstone/i, "REDSTONE"],
  [/pendle/i, "PENDLE"],
  [/pyth/i, "PYTH"],
  [/chainlink/i, "CHAINLINK"],
  [/stork/i, "STORK"],
  [/chronicle/i, "CHRONICLE"],
  [/api3/i, "API3"],
  [/exchange rate|redemption rate/i, "ONCHAIN RATE"],
  [/fixed .* price/i, "FIXED PRICE"],
];

export function legProvider(leg: OracleLeg): string | null {
  if (leg.vendor && leg.vendor in VENDOR_SHORT) return VENDOR_SHORT[leg.vendor];
  for (const [re, name] of DESC_PROVIDER) {
    if (leg.description && re.test(leg.description)) return name;
  }
  return null;
}

function allLegs(o: OracleBlock): OracleLeg[] {
  return [...o.legs, ...(o.modt ? [...o.modt.primary.legs, ...o.modt.backup.legs] : [])];
}

// One-line provider summary for the ORACLE panel: family first (bespoke
// oracles have a named author), then the distinct providers of the legs
// ("CHAINLINK × ERC4626"), then honest fallbacks.
export function oracleProvider(o: OracleBlock): { label: string; tone: ProviderTone } {
  if (o.broken) return { label: `BROKEN (${o.broken.toUpperCase()})`, tone: "danger" };
  if (o.family === "meta-deviation-timelock") return { label: "STEAKHOUSE", tone: "default" };
  if (o.family === "curve-stableswap") return { label: "STAKEDAO", tone: "default" };
  if (o.family === "constant-peg") return { label: "CONSTANT PEG", tone: "gold" };
  const providers = [...new Set(o.legs.map(legProvider).filter((v): v is string => v != null))];
  if (providers.length > 0) return { label: providers.join(" × "), tone: "default" };
  if (o.legs.length > 0) return { label: "UNKNOWN FEED", tone: "gold" };
  if (o.kind === "feed") return { label: "DIRECT FEED", tone: "default" };
  if (o.kind == null) return { label: "UNRESOLVED", tone: "gold" };
  if (o.kind === "opaque" || o.kind === "oracle") return { label: "UNVERIFIED", tone: "gold" };
  return { label: o.kind.toUpperCase(), tone: "default" };
}

// Every address in a market's oracle block — the oracle contract, each
// composition leg, and the MODT primary/backup oracles with their legs.
// Feeds the market table's search haystack, so a market is findable by any
// contract in its pricing path.
export function oracleAddresses(o: OracleBlock | null | undefined): string[] {
  if (!o) return [];
  const out = new Set<string>([o.address]);
  for (const leg of o.legs) out.add(leg.address);
  if (o.modt) {
    for (const side of [o.modt.primary, o.modt.backup]) {
      out.add(side.address);
      for (const leg of side.legs) out.add(leg.address);
    }
  }
  return [...out];
}

// The set of provider tokens a market's oracle depends on — the ORACLE
// filter's vocabulary. MODT wrappers contribute their author AND their
// failover legs' providers; markets with nothing identifiable land in the
// honest buckets (BROKEN / UNVERIFIED / UNRESOLVED) so they stay findable.
export function oracleProviders(o: OracleBlock | null | undefined): string[] {
  if (!o) return ["UNRESOLVED"];
  const out = new Set<string>();
  if (o.family === "meta-deviation-timelock") out.add("STEAKHOUSE");
  if (o.family === "curve-stableswap") out.add("STAKEDAO");
  if (o.family === "constant-peg") out.add("CONSTANT PEG");
  for (const leg of allLegs(o)) {
    const p = legProvider(leg);
    if (p) out.add(p);
  }
  if (out.size === 0) {
    out.add(o.broken ? "BROKEN" : o.kind == null ? "UNRESOLVED" : "UNVERIFIED");
  }
  return [...out];
}

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
