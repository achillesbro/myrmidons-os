import { parseUnits, formatUnits, type Address } from "viem";

/**
 * Parse a string amount into a bigint with the given decimals
 * @throws Error if input is invalid, negative, or exceeds safe limits
 */
export function parseAmount(
  amountStr: string,
  decimals: number
): bigint {
  if (!amountStr || amountStr.trim() === "") {
    throw new Error("Amount cannot be empty");
  }

  // Remove any whitespace
  const trimmed = amountStr.trim();

  // Check for negative
  if (trimmed.startsWith("-")) {
    throw new Error("Amount cannot be negative");
  }

  // Check for multiple decimal points
  if ((trimmed.match(/\./g) || []).length > 1) {
    throw new Error("Invalid amount format");
  }

  try {
    const parsed = parseUnits(trimmed, decimals);
    
    // Check for zero
    if (parsed === 0n) {
      throw new Error("Amount must be greater than zero");
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("fractional component exceeds decimals")) {
        throw new Error(`Amount has too many decimal places (max ${decimals})`);
      }
      throw new Error(`Invalid amount: ${error.message}`);
    }
    throw new Error("Failed to parse amount");
  }
}

/**
 * Format a bigint amount to a string with the given decimals
 */
export function formatAmount(
  amountBigint: bigint,
  decimals: number,
  maxFracDigits: number = 6
): string {
  if (amountBigint === 0n) {
    return "0";
  }

  const formatted = formatUnits(amountBigint, decimals);
  
  // Limit fractional digits
  const parts = formatted.split(".");
  if (parts.length === 2 && parts[1].length > maxFracDigits) {
    return parseFloat(formatted).toFixed(maxFracDigits);
  }

  return formatted;
}

