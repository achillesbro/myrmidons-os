import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
const DEFAULT_GRAPHQL_URL = "https://api.morpho.org/graphql";

export function getMorphoGraphQLUrl(): string {
  // Use env var if provided, otherwise use default
  return process.env.MORPHO_API_BASE_URL || DEFAULT_GRAPHQL_URL;
}

export interface GraphQLQuery {
  query: string;
  variables?: Record<string, unknown>;
}

export interface MorphoFetchOptions {
  timeout?: number;
  chainId?: number; // Default chain ID (1 for Ethereum mainnet)
}

export async function morphoGraphQLFetch(
  query: GraphQLQuery,
  options: MorphoFetchOptions = {}
): Promise<Response> {
  const graphqlUrl = getMorphoGraphQLUrl();
  const { timeout = DEFAULT_TIMEOUT_MS, chainId = 1 } = options;

  // Add API key if provided
  const apiKey = process.env.MORPHO_API_KEY;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(query),
      signal: controller.signal,
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Upstream API returned ${response.status}: ${response.statusText}`);
    }

    // Check for GraphQL errors in response
    const data = await response.json();
    if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
      const errorMessages = data.errors.map((e: { message: string }) => e.message).join(", ");
      throw new Error(`GraphQL errors: ${errorMessages}`);
    }

    // Return a Response-like object with the data
    return new Response(JSON.stringify(data.data || data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error("Request timeout: upstream API did not respond in time");
      }
      throw error;
    }
    throw new Error("Unknown error occurred while fetching from upstream API");
  }
}

// Validate EVM address format
export function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// Helper to build vault metadata query
export function buildVaultMetadataQuery(address: string, chainId: number = 1): GraphQLQuery {
  return {
    query: `
      query VaultMetadata($address: String!, $chainId: Int!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          name
          symbol
          asset {
            address
            symbol
            decimals
            yield {
              apr
            }
          }
          state {
            totalAssets
            totalAssetsUsd
            totalSupply
            sharePrice
            sharePriceUsd
            apy
            netApy
          }
        }
      }
    `,
    variables: { address, chainId },
  };
}

// Helper to build vault allocations query
export function buildVaultAllocationsQuery(address: string, chainId: number = 1): GraphQLQuery {
  return {
    query: `
      query VaultAllocations($address: String!, $chainId: Int!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          state {
            totalAssetsUsd
            allocation {
              supplyQueueIndex
              withdrawQueueIndex
              supplyAssets
              supplyAssetsUsd
              supplyCap
              market {
                uniqueKey
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
                  rewards {
                    supplyApr
                  }
                }
              }
            }
          }
        }
      }
    `,
    variables: { address, chainId },
  };
}

// Helper to build vault APY query
export function buildVaultApyQuery(address: string, chainId: number = 1): GraphQLQuery {
  return {
    query: `
      query VaultApy($address: String!, $chainId: Int!) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          state {
            sharePrice
            sharePriceUsd
            apy
            netApy
          }
        }
      }
    `,
    variables: { address, chainId },
  };
}

