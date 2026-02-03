/**
 * Dexscreener price API.
 * GET https://api.dexscreener.com/tokens/v1/{chainId}/{tokenAddresses}
 * 10s TTL cache. Native HYPE priced via WHYPE address.
 * When Dexscreener has no WHYPE price (quote token), fallback to getHypePriceUsd (CoinGecko, 10s effective via cache).
 */

import { getHypePriceUsd } from "@/lib/hype-price";

const DEXSCREENER_URL = "https://api.dexscreener.com/tokens/v1";
const CHAIN_ID = "hyperevm";
const CACHE_TTL_MS = 10_000;

interface PairItem {
  baseToken?: { address?: string };
  priceUsd?: string | null;
}

interface CacheEntry {
  fetchedAt: number;
  prices: Record<string, number | null>;
}

const cache = new Map<string, CacheEntry>();

/** WHYPE address: use for pricing native HYPE (no contract address). */
export const WHYPE_ADDRESS_FOR_PRICING = "0x5555555555555555555555555555555555555555";

/**
 * Map balance address to address used for Dexscreener (ERC20 only).
 * NATIVE_HYPE -> WHYPE address so we get HYPE price.
 */
export function addressForPricing(address: string): string {
  if (address === "NATIVE_HYPE") return WHYPE_ADDRESS_FOR_PRICING.toLowerCase();
  return address.startsWith("0x") ? address.toLowerCase() : address;
}

/**
 * Fetch USD prices for token addresses. Batched single request.
 * Returns map: tokenAddressLower -> priceUsd number or null if missing.
 * 10s cache keyed by sorted comma-separated addresses.
 */
export async function getTokenPricesUsd(
  tokenAddresses: string[]
): Promise<Record<string, number | null>> {
  const forPricing = [...new Set(tokenAddresses.map(addressForPricing))].filter((a) =>
    /^0x[a-f0-9]{40}$/i.test(a)
  );
  if (forPricing.length === 0) return {};

  const key = forPricing.sort().join(",");
  const now = Date.now();
  const entry = cache.get(key);
  if (entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    return entry.prices;
  }

  const url = `${DEXSCREENER_URL}/${CHAIN_ID}/${forPricing.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Dexscreener prices failed: ${res.status}`);
  }
  const data = (await res.json()) as PairItem[] | null;
  const prices: Record<string, number | null> = {};
  for (const addr of forPricing) {
    prices[addr] = null;
  }
  if (Array.isArray(data)) {
    for (const pair of data) {
      const addr = pair.baseToken?.address?.toLowerCase();
      if (!addr || !(addr in prices)) continue;
      const priceUsd = pair.priceUsd;
      if (priceUsd != null && priceUsd !== "" && prices[addr] === null) {
        const num = Number(priceUsd);
        prices[addr] = Number.isFinite(num) ? num : null;
      }
    }
  }
  const whypeLower = WHYPE_ADDRESS_FOR_PRICING.toLowerCase();
  if (forPricing.includes(whypeLower) && prices[whypeLower] === null) {
    try {
      const hypePrice = await getHypePriceUsd();
      if (hypePrice != null && Number.isFinite(hypePrice)) {
        prices[whypeLower] = hypePrice;
      }
    } catch {
      // keep null
    }
  }
  cache.set(key, { fetchedAt: now, prices });
  return prices;
}

/**
 * Format USD for display: thousands/millions commas, 2 decimals.
 */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "0.00";
  const fixed = usd.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart != null ? `${withCommas}.${decPart}` : withCommas;
}
