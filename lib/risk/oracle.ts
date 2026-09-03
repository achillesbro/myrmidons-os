import type { OracleBlock, OracleLeg } from "./schemas";

// Shared oracle-identity logic for the ORACLE panel, the table badges, the
// ORACLE filter and the search haystack. Works on the risk API's oracle
// block (api schema 1.3): vendors are evidence-graded upstream, so the
// display layer only names a brand a feed CLAIMS (from its description)
// when the data layer could not verify one — and says so (confidence
// "claimed").

export type ProviderTone = "danger" | "gold" | "default";
export type Confidence = "verified" | "claimed" | "none";

// Data-layer vendors (registry / canonical-contract / code-signature grade).
const VENDOR_SHORT: Record<string, string> = {
  Chainlink: "CHAINLINK",
  Pyth: "PYTH",
  Stork: "STORK",
  RedStone: "REDSTONE",
  API3: "API3",
  Chronicle: "CHRONICLE",
  ERC4626: "ERC4626",
};

// Brand a feed claims for itself in description(), used ONLY when the data
// layer has no verified vendor. Order matters: PENDLE before the chainlink
// pattern ("Pendle Chainlink-compatible Oracle"), OJO before PENDLE ("Ojo PT
// Feed Pendle Chainlink-compatible Oracle").
const DESC_PROVIDER: [RegExp, string][] = [
  [/\bojo\b/i, "OJO"],
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

// Custom-oracle families (from the verified source name) -> author / label.
const FAMILY_LABEL: Record<string, string> = {
  "meta-deviation-timelock": "STEAKHOUSE",
  "curve-stableswap": "STAKEDAO",
  "constant-peg": "CONSTANT PEG",
  "pendle-pt": "PENDLE PT",
  "mux-lp": "MUX LP",
  "oval-wrapper": "UMA OVAL",
  "fixed-feed": "FIXED FEED",
  clamp: "CLAMPED",
  router: "ROUTER",
  "chainlink-code": "CHAINLINK-CODE",
  "exchange-rate-adapter": "EXCHANGE RATE",
  "dex-twap": "DEX TWAP",
  "nav-adapter": "NAV",
};

// Families whose price is derived (not spot) by construction: deviation vs
// the DefiLlama spot cross is a fingerprint, not a depeg.
const STRUCTURAL_FAMILIES = new Set([
  "constant-peg",
  "curve-stableswap",
  "pendle-pt",
  "mux-lp",
  "fixed-feed",
  "exchange-rate-adapter",
  "nav-adapter",
]);
const STRUCTURAL_DESC = /pendle|exchange rate|redemption rate|\bnav\b/i;

type Leg = OracleLeg | NonNullable<OracleBlock["upstream"]>[number];

// A leg's provider and whether it is verified (data layer) or merely
// claimed (our description regex).
export function legProvider(leg: Leg): { name: string; confidence: Confidence } | null {
  if (leg.vendor && leg.vendor in VENDOR_SHORT) {
    const verified = leg.vendor_evidence == null || leg.vendor_evidence !== "description";
    return { name: VENDOR_SHORT[leg.vendor], confidence: verified ? "verified" : "claimed" };
  }
  for (const [re, name] of DESC_PROVIDER) {
    if (leg.description && re.test(leg.description)) return { name, confidence: "claimed" };
  }
  return null;
}

function allLegs(o: OracleBlock): Leg[] {
  return [
    ...o.legs,
    ...(o.upstream ?? []),
    ...(o.modt ? [...o.modt.primary.legs, ...o.modt.backup.legs] : []),
  ];
}

// One-line provider summary for the ORACLE panel: the family author for
// bespoke oracles (with the upstream providers for wrappers), else the
// distinct providers of the legs, else honest fallbacks. `confidence` is
// "claimed" whenever any named provider rests on a self-description only.
export function oracleProvider(o: OracleBlock): {
  label: string;
  tone: ProviderTone;
  confidence: Confidence;
} {
  if (o.broken) return { label: `BROKEN (${o.broken.toUpperCase()})`, tone: "danger", confidence: "verified" };
  const legs = [...o.legs, ...(o.upstream ?? [])];
  const found = legs.map(legProvider).filter((p): p is NonNullable<typeof p> => p != null);
  const names = [...new Set(found.map((p) => p.name))];
  const confidence: Confidence = found.some((p) => p.confidence === "claimed") ? "claimed" : "verified";

  if (o.family && FAMILY_LABEL[o.family]) {
    const author = FAMILY_LABEL[o.family];
    const tone: ProviderTone = o.family === "constant-peg" || o.family === "fixed-feed" ? "gold" : "default";
    // Wrappers/adapters: say what they read ("UMA OVAL → CHAINLINK").
    const upstreamNames = [...new Set((o.upstream ?? []).map(legProvider).filter(Boolean).map((p) => p!.name))];
    if (upstreamNames.length > 0) return { label: `${author} → ${upstreamNames.join(" × ")}`, tone, confidence };
    return { label: author, tone, confidence: "verified" };
  }
  if (names.length > 0) return { label: names.join(" × "), tone: "default", confidence };
  if (legs.length > 0) return { label: "UNKNOWN FEED", tone: "gold", confidence: "none" };
  if (o.kind === "feed") return { label: "DIRECT FEED", tone: "default", confidence: "none" };
  if (o.kind == null) return { label: "UNRESOLVED", tone: "gold", confidence: "none" };
  if (o.kind === "opaque" || o.kind === "oracle") return { label: "UNVERIFIED", tone: "gold", confidence: "none" };
  return { label: o.kind.toUpperCase(), tone: "default", confidence: "none" };
}

// An oracle composing a derived leg deviates from the DefiLlama SPOT cross
// by construction — a fingerprint, not a depeg. Judged through composition
// legs, upstream refs and MODT failover legs; a derived FAMILY on the
// oracle itself counts too.
export function isStructuralOracle(o: OracleBlock | null | undefined): boolean {
  if (!o) return false;
  if (o.family && STRUCTURAL_FAMILIES.has(o.family)) return true;
  return allLegs(o).some(
    (l) =>
      ("role" in l && l.role.endsWith("vault")) ||
      (l.description != null && STRUCTURAL_DESC.test(l.description))
  );
}

// Every address in a market's oracle block — the oracle contract, each
// composition leg, upstream refs, and the MODT primary/backup oracles with
// their legs. Feeds the market table's search haystack.
export function oracleAddresses(o: OracleBlock | null | undefined): string[] {
  if (!o) return [];
  const out = new Set<string>([o.address]);
  for (const leg of o.legs) out.add(leg.address);
  for (const u of o.upstream ?? []) out.add(u.address);
  if (o.modt) {
    for (const side of [o.modt.primary, o.modt.backup]) {
      out.add(side.address);
      for (const leg of side.legs) out.add(leg.address);
    }
  }
  return [...out];
}

// The set of provider tokens a market's oracle depends on — the ORACLE
// filter's vocabulary. Family authors, every leg/upstream/failover provider
// (verified or claimed), and honest buckets for the unidentifiable.
export function oracleProviders(o: OracleBlock | null | undefined): string[] {
  if (!o) return ["UNRESOLVED"];
  const out = new Set<string>();
  if (o.family && FAMILY_LABEL[o.family]) out.add(FAMILY_LABEL[o.family]);
  for (const leg of allLegs(o)) {
    const p = legProvider(leg);
    if (p) out.add(p.name);
  }
  if (out.size === 0) {
    out.add(o.broken ? "BROKEN" : o.kind == null ? "UNRESOLVED" : "UNVERIFIED");
  }
  return [...out];
}
