/**
 * LiquidSwap token list API.
 * GET https://api.liqd.ag/tokens?search=...
 * Resolve common tokens (WHYPE, USDC, USD₮0) and custom search/paste.
 */

const TOKENS_URL = "https://api.liqd.ag/tokens";

export interface TokenMeta {
  address: string;
  symbol: string;
  name?: string;
  decimals: number;
}

/** Native HYPE as output: dead address per LiquidSwap execution docs. */
export const NATIVE_HYPE_OUT_ADDRESS = "0x000000000000000000000000000000000000dEaD";

/** WHYPE address (LiquidSwap route examples). Used for route API when IN is native HYPE. */
export const WHYPE_ADDRESS = "0x5555555555555555555555555555555555555555";

interface ApiToken {
  address: string;
  name?: string;
  symbol: string;
  decimals: number;
  transfers24h?: number;
}

let cachedCommon: {
  HYPE: TokenMeta;
  WHYPE: TokenMeta;
  USDC: TokenMeta;
  USDT0: TokenMeta;
} | null = null;

async function fetchTokens(search: string, limit = 20): Promise<TokenMeta[]> {
  const params = new URLSearchParams({ search: search.trim(), limit: String(limit) });
  const res = await fetch(`${TOKENS_URL}?${params}`);
  if (!res.ok) throw new Error(`LiquidSwap tokens failed: ${res.status}`);
  const data = await res.json();
  if (!data?.success || !Array.isArray(data?.data?.tokens)) return [];
  const tokens = data.data.tokens as ApiToken[];
  return tokens.map((t) => ({
    address: (t.address || "").toLowerCase(),
    symbol: t.symbol ?? "???",
    name: t.name,
    decimals: typeof t.decimals === "number" ? t.decimals : 18,
  }));
}

/**
 * Search tokens by symbol or address. Returns matches; for exact symbol match pick first.
 */
export async function searchTokens(search: string, limit = 20): Promise<TokenMeta[]> {
  if (!search?.trim()) return [];
  return fetchTokens(search, limit);
}

/**
 * Resolve one token by symbol: best exact symbol match from search.
 */
export async function resolveTokenBySymbol(symbol: string): Promise<TokenMeta | null> {
  const list = await fetchTokens(symbol, 10);
  const normalized = symbol.trim().toUpperCase();
  const exact = list.find((t) => t.symbol.toUpperCase() === normalized);
  return exact ?? list[0] ?? null;
}

/**
 * Resolve token by address: GET /tokens?search=<address>, return first match metadata.
 */
export async function resolveTokenByAddress(address: string): Promise<TokenMeta | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address.trim())) return null;
  const list = await fetchTokens(address.trim(), 5);
  const want = address.trim().toLowerCase();
  const match = list.find((t) => t.address.toLowerCase() === want);
  return match ?? list[0] ?? null;
}

/**
 * Common OUT tokens: HYPE (native), WHYPE, USDC, USD₮0. Cached after first fetch.
 * HYPE is represented as native out (dead address); others resolved from token list.
 */
export async function getCommonOutTokens(): Promise<{
  HYPE: TokenMeta;
  WHYPE: TokenMeta;
  USDC: TokenMeta;
  USDT0: TokenMeta;
}> {
  if (cachedCommon) return cachedCommon;
  const [whypeList, usdcList, usdt0List] = await Promise.all([
    fetchTokens("WHYPE", 5),
    fetchTokens("USDC", 5),
    fetchTokens("USD", 10),
  ]);
  const whype = whypeList.find((t) => t.symbol.toUpperCase() === "WHYPE") ?? whypeList[0];
  const usdc = usdcList.find((t) => t.symbol.toUpperCase() === "USDC") ?? usdcList[0];
  const usdt0 =
    usdt0List.find(
      (t) =>
        t.symbol === "USD₮0" ||
        t.symbol.toUpperCase() === "USDT0" ||
        t.symbol.toUpperCase() === "USD₮0"
    ) ?? usdt0List.find((t) => t.symbol.toUpperCase().includes("USDT")) ?? usdt0List[0];

  if (!whype || !usdc || !usdt0) {
    throw new Error("Could not resolve common tokens (WHYPE, USDC, USD₮0)");
  }
  cachedCommon = {
    HYPE: {
      address: NATIVE_HYPE_OUT_ADDRESS,
      symbol: "HYPE",
      name: "Native HYPE",
      decimals: 18,
    },
    WHYPE: { ...whype, symbol: "WHYPE" },
    USDC: { ...usdc, symbol: "USDC" },
    USDT0: { ...usdt0, symbol: usdt0.symbol === "USD₮0" ? "USD₮0" : "USDT0" },
  };
  return cachedCommon;
}
