"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useAccount } from "wagmi";
import { GridPanel } from "@/components/ui/grid-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getBalances,
  formatBalanceAmount,
  balanceToNumber,
  type LiquidSwapBalance,
} from "@/lib/liquidswap/balances";
import {
  getCommonOutTokens,
  searchTokens,
  resolveTokenByAddress,
  NATIVE_HYPE_OUT_ADDRESS,
  WHYPE_ADDRESS,
  type TokenMeta,
} from "@/lib/liquidswap/tokens";
import { fetchRoute, RouteError, type RouteQuote } from "@/lib/liquidswap/route";
import { getTokenPricesUsd, addressForPricing } from "@/lib/pricing/dexscreener";
import { cn } from "@/lib/utils";

/** True if IN and OUT represent the same token (no route). */
function isSameToken(
  inToken: LiquidSwapBalance,
  outToken: TokenMeta,
  whypeAddress: string,
  nativeHypeOutAddress: string
): boolean {
  if (inToken.address === outToken.address) return true;
  if (inToken.address === "NATIVE_HYPE" && outToken.address === nativeHypeOutAddress) return true;
  if (inToken.address === whypeAddress && outToken.address === whypeAddress) return true;
  return false;
}

const SLIPPAGE_OPTIONS = [50, 100, 200] as const;
type SlippageBps = (typeof SLIPPAGE_OPTIONS)[number];

type QuoteStatus = "IDLE" | "QUOTING" | "READY" | "NO_ROUTE" | "ERROR";

function bpsToPercent(bps: number): number {
  return bps / 100;
}

/** Build address -> symbol map from route tokens */
function buildAddrToSymbol(tokens: NonNullable<RouteQuote["tokens"]>): Record<string, string> {
  const byAddr: Record<string, string> = {};
  const add = (addr: string, sym: string) => {
    const a = addr.toLowerCase();
    if (!byAddr[a]) byAddr[a] = sym;
  };
  add(tokens.tokenIn.address, tokens.tokenIn.symbol);
  add(tokens.tokenOut.address, tokens.tokenOut.symbol);
  tokens.intermediates?.forEach((t) => add(t.address, t.symbol));
  add(NATIVE_HYPE_OUT_ADDRESS, "HYPE");
  return byAddr;
}

export interface SwapToolProps {
  onLog?: (line: string) => void;
}

export function SwapTool({ onLog }: SwapToolProps) {
  const { address } = useAccount();
  const [balances, setBalances] = useState<LiquidSwapBalance[]>([]);
  const [commonOut, setCommonOut] = useState<{
    HYPE: TokenMeta;
    WHYPE: TokenMeta;
    USDC: TokenMeta;
    USDT0: TokenMeta;
  } | null>(null);
  const [inToken, setInToken] = useState<LiquidSwapBalance | null>(null);
  const [outToken, setOutToken] = useState<TokenMeta | null>(null);
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState<SlippageBps>(100);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>("IDLE");
  const [quoteError, setQuoteError] = useState("");
  const [noRouteMessage, setNoRouteMessage] = useState("");
  const [route, setRoute] = useState<RouteQuote | null>(null);
  const [customOutMode, setCustomOutMode] = useState(false);
  const [customOutSearch, setCustomOutSearch] = useState("");
  const [customOutResult, setCustomOutResult] = useState<TokenMeta | null>(null);
  const lastStatusRef = useRef<QuoteStatus>("IDLE");
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load common OUT tokens (HYPE, WHYPE, USDC, USD₮0) from LiquidSwap token list
  useEffect(() => {
    getCommonOutTokens()
      .then(setCommonOut)
      .catch(() => setCommonOut(null));
  }, []);

  // Load balances when wallet connected; sort by USD value (highest first, no price last)
  useEffect(() => {
    if (!address) {
      setBalances([]);
      setInToken(null);
      return;
    }
    let cancelled = false;
    getBalances(address)
      .then(async ({ balances: b }) => {
        if (cancelled) return;
        if (b.length === 0) {
          setBalances([]);
          return;
        }
        let prices: Record<string, number | null> = {};
        try {
          prices = await getTokenPricesUsd(b.map((x) => addressForPricing(x.address)));
        } catch {
          // continue without sorting by USD
        }
        const withUsd = b.map((balance) => {
          const amountNum = balanceToNumber(balance.balanceRaw, balance.decimals);
          const priceUsd = prices[addressForPricing(balance.address)] ?? null;
          const usdValue =
            priceUsd != null && Number.isFinite(amountNum) ? amountNum * priceUsd : null;
          return { balance, usdValue };
        });
        withUsd.sort((a, b) => {
          const aVal = a.usdValue;
          const bVal = b.usdValue;
          if (aVal == null && bVal == null) return 0;
          if (aVal == null) return 1;
          if (bVal == null) return -1;
          return bVal - aVal;
        });
        const dustThreshold = 1;
        const aboveDust = withUsd.filter(
          (x) => x.usdValue == null || x.usdValue >= dustThreshold
        );
        if (!cancelled) setBalances(aboveDust.map((x) => x.balance));
      })
      .catch(() => {
        if (!cancelled) setBalances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Resolve custom OUT: by symbol search or by address
  const resolveCustomOut = useCallback(async () => {
    const q = customOutSearch.trim();
    if (!q) {
      setCustomOutResult(null);
      return;
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(q)) {
      const meta = await resolveTokenByAddress(q);
      setCustomOutResult(meta ?? null);
    } else {
      const list = await searchTokens(q, 10);
      const exact = list.find((t) => t.symbol.toUpperCase() === q.toUpperCase()) ?? list[0];
      setCustomOutResult(exact ?? null);
    }
  }, [customOutSearch]);

  useEffect(() => {
    if (!customOutMode) return;
    const t = setTimeout(resolveCustomOut, 400);
    return () => clearTimeout(t);
  }, [customOutMode, customOutSearch, resolveCustomOut]);

  // Debounced auto-quote
  useEffect(() => {
    if (!inToken || !outToken || !amount.trim()) {
      setQuoteStatus("IDLE");
      setRoute(null);
      setQuoteError("");
      setNoRouteMessage("");
      return;
    }
    const num = Number(amount.trim());
    if (num <= 0 || !Number.isFinite(num)) {
      setQuoteStatus("IDLE");
      setRoute(null);
      setNoRouteMessage("");
      return;
    }

    // IN == OUT: do not call API
    if (isSameToken(inToken, outToken, WHYPE_ADDRESS, NATIVE_HYPE_OUT_ADDRESS)) {
      setQuoteStatus("ERROR");
      setQuoteError("INVALID_PAIR (IN=OUT)");
      setRoute(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      const tokenInAddr =
        inToken.address === "NATIVE_HYPE" ? WHYPE_ADDRESS : inToken.address;
      const tokenOutAddr = outToken.address;
      const unwrapWHYPE = tokenOutAddr === NATIVE_HYPE_OUT_ADDRESS;

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;

      setQuoteStatus("QUOTING");
      setQuoteError("");
      setNoRouteMessage("");
      setRoute(null);

      fetchRoute(
        tokenInAddr,
        tokenOutAddr,
        amount.trim(),
        bpsToPercent(slippageBps),
        { unwrapWHYPE, signal }
      )
        .then((data) => {
          if (signal.aborted) return;
          if (data.success && data.execution?.details) {
            setRoute(data);
            setQuoteStatus("READY");
            setNoRouteMessage("");
          } else {
            setQuoteStatus("NO_ROUTE");
            const apiMsg = typeof data.message === "string" ? data.message : "";
            setNoRouteMessage(apiMsg.toLowerCase().includes("unwrap") ? "No routes are available" : apiMsg);
            setRoute(null);
          }
        })
        .catch((err) => {
          if (signal.aborted) return;
          setQuoteStatus("ERROR");
          const msg =
            err instanceof RouteError
              ? err.status === 500
                ? "No routes are available"
                : err.status === 400
                  ? "INVALID_REQUEST (400)"
                  : `Route failed (${err.status})`
              : err instanceof Error
                ? err.message
                : String(err);
          setQuoteError(msg);
          setRoute(null);
        });
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inToken, outToken, amount, slippageBps]);

  // Terminal log on status change only (no spam)
  const outSymbol = customOutMode ? customOutResult?.symbol : outToken?.symbol;
  useEffect(() => {
    if (quoteStatus === lastStatusRef.current) return;
    lastStatusRef.current = quoteStatus;
    if (!onLog) return;
    if (quoteStatus === "QUOTING") onLog("SWAP // QUOTING...");
    else if (quoteStatus === "READY" && route?.amountOut != null && route?.execution?.details?.minAmountOut != null) {
      const inSym = inToken?.symbol ?? "?";
      const outSym = outSymbol ?? "?";
      const decimals = route.tokens?.tokenOut?.decimals ?? 18;
      const minFormatted = formatBalanceAmount(route.execution.details.minAmountOut, decimals);
      onLog(`SWAP // ROUTE_READY  PAIR: ${inSym} -> ${outSym}  OUT:${route.amountOut}  MIN:${minFormatted}`);
    } else if (quoteStatus === "NO_ROUTE") {
      onLog(noRouteMessage ? `SWAP // NO_ROUTE  ${noRouteMessage}` : "SWAP // NO_ROUTE");
    }
    else if (quoteStatus === "ERROR") onLog(`SWAP // ERROR  ${quoteError || "Unknown"}`);
  }, [quoteStatus, route, quoteError, noRouteMessage, onLog, inToken?.symbol, outSymbol]);

  const inBalanceFormatted =
    inToken && inToken.balanceRaw
      ? formatBalanceAmount(inToken.balanceRaw, inToken.decimals)
      : "";
  const inBalanceNum = inToken ? balanceToNumber(inToken.balanceRaw, inToken.decimals) : 0;

  const handleHalf = () => {
    if (inBalanceNum <= 0) return;
    setAmount(String(inBalanceNum / 2));
  };
  const handleMax = () => {
    if (inBalanceNum <= 0) return;
    setAmount(String(inBalanceNum));
  };

  const displayOutToken = customOutMode ? customOutResult : outToken;
  const outOptions = commonOut
    ? [
        commonOut.HYPE,
        commonOut.WHYPE,
        commonOut.USDC,
        commonOut.USDT0,
      ]
    : [];

  const routeDetailLines: string[] = [];
  if (route?.execution?.details && route?.tokens) {
    const byAddr = buildAddrToSymbol(route.tokens);
    const hopSwaps = route.execution.details.hopSwaps ?? [];
    let lineNum = 1;
    for (const hops of hopSwaps) {
      for (const swap of hops) {
        const inSym = byAddr[swap.tokenIn.toLowerCase()] ?? swap.tokenIn.slice(0, 6) + "…";
        const outSym = byAddr[swap.tokenOut.toLowerCase()] ?? swap.tokenOut.slice(0, 6) + "…";
        routeDetailLines.push(
          `${String(lineNum).padStart(2, "0")} ${inSym} -> ${outSym} via ${swap.routerName} fee ${swap.fee}`
        );
        lineNum++;
      }
    }
  }

  return (
    <div className="space-y-4">
      {!address && (
        <p className="text-[9px] text-text-dim font-mono">
          Connect wallet to load IN token balances.
        </p>
      )}
      {/* Minimal status strip (details in terminal) */}
      <div className="flex items-center gap-2 font-mono text-xs">
        <span className="text-text-dim">STATUS:</span>
        {quoteStatus === "ERROR" ? (
          <span className="text-danger glow-red font-bold uppercase tracking-wider">{quoteStatus}</span>
        ) : quoteStatus === "QUOTING" ? (
          <span className="text-text-dim">{quoteStatus}…</span>
        ) : quoteStatus === "READY" ? (
          <span className="text-text">{quoteStatus}</span>
        ) : (
          <span className="text-text-dim">{quoteStatus}</span>
        )}
        {quoteStatus === "READY" && route?.amountOut != null && route?.execution?.details?.minAmountOut != null && (
          <span className="text-text-dim ml-1">
            OUT: {route.amountOut} / MIN:{" "}
            {formatBalanceAmount(route.execution.details.minAmountOut, route.tokens?.tokenOut?.decimals ?? 18)}
          </span>
        )}
      </div>
      {quoteStatus === "NO_ROUTE" && noRouteMessage && (
        <p className="text-[9px] text-text-dim font-mono">{noRouteMessage}</p>
      )}

      {/* Inputs */}
      <GridPanel title="INPUTS" className="border border-border">
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
              IN token
            </label>
            <select
              className="w-full border border-border bg-bg-base px-3 py-2 text-sm font-mono text-text focus:outline-none focus:border-gold"
              value={inToken ? inToken.address : ""}
              onChange={(e) => {
                const addr = e.target.value;
                const t = balances.find((b) => b.address === addr) ?? null;
                setInToken(t);
              }}
            >
              <option value="">Select token</option>
              {balances.map((b) => (
                <option key={b.address} value={b.address}>
                  {b.symbol} — {formatBalanceAmount(b.balanceRaw, b.decimals)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
              OUT token
            </label>
            {!customOutMode ? (
              <div className="flex gap-2 flex-wrap">
                {outOptions.map((t) => (
                  <button
                    key={t.address}
                    type="button"
                    className={cn(
                      "border px-3 py-1.5 text-xs font-mono",
                      displayOutToken?.address === t.address
                        ? "border-gold bg-gold/20 text-gold"
                        : "border-border bg-bg-base text-text hover:border-gold/50"
                    )}
                    onClick={() => {
                      setOutToken(t);
                      setCustomOutResult(null);
                    }}
                  >
                    {t.symbol} ({t.address.slice(0, 6)}…{t.address.slice(-4)})
                  </button>
                ))}
                <button
                  type="button"
                  className="border border-border px-3 py-1.5 text-xs font-mono text-text-dim hover:border-gold/50"
                  onClick={() => setCustomOutMode(true)}
                >
                  CUSTOM…
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Paste address or type symbol"
                  value={customOutSearch}
                  onChange={(e) => setCustomOutSearch(e.target.value)}
                  className="font-mono text-xs"
                />
                {customOutResult && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-text">
                      {customOutResult.symbol} ({customOutResult.address.slice(0, 6)}…{customOutResult.address.slice(-4)})
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOutToken(customOutResult);
                        setCustomOutMode(false);
                        setCustomOutSearch("");
                        setCustomOutResult(null);
                      }}
                    >
                      Use
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  className="text-[9px] font-mono text-text-dim hover:text-text"
                  onClick={() => {
                    setCustomOutMode(false);
                    setCustomOutSearch("");
                    setCustomOutResult(null);
                  }}
                >
                  ← Back to list
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
              Amount (exact in)
            </label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="font-mono"
            />
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={handleHalf} disabled={!inToken || inBalanceNum <= 0}>
                HALF
              </Button>
              <Button size="sm" variant="outline" onClick={handleMax} disabled={!inToken || inBalanceNum <= 0}>
                MAX
              </Button>
            </div>
            {inToken && (
              <p className="text-[9px] text-text-dim font-mono mt-1">
                Balance: {inBalanceFormatted} {inToken.symbol}
              </p>
            )}
          </div>

          <div>
            <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono mr-2">
              Slippage (bps):
            </span>
            {SLIPPAGE_OPTIONS.map((bps) => (
              <button
                key={bps}
                type="button"
                className={cn(
                  "border px-2 py-1 text-xs font-mono mr-1",
                  slippageBps === bps
                    ? "border-gold bg-gold/20 text-gold"
                    : "border-border bg-bg-base text-text hover:border-gold/50"
                )}
                onClick={() => setSlippageBps(bps)}
              >
                {bps}
              </button>
            ))}
          </div>
        </div>
      </GridPanel>

      {/* Route detail */}
      {routeDetailLines.length > 0 && (
        <GridPanel title="ROUTE" className="border border-border">
          <div className="p-3 font-mono text-xs text-text-dim whitespace-pre">
            {routeDetailLines.join("\n")}
          </div>
        </GridPanel>
      )}

      <Button variant="gold" size="md" disabled className="cursor-not-allowed">
        SWAP (STEP 4)
      </Button>
    </div>
  );
}
