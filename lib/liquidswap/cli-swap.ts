/**
 * CLI swap command parsing and token resolution for Step 5.
 * swap <amount> <IN> [for] <OUT> | swap quote <amount> <IN> [for] <OUT>
 */

import {
  getCommonOutTokens,
  resolveTokenByAddress,
  resolveTokenBySymbol,
  NATIVE_HYPE_OUT_ADDRESS,
  WHYPE_ADDRESS,
  type TokenMeta,
} from "./tokens";

export interface ParseSwapResult {
  ok: true;
  quoteOnly: boolean;
  amount: string;
  inToken: string;
  outToken: string;
}

export interface ParseSwapError {
  ok: false;
  error: string;
  /** Set for INVALID_AMOUNT (invalid value shown in terminal). */
  value?: string;
}

export function parseSwapCommand(raw: string): ParseSwapResult | ParseSwapError {
  const tokens = raw.trim().split(/\s+/).map((s) => s.toLowerCase());
  if (tokens[0] !== "swap") return { ok: false, error: "INVALID_SYNTAX" };
  if (tokens.length < 4) return { ok: false, error: "INVALID_SYNTAX" };

  const quoteOnly = tokens[1] === "quote";
  const rest = quoteOnly ? tokens.slice(2) : tokens.slice(1);
  if (rest.length < 3) return { ok: false, error: "INVALID_SYNTAX" };

  let amount: string;
  let inToken: string;
  let outToken: string;
  if (rest[2] === "for" && rest.length >= 4) {
    amount = rest[0];
    inToken = rest[1];
    outToken = rest[3];
  } else if (rest.length >= 3) {
    amount = rest[0];
    inToken = rest[1];
    outToken = rest[2];
  } else {
    return { ok: false, error: "INVALID_SYNTAX" };
  }

  const amountLower = amount.toLowerCase();
  const isHalfOrMax = amountLower === "half" || amountLower === "max";
  const num = Number(amount);
  const isValidNumeric = amount && Number.isFinite(num) && num > 0;
  if (!isHalfOrMax && !isValidNumeric) {
    return { ok: false, error: "INVALID_AMOUNT", value: amount };
  }
  if (!inToken || !outToken) return { ok: false, error: "INVALID_SYNTAX" };

  return {
    ok: true,
    quoteOnly,
    amount: isHalfOrMax ? amountLower : amount,
    inToken,
    outToken,
  };
}

/**
 * Resolve IN and OUT token strings to TokenMeta.
 * IN: "hype" -> native HYPE (for wrap/wrap+swap). OUT: "hype" -> native HYPE.
 */
export async function resolveTokensForCli(
  inStr: string,
  outStr: string
): Promise<{ tokenIn: TokenMeta; tokenOut: TokenMeta } | { error: string; input: string }> {
  const common = await getCommonOutTokens();
  const bySymbolIn: Record<string, TokenMeta> = {
    hype: common.HYPE,
    whype: common.WHYPE,
    usdc: common.USDC,
    usdt0: common.USDT0,
    "usd₮0": common.USDT0,
  };
  const bySymbolOut: Record<string, TokenMeta> = {
    hype: common.HYPE,
    whype: common.WHYPE,
    usdc: common.USDC,
    usdt0: common.USDT0,
    "usd₮0": common.USDT0,
  };

  const resolveOne = async (str: string, role: "in" | "out"): Promise<TokenMeta | null> => {
    const s = str.trim();
    const key = s.toLowerCase();
    const bySymbol = role === "in" ? bySymbolIn : bySymbolOut;
    if (bySymbol[key]) return bySymbol[key];
    if (/^0x[a-fA-F0-9]{40}$/.test(s)) return resolveTokenByAddress(s);
    const bySearch = await resolveTokenBySymbol(s);
    return bySearch;
  };

  const tokenIn = await resolveOne(inStr, "in");
  if (!tokenIn) return { error: "UNKNOWN_TOKEN", input: inStr };
  const tokenOut = await resolveOne(outStr, "out");
  if (!tokenOut) return { error: "UNKNOWN_TOKEN", input: outStr };
  const { areSameToken } = await import("./plan");
  if (areSameToken(tokenIn.address, tokenOut.address)) return { error: "NO_OP", input: "" };
  return { tokenIn, tokenOut };
}

export interface ParseWrapResult {
  ok: true;
  quoteOnly: boolean;
  amount: string;
}
export interface ParseWrapError {
  ok: false;
  error: string;
  value?: string;
}

export function parseWrapCommand(raw: string): ParseWrapResult | ParseWrapError {
  const tokens = raw.trim().split(/\s+/).map((s) => s.toLowerCase());
  if (tokens[0] !== "wrap") return { ok: false, error: "INVALID_SYNTAX" };
  if (tokens.length < 3) return { ok: false, error: "INVALID_SYNTAX" };
  const amount = tokens[1];
  const token = tokens[2];
  if (token !== "hype") return { ok: false, error: "INVALID_COMMAND" };
  const num = Number(amount);
  const isValidNumeric = amount && Number.isFinite(num) && num > 0;
  if (amount.toLowerCase() !== "quote" && !isValidNumeric) {
    return { ok: false, error: "INVALID_AMOUNT", value: amount };
  }
  const quoteOnly = amount.toLowerCase() === "quote";
  return { ok: true, quoteOnly, amount: quoteOnly ? "1" : amount };
}

export interface ParseUnwrapResult {
  ok: true;
  quoteOnly: boolean;
  amount: string;
}
export interface ParseUnwrapError {
  ok: false;
  error: string;
  value?: string;
}

export function parseUnwrapCommand(raw: string): ParseUnwrapResult | ParseUnwrapError {
  const tokens = raw.trim().split(/\s+/).map((s) => s.toLowerCase());
  if (tokens[0] !== "unwrap") return { ok: false, error: "INVALID_SYNTAX" };
  if (tokens.length < 3) return { ok: false, error: "INVALID_SYNTAX" };
  const amount = tokens[1];
  const token = tokens[2];
  if (token !== "whype") return { ok: false, error: "INVALID_COMMAND" };
  const num = Number(amount);
  const isValidNumeric = amount && Number.isFinite(num) && num > 0;
  if (amount.toLowerCase() !== "quote" && !isValidNumeric) {
    return { ok: false, error: "INVALID_AMOUNT", value: amount };
  }
  const quoteOnly = amount.toLowerCase() === "quote";
  return { ok: true, quoteOnly, amount: quoteOnly ? "1" : amount };
}

/** Token IN address for route API: use WHYPE when OUT is native HYPE (no native-in yet). */
export function routeTokenInAddress(token: TokenMeta): string {
  return token.address === NATIVE_HYPE_OUT_ADDRESS ? WHYPE_ADDRESS : token.address;
}

export function routeTokenOutAddress(token: TokenMeta): string {
  return token.address;
}

export function shouldUnwrapHypeOut(tokenOut: TokenMeta): boolean {
  return tokenOut.address === NATIVE_HYPE_OUT_ADDRESS;
}
