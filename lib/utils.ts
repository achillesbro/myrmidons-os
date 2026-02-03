import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number with thousands/millions separators (commas).
 * @param value - Number to format
 * @param maxDecimals - Max decimal places
 * @param stripTrailingZeros - If true, remove trailing zeros after the decimal (e.g. 1.20 -> 1.2)
 */
export function formatNumberWithCommas(
  value: number,
  maxDecimals: number,
  stripTrailingZeros = false
): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  const fixed = value.toFixed(maxDecimals);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (!decPart) return withCommas;
  const trimmed = stripTrailingZeros ? decPart.replace(/0+$/, "") : decPart;
  return trimmed ? `${withCommas}.${trimmed}` : withCommas;
}

