import { RiskMarketsSchema, type RiskMarkets } from "./schemas";

// Browser fetchers for the risk API, via the same-origin /api/risk proxy
// (whitelist + edge caching + Zod validation server-side; parsed again here
// so callers get typed data even if the proxy is bypassed in dev).

export async function fetchRiskMarkets(): Promise<RiskMarkets> {
  const res = await fetch("/api/risk/markets");
  if (!res.ok) throw new Error(`risk markets failed: ${res.status}`);
  return RiskMarketsSchema.parse(await res.json());
}
