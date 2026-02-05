/**
 * LiquidSwap route finding. GET https://api.liqd.ag/v2/route
 * Abortable; slippage in percent (0.5 = 50 bps).
 */

import { NATIVE_HYPE_OUT_ADDRESS, WHYPE_ADDRESS } from "./tokens";

const ROUTE_URL = "https://api.liqd.ag/v2/route";

export interface RouteQuote {
  success: boolean;
  message?: string;
  amountOut?: string;
  minAmountOut?: string;
  amountIn?: string;
  averagePriceImpact?: string;
  tokens?: {
    tokenIn: { address: string; symbol: string; name?: string; decimals: number };
    tokenOut: { address: string; symbol: string; name?: string; decimals: number };
    intermediates?: Array<{ address: string; symbol: string; name?: string; decimals: number }>;
  };
  execution?: {
    to: string;
    calldata: string;
    details?: {
      path: string[];
      amountIn: string;
      amountOut: string;
      minAmountOut: string;
      hopSwaps: Array<
        Array<{
          tokenIn: string;
          tokenOut: string;
          routerIndex: number;
          routerName: string;
          fee: number;
          amountIn: string;
          amountOut: string;
          stable: boolean;
          priceImpact: string;
        }>
      >;
    };
  };
}

/**
 * Fetch route quote. tokenIn/tokenOut must be 0x addresses (use WHYPE_ADDRESS for native IN, NATIVE_HYPE_OUT_ADDRESS for native OUT).
 * When tokenOut is native HYPE (dead address), we send WHYPE as tokenOut and rely on unwrapWHYPE for unwrapping.
 * slippagePercent: 0.5 = 50 bps, 1 = 100 bps, 2 = 200 bps.
 */
export async function fetchRoute(
  tokenIn: string,
  tokenOut: string,
  amountInHuman: string,
  slippagePercent: number,
  options?: { unwrapWHYPE?: boolean; multiHop?: boolean; signal?: AbortSignal }
): Promise<RouteQuote> {
  const amount = amountInHuman.trim();
  if (!amount || Number(amount) <= 0) {
    return { success: false };
  }
  const apiTokenOut =
    tokenOut.toLowerCase() === NATIVE_HYPE_OUT_ADDRESS.toLowerCase()
      ? WHYPE_ADDRESS
      : tokenOut;
  const params = new URLSearchParams({
    tokenIn: tokenIn.startsWith("0x") ? tokenIn : tokenIn,
    tokenOut: apiTokenOut.startsWith("0x") ? apiTokenOut : apiTokenOut,
    amountIn: amount,
    slippage: String(Math.max(0.1, Math.min(5, slippagePercent))),
  });
  if (options?.unwrapWHYPE) params.set("unwrapWHYPE", "true");
  if (options?.multiHop) params.set("multiHop", "true");

  const url = `${ROUTE_URL}?${params}`;
  const res = await fetch(url, { signal: options?.signal });
  const status = res.status;
  let body: string | null = null;
  try {
    body = await res.text();
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (process.env.NODE_ENV === "development" && status === 500) {
      console.warn("[LiquidSwap route 500] request:", url);
      console.warn("[LiquidSwap route 500] response:", body ?? "(empty)");
    }
    throw new RouteError(status, body ?? undefined);
  }
  let data: unknown;
  try {
    data = body ? JSON.parse(body) : null;
  } catch {
    throw new RouteError(status, "Invalid JSON");
  }
  if (!data || typeof (data as RouteQuote).success !== "boolean") {
    throw new RouteError(status, "Invalid route response");
  }
  return data as RouteQuote;
}

export class RouteError extends Error {
  constructor(
    public readonly status: number,
    message?: string
  ) {
    super(message ?? `Route failed: ${status}`);
    this.name = "RouteError";
  }
}
