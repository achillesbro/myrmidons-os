import { NextRequest, NextResponse } from "next/server";
import {
  morphoGraphQLFetch,
  buildVaultApyQuery,
  isValidAddress,
} from "@/lib/morpho/client";
import { VaultApySchema } from "@/lib/morpho/schemas";
import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const chainIdParam = request.nextUrl.searchParams.get("chainId");
    const chainId = chainIdParam ? parseInt(chainIdParam, 10) : 1; // Default to Ethereum mainnet

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

    // Build and execute GraphQL query
    const query = buildVaultApyQuery(address, chainId);
    const response = await morphoGraphQLFetch(query, { chainId });

    const data = await response.json();

    const validated = VaultApySchema.parse(data);

    return NextResponse.json(validated, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
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
    }

    return createErrorResponse(
      ErrorCodes.UNKNOWN,
      "An unexpected error occurred",
      500
    );
  }
}

