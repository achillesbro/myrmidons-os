/**
 * Morpho Vault V2 data layer (server-side).
 *
 * The Morpho API serves V2 vaults through a different entity (vaultV2ByAddress)
 * with a different shape: fields live directly on the vault (no `state` wrapper),
 * there is no `allocation` array (positions are held by the vault's adapter in
 * MarketV1 markets), and the APY history series is `avgNetApy` instead of `netApy`.
 *
 * Everything here queries the V2 entities and normalizes the responses into the
 * V1 `vaultByAddress` shape the rest of the frontend already consumes
 * (schemas.ts / view.ts / pickKpis / pickAllocations), so the same components
 * work for both vault generations.
 */

import { morphoGraphQLFetch, type GraphQLQuery } from "./client";

function num(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  return Number.isNaN(n) ? null : n;
}

// ── Queries ──────────────────────────────────────────────────────

export function buildVaultV2MetadataQuery(address: string, chainId: number): GraphQLQuery {
  return {
    query: `
      query VaultV2Metadata($address: String!, $chainId: Int!) {
        vaultV2ByAddress(address: $address, chainId: $chainId) {
          address
          name
          symbol
          asset {
            address
            symbol
            decimals
            price {
              usd
            }
          }
          totalAssets
          totalAssetsUsd
          totalSupply
          sharePrice
          apy
          netApy
        }
      }
    `,
    variables: { address, chainId },
  };
}

export function buildVaultV2HistoryQuery(
  address: string,
  chainId: number,
  startTimestamp: number,
  endTimestamp: number,
  interval: string
): GraphQLQuery {
  return {
    query: `
      query VaultV2History($address: String!, $chainId: Int!, $options: TimeseriesOptions!) {
        vaultV2ByAddress(address: $address, chainId: $chainId) {
          address
          historicalState {
            avgNetApy(options: $options) {
              x
              y
            }
            totalAssetsUsd(options: $options) {
              x
              y
            }
          }
        }
      }
    `,
    variables: {
      address,
      chainId,
      options: { startTimestamp, endTimestamp, interval },
    },
  };
}

function buildVaultV2AllocationBaseQuery(address: string, chainId: number): GraphQLQuery {
  return {
    query: `
      query VaultV2AllocationBase($address: String!, $chainId: Int!) {
        vaultV2ByAddress(address: $address, chainId: $chainId) {
          address
          totalAssetsUsd
          idleAssets
          idleAssetsUsd
          asset {
            address
            symbol
            decimals
          }
          adapters {
            items {
              address
              type
            }
          }
        }
      }
    `,
    variables: { address, chainId },
  };
}

function buildAdapterPositionsQuery(adapterAddress: string, chainId: number): GraphQLQuery {
  return {
    query: `
      query VaultV2AdapterPositions($address: String!, $chainId: Int!) {
        marketPositions(where: {userAddress_in: [$address], chainId_in: [$chainId]}) {
          items {
            state {
              supplyAssets
              supplyAssetsUsd
            }
            market {
              marketId
              loanAsset {
                address
                symbol
                decimals
              }
              collateralAsset {
                address
                symbol
                decimals
              }
              state {
                supplyAssets
                borrowAssets
                utilization
                supplyApy
              }
            }
          }
        }
      }
    `,
    variables: { address: adapterAddress, chainId },
  };
}

// ── Fetch + normalize to the V1 vaultByAddress shape ─────────────

export async function fetchV2MetadataAsV1(address: string, chainId: number) {
  const response = await morphoGraphQLFetch(buildVaultV2MetadataQuery(address, chainId), {
    chainId,
  });
  const data = await response.json();
  const vault = data?.vaultV2ByAddress;
  if (!vault) return { vaultByAddress: null };

  const sharePrice = num(vault.sharePrice);
  const assetPriceUsd = num(vault.asset?.price?.usd);
  const sharePriceUsd =
    sharePrice !== null && assetPriceUsd !== null ? sharePrice * assetPriceUsd : undefined;

  return {
    vaultByAddress: {
      address: vault.address,
      name: vault.name ?? undefined,
      symbol: vault.symbol ?? undefined,
      asset: vault.asset
        ? {
            address: vault.asset.address,
            symbol: vault.asset.symbol,
            decimals: vault.asset.decimals,
          }
        : undefined,
      state: {
        totalAssets: vault.totalAssets ?? undefined,
        totalAssetsUsd: vault.totalAssetsUsd ?? undefined,
        totalSupply: vault.totalSupply ?? undefined,
        sharePriceNumber: sharePrice ?? undefined,
        sharePriceUsd,
        apy: vault.apy ?? undefined,
        netApy: vault.netApy ?? undefined,
      },
    },
  };
}

export async function fetchV2ApyAsV1(address: string, chainId: number) {
  const full = await fetchV2MetadataAsV1(address, chainId);
  if (!full.vaultByAddress) return { vaultByAddress: null };
  const { address: vaultAddress, state } = full.vaultByAddress;
  return {
    vaultByAddress: {
      address: vaultAddress,
      state: {
        apy: state.apy,
        netApy: state.netApy,
        sharePriceNumber: state.sharePriceNumber,
        sharePriceUsd: state.sharePriceUsd,
      },
    },
  };
}

export async function fetchV2HistoryAsV1(
  address: string,
  chainId: number,
  startTimestamp: number,
  endTimestamp: number,
  interval: string
) {
  const response = await morphoGraphQLFetch(
    buildVaultV2HistoryQuery(address, chainId, startTimestamp, endTimestamp, interval),
    { chainId }
  );
  const data = await response.json();
  const vault = data?.vaultV2ByAddress;
  if (!vault) return { vaultByAddress: null };

  return {
    vaultByAddress: {
      address: vault.address,
      historicalState: {
        // V2 exposes avgNetApy instead of netApy; same TimeseriesPoint shape.
        netApy: vault.historicalState?.avgNetApy ?? [],
        totalAssetsUsd: vault.historicalState?.totalAssetsUsd ?? [],
      },
    },
  };
}

/**
 * V2 has no allocation array: the vault's MarketV1 adapter holds the per-market
 * positions, and un-deployed funds are first-class idleAssets. Rebuild the V1
 * allocation shape from (adapter marketPositions + idle), so pickAllocations
 * and the markets route work unchanged. Idle is emitted like V1's idle market:
 * loanAsset only, no collateral (labelled by the asset symbol downstream).
 */
export async function fetchV2AllocationsAsV1(address: string, chainId: number) {
  const baseResponse = await morphoGraphQLFetch(buildVaultV2AllocationBaseQuery(address, chainId), {
    chainId,
  });
  const baseData = await baseResponse.json();
  const vault = baseData?.vaultV2ByAddress;
  if (!vault) return { vaultByAddress: null };

  const adapters: Array<{ address: string; type?: string }> = vault.adapters?.items ?? [];
  const marketAdapter =
    adapters.find((a) => a.type === "MorphoMarketV1") ?? adapters[0] ?? null;

  let positions: Array<{
    state?: { supplyAssets?: unknown; supplyAssetsUsd?: unknown };
    market?: unknown;
  }> = [];
  if (marketAdapter) {
    const positionsResponse = await morphoGraphQLFetch(
      buildAdapterPositionsQuery(marketAdapter.address, chainId),
      { chainId }
    );
    const positionsData = await positionsResponse.json();
    positions = positionsData?.marketPositions?.items ?? [];
  }

  const allocation = positions.map((position) => ({
    supplyAssets: position.state?.supplyAssets ?? undefined,
    supplyAssetsUsd: position.state?.supplyAssetsUsd ?? undefined,
    market: position.market,
  }));

  const idleAssets = num(vault.idleAssets);
  if (idleAssets !== null && idleAssets > 0) {
    allocation.push({
      supplyAssets: vault.idleAssets,
      supplyAssetsUsd: vault.idleAssetsUsd ?? undefined,
      market: {
        marketId: "idle",
        loanAsset: vault.asset
          ? {
              address: vault.asset.address,
              symbol: vault.asset.symbol,
              decimals: vault.asset.decimals,
            }
          : undefined,
        collateralAsset: null,
        state: { supplyAssets: vault.idleAssets, borrowAssets: 0, utilization: 0, supplyApy: 0 },
      },
    });
  }

  return {
    vaultByAddress: {
      address: vault.address,
      state: {
        totalAssetsUsd: vault.totalAssetsUsd ?? undefined,
        allocation,
      },
    },
  };
}

/** Route helper: `?v2=true|1` selects the Vault V2 data path. */
export function isV2Param(value: string | null): boolean {
  return value === "true" || value === "1";
}
