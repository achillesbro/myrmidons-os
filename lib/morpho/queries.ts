import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchVaultMetadata,
  fetchVaultAllocations,
  fetchVaultApy,
  fetchVaultHistory,
  fetchVaultMarkets,
  type NormalizedMarket,
} from "./browser";
import type { VaultMetadata, VaultAllocations, VaultApy, HistoryPoint } from "./schemas";

export function useVaultMetadata(
  address: string,
  chainId: number = 1
): UseQueryResult<VaultMetadata, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "metadata", address, chainId],
    queryFn: () => fetchVaultMetadata(address, chainId),
    enabled: !!address,
  });
}

export function useVaultAllocations(
  address: string,
  chainId: number = 1
): UseQueryResult<VaultAllocations, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "allocations", address, chainId],
    queryFn: () => fetchVaultAllocations(address, chainId),
    enabled: !!address,
  });
}

export function useVaultApy(
  address: string,
  chainId: number = 1
): UseQueryResult<VaultApy, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "apy", address, chainId],
    queryFn: () => fetchVaultApy(address, chainId),
    enabled: !!address,
  });
}

export function useVaultHistory(
  address: string,
  range: string = "7d",
  chainId: number = 1
): UseQueryResult<HistoryPoint[], Error> {
  // Determine refetch interval based on range
  const refetchInterval =
    range === "1d" || range === "7d" ? 60_000 : 300_000; // 60s for short, 300s for long

  return useQuery({
    queryKey: ["morpho", "vault", "history", address, range, chainId],
    queryFn: () => fetchVaultHistory(address, range, chainId),
    enabled: !!address,
    refetchInterval,
  });
}

export function useVaultMarkets(
  address: string,
  chainId: number = 1
): UseQueryResult<{ markets: NormalizedMarket[] }, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "markets", address, chainId],
    queryFn: () => fetchVaultMarkets(address, chainId),
    enabled: !!address,
    refetchInterval: 60_000, // 60 seconds
  });
}

