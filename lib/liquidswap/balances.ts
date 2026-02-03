/**
 * LiquidSwap balances API integration.
 * GET https://api.liqd.ag/tokens/balances?wallet=<address>
 * In-memory cache 30s per wallet.
 */

import { formatUnits } from "viem";

const BALANCES_URL = "https://api.liqd.ag/tokens/balances";
const SYMBOL_WIDTH = 10;
const AMOUNT_WIDTH = 14;
const CELL_GAP = "    "; // 4 spaces between cells
const MAX_DECIMALS = 6;
const CACHE_TTL_MS = 30_000;

export interface LiquidSwapBalance {
  address: string;
  symbol: string;
  decimals: number;
  balanceRaw: string;
}

interface CacheEntry {
  fetchedAt: number;
  balances: LiquidSwapBalance[];
}

const cache = new Map<string, CacheEntry>();

function isValidWallet(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function fetchBalancesFromApi(wallet: string): Promise<LiquidSwapBalance[]> {
  const res = await fetch(`${BALANCES_URL}?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) {
    throw new Error(`LiquidSwap balances failed: ${res.status}`);
  }
  const data = await res.json();
  if (!data?.success || !Array.isArray(data?.data?.tokens)) {
    throw new Error("LiquidSwap balances: invalid response");
  }
  const tokens = data.data.tokens as Array<{
    token: string;
    balance: string;
    symbol: string;
    decimals: number;
  }>;
  const balances: LiquidSwapBalance[] = [];
  for (const t of tokens) {
    if (!t.balance || t.balance === "0") continue;
    balances.push({
      address: t.token,
      symbol: t.symbol ?? "???",
      decimals: typeof t.decimals === "number" ? t.decimals : 18,
      balanceRaw: String(t.balance),
    });
  }
  return balances;
}

/**
 * Get non-zero token balances for a wallet. Cached 30s per wallet.
 * @param wallet - 0x-prefixed address
 * @param options.force - If true, bypass cache and refetch
 * @returns Balances sorted by raw balance descending
 */
export async function getBalances(
  wallet: string,
  options?: { force?: boolean }
): Promise<{ balances: LiquidSwapBalance[]; fromCache: boolean }> {
  if (!wallet || typeof wallet !== "string") {
    throw new Error("Wallet address is required");
  }
  const normalized = wallet.trim().toLowerCase();
  if (!isValidWallet(normalized)) {
    throw new Error("Invalid wallet address");
  }

  const force = options?.force === true;
  const now = Date.now();
  const entry = cache.get(normalized);

  if (!force && entry && now - entry.fetchedAt < CACHE_TTL_MS) {
    return { balances: entry.balances, fromCache: true };
  }

  const balances = await fetchBalancesFromApi(normalized);
  balances.sort((a, b) => {
    const aBig = BigInt(a.balanceRaw);
    const bBig = BigInt(b.balanceRaw);
    return aBig > bBig ? -1 : aBig < bBig ? 1 : 0;
  });
  cache.set(normalized, { fetchedAt: now, balances });
  return { balances, fromCache: false };
}

/**
 * Format a raw balance for display: max 6 decimals, strip trailing zeros, no scientific notation.
 */
export function formatBalanceAmount(balanceRaw: string, decimals: number): string {
  const raw = BigInt(balanceRaw);
  if (raw === 0n) return "0";
  let s = formatUnits(raw, decimals);
  if (s.includes(".")) {
    const [intPart, decPart] = s.split(".");
    const trimmed = decPart.slice(0, MAX_DECIMALS).replace(/0+$/, "");
    s = trimmed ? `${intPart}.${trimmed}` : intPart;
  }
  return s;
}

export interface BalanceTableEntry {
  symbol: string;
  formattedAmount: string;
}

/**
 * Format a single table cell: symbol (left, max symbolWidth) + space + amount (right, amountWidth).
 * Returns a fixed-width string of length symbolWidth + 1 + amountWidth.
 */
export function formatBalanceCell(
  symbol: string,
  amount: string,
  symbolWidth = SYMBOL_WIDTH,
  amountWidth = AMOUNT_WIDTH
): string {
  const truncated =
    symbol.length > symbolWidth ? symbol.slice(0, symbolWidth - 1) + "…" : symbol;
  const symbolPart = truncated.padEnd(symbolWidth);
  const amountPart = amount.padStart(amountWidth);
  return `${symbolPart} ${amountPart}`;
}

/**
 * Format balance entries into table rows (no section header). Each row has up to `columns` cells.
 * Cell width = symbolWidth + 1 + amountWidth; gap between cells = 4 spaces.
 */
export function formatBalanceTable(entries: BalanceTableEntry[], columns = 3): string[] {
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += columns) {
    const row = entries.slice(i, i + columns);
    const cells = row.map((e) =>
      formatBalanceCell(e.symbol, e.formattedAmount, SYMBOL_WIDTH, AMOUNT_WIDTH)
    );
    lines.push(cells.join(CELL_GAP));
  }
  return lines;
}
