import type { DepegSpells, MarketFlows, MarketHealth, UtilSpells } from "./schemas";

// Browser-side fetchers for the MNEMON snapshots, going through our own API
// proxy (/api/mnemon/*) so the FE never talks to the data host directly and
// benefits from the route's revalidate cache. Mirrors lib/morpho/browser.ts.

export class MnemonApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = "MnemonApiError";
  }
}

async function fetchSnapshot<T>(slug: string): Promise<T> {
  const res = await fetch(`/api/mnemon/${slug}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new MnemonApiError(
      error.error?.message || `Failed to fetch MNEMON ${slug}: ${res.statusText}`,
      res.status,
      error.error?.code
    );
  }
  return res.json();
}

export function fetchMarketHealth(): Promise<MarketHealth> {
  return fetchSnapshot<MarketHealth>("market-health");
}

export function fetchUtilSpells(): Promise<UtilSpells> {
  return fetchSnapshot<UtilSpells>("util-spells");
}

export function fetchMarketFlows(): Promise<MarketFlows> {
  return fetchSnapshot<MarketFlows>("market-flows");
}

export function fetchDepegSpells(): Promise<DepegSpells> {
  return fetchSnapshot<DepegSpells>("depeg-spells");
}
