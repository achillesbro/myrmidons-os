import { NextRequest, NextResponse } from "next/server";
import { MarketHealthSchema, UtilSpellsSchema } from "@/lib/mnemon/schemas";
import { ErrorCodes, createErrorResponse } from "@/lib/http/errors";
import type { ZodTypeAny } from "zod";

// Proxy for the MNEMON archive's static JSON snapshots. The data host serves
// them publicly (no token); this route exists so the FE has a same-origin
// endpoint, a revalidate cache, and schema validation. Env MNEMON_DATA_URL
// overrides the host (defaults to the production data subdomain).
const DATA_BASE = process.env.MNEMON_DATA_URL || "https://data.myrmidons-strategies.com";

// Whitelist request slug -> (upstream file, validator). Anything else 404s, so
// the route can never be pointed at an arbitrary upstream path.
const SNAPSHOTS: Record<string, { file: string; schema: ZodTypeAny }> = {
  "market-health": { file: "market_health.json", schema: MarketHealthSchema },
  "util-spells": { file: "util_spells.json", schema: UtilSpellsSchema },
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
    // revalidate caches the upstream fetch for 120s across requests; the source
    // only changes every 15 min so this is safely fresh.
    const upstream = await fetch(`${DATA_BASE}/${spec.file}`, {
      next: { revalidate: 120 },
    });

    if (!upstream.ok) {
      return createErrorResponse(
        ErrorCodes.UPSTREAM_ERROR,
        `MNEMON data host returned ${upstream.status}`,
        502
      );
    }

    const validated = spec.schema.parse(await upstream.json());

    return NextResponse.json(validated, {
      headers: {
        "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
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
