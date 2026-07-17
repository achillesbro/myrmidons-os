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

// Pass v2=true for Morpho Vault V2 vaults (served by the vaultV2ByAddress API
// entity); responses are normalized server-side to the same V1 shape.

export function useVaultMetadata(
  address: string,
  chainId: number = 1,
  v2: boolean = false
): UseQueryResult<VaultMetadata, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "metadata", address, chainId, v2],
    queryFn: () => fetchVaultMetadata(address, chainId, v2),
    enabled: !!address,
  });
}

export function useVaultAllocations(
  address: string,
  chainId: number = 1,
  v2: boolean = false
): UseQueryResult<VaultAllocations, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "allocations", address, chainId, v2],
    queryFn: () => fetchVaultAllocations(address, chainId, v2),
    enabled: !!address,
  });
}

export function useVaultApy(
  address: string,
  chainId: number = 1,
  v2: boolean = false
): UseQueryResult<VaultApy, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "apy", address, chainId, v2],
    queryFn: () => fetchVaultApy(address, chainId, v2),
    enabled: !!address,
  });
}

export function useVaultHistory(
  address: string,
  range: string = "7d",
  chainId: number = 1,
  v2: boolean = false
): UseQueryResult<HistoryPoint[], Error> {
  // Determine refetch interval based on range
  const refetchInterval =
    range === "1d" || range === "7d" ? 60_000 : 300_000; // 60s for short, 300s for long

  return useQuery({
    queryKey: ["morpho", "vault", "history", address, range, chainId, v2],
    queryFn: () => fetchVaultHistory(address, range, chainId, v2),
    enabled: !!address,
    refetchInterval,
  });
}

export function useVaultMarkets(
  address: string,
  chainId: number = 1,
  v2: boolean = false
): UseQueryResult<{ markets: NormalizedMarket[] }, Error> {
  return useQuery({
    queryKey: ["morpho", "vault", "markets", address, chainId, v2],
    queryFn: () => fetchVaultMarkets(address, chainId, v2),
    enabled: !!address,
    refetchInterval: 60_000, // 60 seconds
  });
}
