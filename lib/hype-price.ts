/**
 * HYPE (HyperEVM native token) price in USD.
 * Fetched from CoinGecko, cached for 30 seconds.
 */

const CACHE_TTL_MS = 30_000;
const COINGECKO_HYPE_ID = "hyperliquid"; // HyperEVM / Hyperliquid ecosystem native

let cachedPrice: number | null = null;
let cachedAt: number = 0;

export async function getHypePriceUsd(): Promise<number | null> {
  const now = Date.now();
  if (cachedPrice !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedPrice;
  }
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${COINGECKO_HYPE_ID}&vs_currencies=usd`
    );
    const data = (await res.json()) as { [key: string]: { usd?: number } };
    const price = data[COINGECKO_HYPE_ID]?.usd;
    if (typeof price === "number" && price > 0) {
      cachedPrice = price;
      cachedAt = now;
      return price;
    }
  } catch {
    // Keep previous cache on error
  }
  return cachedPrice;
}

export function getHypePriceCached(): number | null {
  if (Date.now() - cachedAt < CACHE_TTL_MS) return cachedPrice;
  return null;
}
