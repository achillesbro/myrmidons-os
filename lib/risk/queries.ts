"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchMetricHistory, fetchRiskMarkets } from "./browser";
import type { MetricHistory, RiskMarkets } from "./schemas";

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

// One metric's full series for one market. Fetched lazily (enabled) — only
// when the chart toggle selects it — and kept for the session (history only
// grows by one point an hour).
export function useMetricHistory(
  marketId: string,
  metric: string,
  enabled: boolean
): UseQueryResult<MetricHistory, Error> {
  return useQuery({
    queryKey: ["risk", "history", marketId, metric],
    queryFn: () => fetchMetricHistory(marketId, metric),
    enabled,
    staleTime: 30 * 60_000,
  });
}
