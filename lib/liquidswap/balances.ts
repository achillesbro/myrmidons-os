/**
 * LiquidSwap balances API integration.
 * GET https://api.liqd.ag/tokens/balances?wallet=<address>
 * No cache: every call fetches from the API.
 */

import { formatUnits } from "viem";
import { formatNumberWithCommas } from "@/lib/utils";

const BALANCES_URL = "https://api.liqd.ag/tokens/balances";
const SYMBOL_WIDTH = 10;
const AMOUNT_WIDTH = 14;
const CELL_GAP = "    "; // 4 spaces between cells
const MAX_DECIMALS = 3;

export interface LiquidSwapBalance {
  address: string;
  symbol: string;
  decimals: number;
  balanceRaw: string;
}

function isValidWallet(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

async function fetchBalancesFromApi(wallet: string, chainId: number): Promise<LiquidSwapBalance[]> {
  const res = await fetch(
    `${BALANCES_URL}?wallet=${encodeURIComponent(wallet)}&chainId=${chainId}`
  );
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
  const NATIVE_HYPE_MARKER = "Native HYPE";
  for (const t of tokens) {
    if (!t.balance || t.balance === "0") continue;
    // ponytail: off HyperEVM, native-coin rows (non-0x markers) are dropped —
    // ERC20-only until LiquidSwap's native conventions on 4663 are confirmed.
    if (chainId !== 999 && !(typeof t.token === "string" && t.token.startsWith("0x"))) continue;
    const address =
      typeof t.token === "string" && t.token === NATIVE_HYPE_MARKER ? "NATIVE_HYPE" : t.token;
    balances.push({
      address,
      symbol: t.symbol ?? "???",
      decimals: typeof t.decimals === "number" ? t.decimals : 18,
      balanceRaw: String(t.balance),
    });
  }
  return balances;
}

/**
 * Get non-zero token balances for a wallet. Fetches from API every time.
 * @param wallet - 0x-prefixed address
 * @returns Balances sorted by raw balance descending
 */
export async function getBalances(
  wallet: string,
  chainId = 999
): Promise<{ balances: LiquidSwapBalance[]; fromCache: boolean }> {
  if (!wallet || typeof wallet !== "string") {
    throw new Error("Wallet address is required");
  }
  const normalized = wallet.trim().toLowerCase();
  if (!isValidWallet(normalized)) {
    throw new Error("Invalid wallet address");
  }
  const balances = await fetchBalancesFromApi(normalized, chainId);
  balances.sort((a, b) => {
    const aBig = BigInt(a.balanceRaw);
    const bBig = BigInt(b.balanceRaw);
    return aBig > bBig ? -1 : aBig < bBig ? 1 : 0;
  });
  return { balances, fromCache: false };
}

/**
 * Raw balance to number (human units) for calculations. Use this for USD value etc., not the formatted string.
 */
export function balanceToNumber(balanceRaw: string, decimals: number): number {
  const raw = BigInt(balanceRaw);
  if (raw === 0n) return 0;
  const s = formatUnits(raw, decimals);
  const num = Number(s);
  return Number.isFinite(num) ? num : 0;
}

/**
 * Convert raw amount to human-readable string: no scientific notation, trimmed trailing zeros.
 * Used for half/max CLI swap amount display.
 */
export function rawAmountToHuman(balanceRaw: string, decimals: number): string {
  const raw = BigInt(balanceRaw);
  if (raw === 0n) return "0";
  const s = formatUnits(raw, decimals);
  const trimmed = s.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed || "0";
}

/**
 * Format a raw balance for display: thousands/millions commas, max 3 decimals, strip trailing zeros.
 */
export function formatBalanceAmount(balanceRaw: string, decimals: number): string {
  const raw = BigInt(balanceRaw);
  if (raw === 0n) return "0";
  const s = formatUnits(raw, decimals);
  const num = Number(s);
  if (!Number.isFinite(num)) return s;
  return formatNumberWithCommas(num, MAX_DECIMALS, true);
}

export interface BalanceTableEntry {
  symbol: string;
  formattedAmount: string;
  usdFormatted?: string | null;
}

/** Width for amount + optional USD: 14 (amount) + "  ($X,XXX.XX)" (comma-formatted) = 28. */
const AMOUNT_COLUMN_WIDTH = 28;

/**
 * Format a single table cell: symbol (left) + space + amount column (fixed width).
 * Amount column = amount (right-aligned in 14 chars) + optional "  ($usdFormatted)" (2 decimals); padded to AMOUNT_COLUMN_WIDTH.
 */
export function formatBalanceCell(
  symbol: string,
  amount: string,
  symbolWidth = SYMBOL_WIDTH,
  amountColumnWidth = AMOUNT_COLUMN_WIDTH,
  usdFormatted?: string | null
): string {
  const truncated =
    symbol.length > symbolWidth ? symbol.slice(0, symbolWidth - 1) + "…" : symbol;
  const symbolPart = truncated.padEnd(symbolWidth);
  const amountCore = amount.padStart(14);
  const amountSuffix = usdFormatted != null && usdFormatted !== "" ? `  ($${usdFormatted})` : "";
  const amountPart = (amountCore + amountSuffix).padEnd(amountColumnWidth);
  return `${symbolPart} ${amountPart}`;
}

/**
 * Format balance entries into table rows (no section header). Each row has up to `columns` cells.
 * Cell width = symbolWidth + 1 + amountColumnWidth; gap between cells = 4 spaces.
 */
export function formatBalanceTable(entries: BalanceTableEntry[], columns = 3): string[] {
  const lines: string[] = [];
  for (let i = 0; i < entries.length; i += columns) {
    const row = entries.slice(i, i + columns);
    const cells = row.map((e) =>
      formatBalanceCell(e.symbol, e.formattedAmount, SYMBOL_WIDTH, AMOUNT_COLUMN_WIDTH, e.usdFormatted)
    );
    lines.push(cells.join(CELL_GAP));
  }
  return lines;
}

/**
 * Build table with column-first order: column 0 gets indices 0..numRows-1, column 1 gets numRows.., etc.
 * So each column is sorted by the same order as entries (e.g. USD desc). Returns rows for formatBalanceTable.
 */
export function balanceEntriesColumnFirst(
  entries: BalanceTableEntry[],
  columns = 3
): BalanceTableEntry[] {
  if (entries.length === 0) return [];
  const numRows = Math.ceil(entries.length / columns);
  const result: BalanceTableEntry[] = [];
  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < columns; col++) {
      const idx = col * numRows + row;
      if (idx < entries.length) result.push(entries[idx]);
    }
  }
  return result;
}
