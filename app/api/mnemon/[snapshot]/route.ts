import { NextRequest, NextResponse } from "next/server";
import {
  DepegSpellsSchema,
  MarketFlowsSchema,
  MarketHealthSchema,
  UtilSpellsSchema,
} from "@/lib/mnemon/schemas";
import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";
import type { ZodTypeAny } from "zod";

// Proxy for the MNEMON archive's static JSON snapshots. The data host serves
// them publicly (no token); this route exists so the FE has a same-origin
// endpoint, bounded edge caching, and schema validation. Env MNEMON_DATA_URL
// overrides the host (defaults to the production data subdomain).
const DATA_BASE = process.env.MNEMON_DATA_URL || "https://data.myrmidons-strategies.com";

// Whitelist request slug -> (upstream file, validator). Anything else 404s, so
// the route can never be pointed at an arbitrary upstream path.
const SNAPSHOTS: Record<string, { file: string; schema: ZodTypeAny }> = {
  "market-health": { file: "market_health.json", schema: MarketHealthSchema },
  "util-spells": { file: "util_spells.json", schema: UtilSpellsSchema },
  "market-flows": { file: "market_flows.json", schema: MarketFlowsSchema },
  "depeg-spells": { file: "depeg_spells.json", schema: DepegSpellsSchema },
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ snapshot: string }> }
) {
  const { snapshot } = await params;
  const spec = SNAPSHOTS[snapshot];
  if (!spec) {
    return createErrorResponse(
      ErrorCodes.INVALID_PARAM,
      `Unknown MNEMON snapshot: ${snapshot}`,
      404
    );
  }

  try {
    // no-store: bypass Next's persistent Data Cache. Its serve-stale-while-
    // revalidating behaviour is UNBOUNDED when background revalidation fails
    // (observed live: hours-old snapshots on every refresh while the data
    // host was fresh). Freshness is instead bounded by the edge cache on the
    // response below — worst case s-maxage + swr = 3 min — and an upstream
    // failure surfaces as an error instead of silently ancient data.
    const upstream = await fetch(`${DATA_BASE}/${spec.file}`, {
      cache: "no-store",
    });

    if (!upstream.ok) {
      return createErrorResponse(
        ErrorCodes.UPSTREAM_ERROR,
        `MNEMON data host returned ${upstream.status}`,
        502
      );
    }

    const validated = spec.schema.parse(await upstream.json());

    // max-age=0 + must-revalidate: the BROWSER always revalidates with the
    // edge on refresh (the bare `public` it received before permitted
    // heuristic caching); the edge keeps serving cached copies for s-maxage
    // and may serve stale for at most stale-while-revalidate beyond that.
    // swr=60 (was 300): with the 10-min export cadence the worst-case
    // displayed age stays ~13 min instead of ~29.
    return NextResponse.json(validated, {
      headers: {
        "Cache-Control":
          "public, max-age=0, must-revalidate, s-maxage=120, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("timeout") || error.name === "AbortError")
    ) {
      return createErrorResponse(
        ErrorCodes.TIMEOUT,
        "MNEMON data request timed out",
        504
      );
    }
    return createErrorResponse(
      ErrorCodes.UPSTREAM_ERROR,
      "Failed to load or validate MNEMON data",
      502
    );
  }
}
