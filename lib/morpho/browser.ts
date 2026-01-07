import type { VaultMetadata, VaultAllocations, VaultApy } from "./schemas";

export class MorphoApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string
  ) {
    super(message);
    this.name = "MorphoApiError";
  }
}

export async function fetchVaultMetadata(
  address: string,
  chainId: number = 1
): Promise<VaultMetadata> {
  const url = `/api/morpho/vault/metadata?address=${encodeURIComponent(
    address
  )}&chainId=${chainId}`;
  const res = await fetch(url);

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new MorphoApiError(
      error.error?.message || `Failed to fetch vault metadata: ${res.statusText}`,
      res.status,
      error.error?.code
    );
  }

  return res.json();
}

export async function fetchVaultAllocations(
  address: string,
  chainId: number = 1
): Promise<VaultAllocations> {
  const url = `/api/morpho/vault/allocations?address=${encodeURIComponent(
    address
  )}&chainId=${chainId}`;
  const res = await fetch(url);

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new MorphoApiError(
      error.error?.message ||
        `Failed to fetch vault allocations: ${res.statusText}`,
      res.status,
      error.error?.code
    );
  }

  return res.json();
}

export async function fetchVaultApy(
  address: string,
  chainId: number = 1
): Promise<VaultApy> {
  const url = `/api/morpho/vault/apy?address=${encodeURIComponent(
    address
  )}&chainId=${chainId}`;
  const res = await fetch(url);

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new MorphoApiError(
      error.error?.message || `Failed to fetch vault APY: ${res.statusText}`,
      res.status,
      error.error?.code
    );
  }

  return res.json();
}

