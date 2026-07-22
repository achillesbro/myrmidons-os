import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchDepegSpells,
  fetchMarketFlows,
  fetchMarketHealth,
  fetchUtilSpells,
} from "./browser";
import type { DepegSpells, MarketFlows, MarketHealth, UtilSpells } from "./schemas";

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

export function useMarketFlows(): UseQueryResult<MarketFlows, Error> {
  return useQuery({
    queryKey: ["mnemon", "market-flows"],
    queryFn: fetchMarketFlows,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useDepegSpells(): UseQueryResult<DepegSpells, Error> {
  return useQuery({
    queryKey: ["mnemon", "depeg-spells"],
    queryFn: fetchDepegSpells,
    staleTime: 120_000,
    refetchInterval: 300_000,
  });
}
