import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchMarketHealth, fetchUtilSpells } from "./browser";
import type { MarketHealth, UtilSpells } from "./schemas";

// MNEMON is a 15-min archive, not a live feed: the snapshots regenerate every
// 15 min on the VPS and the API proxy caches for 120s. Refetching every 2 min
// keeps the FE roughly as fresh as the source without hammering it.

export function useMarketHealth(): UseQueryResult<MarketHealth, Error> {
  return useQuery({
    queryKey: ["mnemon", "market-health"],
    queryFn: fetchMarketHealth,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useUtilSpells(): UseQueryResult<UtilSpells, Error> {
  return useQuery({
    queryKey: ["mnemon", "util-spells"],
    queryFn: fetchUtilSpells,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });
}
