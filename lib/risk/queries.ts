"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchRiskMarkets } from "./browser";
import type { RiskMarkets } from "./schemas";

// TanStack hooks for the risk API. The publisher ships hourly at :40, so a
// 10-min refetch keeps the panel at most one cycle behind without hammering
// the edge cache.

export function useRiskMarkets(): UseQueryResult<RiskMarkets, Error> {
  return useQuery({
    queryKey: ["risk", "markets"],
    queryFn: fetchRiskMarkets,
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });
}
