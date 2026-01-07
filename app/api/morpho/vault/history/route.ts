import { NextRequest, NextResponse } from "next/server";
import {
  morphoGraphQLFetch,
  buildVaultHistoryQuery,
  getTimeRange,
  isValidAddress,
} from "@/lib/morpho/client";
import { VaultHistorySchema, HistoryPointSchema } from "@/lib/morpho/schemas";
import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";

const VALID_RANGES = ["1d", "7d", "30d", "all"];

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const chainIdParam = request.nextUrl.searchParams.get("chainId");
    const range = request.nextUrl.searchParams.get("range") || "7d";
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

    if (!VALID_RANGES.includes(range.toLowerCase())) {
      return createErrorResponse(
        ErrorCodes.INVALID_PARAM,
        `Invalid range. Must be one of: ${VALID_RANGES.join(", ")}`,
        400
      );
    }

    // Calculate time range
    const { startTimestamp, endTimestamp, interval } = getTimeRange(range);

    // Build and execute GraphQL query
    const query = buildVaultHistoryQuery(
      address,
      chainId,
      startTimestamp,
      endTimestamp,
      interval
    );
    const response = await morphoGraphQLFetch(query, { chainId });

    const data = await response.json();

    let validated;
    try {
      validated = VaultHistorySchema.parse(data);
    } catch (validationError) {
      if (process.env.NODE_ENV === "development") {
        console.error("[history] Zod validation error:", validationError);
      }
      validated = data;
    }

    // Normalize the response to frontend-friendly format
    const apySeries = validated?.vaultByAddress?.historicalState?.netApy || [];
    const tvlSeries = validated?.vaultByAddress?.historicalState?.totalAssetsUsd || [];

    // Merge series by timestamp (x is Unix timestamp in seconds)
    // Convert to milliseconds for frontend
    const pointsMap = new Map<number, { t: number; apy?: number | null; tvlUsd?: number | null }>();

    apySeries.forEach((point: { x: number; y?: number | null }) => {
      const t = point.x * 1000; // Convert to milliseconds
      const existing = pointsMap.get(t) || { t };
      existing.apy = point.y !== undefined ? point.y : null;
      pointsMap.set(t, existing);
    });

    tvlSeries.forEach((point: { x: number; y?: number | null }) => {
      const t = point.x * 1000; // Convert to milliseconds
      const existing = pointsMap.get(t) || { t };
      existing.tvlUsd = point.y !== undefined ? point.y : null;
      pointsMap.set(t, existing);
    });

    // Convert map to sorted array
    const normalizedPoints = Array.from(pointsMap.values())
      .sort((a, b) => a.t - b.t)
      .map((point) => {
        // Validate each point
        const validatedPoint = HistoryPointSchema.parse(point);
        return validatedPoint;
      });

    // Determine cache time based on range
    const cacheTime = range === "1d" || range === "7d" ? 60 : 300; // 60s for short, 300s for long

    return NextResponse.json(normalizedPoints, {
      headers: {
        "Cache-Control": `public, s-maxage=${cacheTime}, stale-while-revalidate=${cacheTime * 2}`,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[history] Error details:", error);
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

