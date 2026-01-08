import { NextRequest, NextResponse } from "next/server";
import {
  morphoGraphQLFetch,
  buildVaultAllocationsQuery,
  isValidAddress,
} from "@/lib/morpho/client";
import { VaultAllocationsSchema } from "@/lib/morpho/schemas";
import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";

/**
 * Normalized market data for strategy scoring
 */
interface NormalizedMarket {
  marketId: string;
  marketLabel: string;
  u: number | null; // utilization (0..1)
  apy: number | null; // APY as decimal
  exitRatio: number | null; // borrowAssets / supplyAssets
  supplied: number | null; // supplyAssets
  availableLiquidity: number | null; // supplyAssets - borrowAssets
  currentAllocationPct: number | null;
}

function safeNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null) return null;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return isNaN(num) ? null : num;
}

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const chainIdParam = request.nextUrl.searchParams.get("chainId");
    const chainId = chainIdParam ? parseInt(chainIdParam, 10) : 1;

    if (!address) {
      return createErrorResponse(
        ErrorCodes.INVALID_PARAM,
        "Missing required parameter: address",
        400
      );
    }

    if (!isValidAddress(address)) {
      return createErrorResponse(
        ErrorCodes.INVALID_PARAM,
        "Invalid address format. Must be a valid EVM address (0x...).",
        400
      );
    }

    // Build and execute GraphQL query (reuse allocations query)
    const query = buildVaultAllocationsQuery(address, chainId);
    const response = await morphoGraphQLFetch(query, { chainId });

    const data = await response.json();

    let validated;
    try {
      validated = VaultAllocationsSchema.parse(data);
    } catch (validationError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[markets] Zod validation error:", validationError);
      }
      validated = data;
    }

    // Normalize market data
    const allocationArray =
      validated?.vaultByAddress?.state?.allocation || [];
    const totalAssetsUsd = safeNumber(
      validated?.vaultByAddress?.state?.totalAssetsUsd
    );

    const markets: NormalizedMarket[] = allocationArray
      .filter((alloc: any) => alloc.market)
      .map((alloc: any) => {
        const market = alloc.market!;
        const marketState = market.state;

        // Extract utilization (0..1)
        const u = safeNumber(marketState?.utilization);

        // Extract APY (decimal)
        const apy = safeNumber(marketState?.supplyApy);

        // Extract supply and borrow assets
        const supplyAssets = safeNumber(marketState?.supplyAssets);
        const borrowAssets = safeNumber(marketState?.borrowAssets);

        // Compute exit ratio: borrowAssets / supplyAssets
        const exitRatio =
          supplyAssets !== null &&
          supplyAssets > 0 &&
          borrowAssets !== null
            ? borrowAssets / supplyAssets
            : null;

        // Compute available liquidity
        const availableLiquidity =
          supplyAssets !== null && borrowAssets !== null
            ? supplyAssets - borrowAssets
            : null;

        // Current allocation percentage
        const supplyAssetsUsd = safeNumber(alloc.supplyAssetsUsd);
        const currentAllocationPct =
          supplyAssetsUsd !== null &&
          totalAssetsUsd !== null &&
          totalAssetsUsd > 0
            ? (supplyAssetsUsd / totalAssetsUsd) * 100
            : null;

        // Build market label
        const loanAsset = market.loanAsset?.symbol;
        const collateralAsset = market.collateralAsset?.symbol;
        let marketLabel: string;
        if (loanAsset && collateralAsset) {
          marketLabel = `${loanAsset} / ${collateralAsset}`;
        } else if (loanAsset) {
          marketLabel = loanAsset;
        } else if (market.uniqueKey) {
          marketLabel = market.uniqueKey.slice(0, 20);
        } else {
          marketLabel = "Unknown";
        }

        return {
          marketId: market.uniqueKey || marketLabel,
          marketLabel,
          u,
          apy,
          exitRatio,
          supplied: supplyAssets,
          availableLiquidity,
          currentAllocationPct,
        };
      });

    return NextResponse.json({ markets }, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[markets] Error details:", error);
    }

    if (error instanceof Error) {
      if (error.message.includes("GraphQL errors")) {
        return createErrorResponse(
          ErrorCodes.UPSTREAM_ERROR,
          error.message,
          502
        );
      }

      if (error.message.includes("timeout") || error.message.includes("AbortError")) {
        return createErrorResponse(
          ErrorCodes.TIMEOUT,
          "Request to upstream API timed out",
          504
        );
      }

      if (error.message.includes("Upstream API")) {
        return createErrorResponse(
          ErrorCodes.UPSTREAM_ERROR,
          error.message,
          502
        );
      }

      return createErrorResponse(
        ErrorCodes.UNKNOWN,
        `An unexpected error occurred: ${error.message}`,
        500
      );
    }

    return createErrorResponse(
      ErrorCodes.UNKNOWN,
      "An unexpected error occurred",
      500
    );
  }
}

