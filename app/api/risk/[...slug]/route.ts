import { NextRequest, NextResponse } from "next/server";
import { MetricHistorySchema, RiskMarketsSchema } from "@/lib/risk/schemas";
import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";
import type { ZodTypeAny } from "zod";

// Proxy for the myrmidons-api static risk JSON (same rationale as
// /api/mnemon/*: same-origin endpoint, bounded edge caching, schema
// validation). Env RISK_API_URL overrides the host.
const API_BASE = process.env.RISK_API_URL || "https://api.myrmidons-strategies.com";

const MARKET_ID = /^0x[0-9a-f]{64}$/;
const METRIC = /^[a-z0-9_]{1,40}$/;

// Resolve the request slug to (upstream path, validator); null 404s, so the
// route can never be pointed at an arbitrary upstream path.
function resolve(slug: string[]): { path: string; schema: ZodTypeAny } | null {
  if (slug.length === 1 && slug[0] === "markets") {
    return { path: "v1/risk/markets.json", schema: RiskMarketsSchema };
  }
  if (
    slug.length === 4 &&
    slug[0] === "markets" &&
    MARKET_ID.test(slug[1]) &&
    slug[2] === "history" &&
    METRIC.test(slug[3])
  ) {
    return {
      path: `v1/risk/markets/${slug[1]}/history/${slug[3]}.json`,
      schema: MetricHistorySchema,
    };
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const spec = resolve(slug ?? []);
  if (!spec) {
    return createErrorResponse(
      ErrorCodes.INVALID_PARAM,
      `Unknown risk endpoint: ${(slug ?? []).join("/")}`,
      404
    );
  }

  try {
    // no-store: same reasoning as /api/mnemon — freshness is bounded by the
    // edge cache below, never by Next's unbounded stale-while-revalidate.
    const upstream = await fetch(`${API_BASE}/${spec.path}`, { cache: "no-store" });
    if (!upstream.ok) {
      return createErrorResponse(
        ErrorCodes.UPSTREAM_ERROR,
        `risk API returned ${upstream.status}`,
        502
      );
    }
    const validated = spec.schema.parse(await upstream.json());
    return NextResponse.json(validated, {
      headers: {
        "Cache-Control":
          "public, max-age=0, must-revalidate, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("timeout") || error.name === "AbortError")
    ) {
      return createErrorResponse(ErrorCodes.TIMEOUT, "risk API request timed out", 504);
    }
    return createErrorResponse(
      ErrorCodes.UPSTREAM_ERROR,
      "Failed to load or validate risk data",
      502
    );
  }
}
