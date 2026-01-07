import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  fetchVaultMetadata,
  fetchVaultAllocations,
  fetchVaultApy,
} from "./browser";
import type { VaultMetadata, VaultAllocations, VaultApy } from "./schemas";

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

