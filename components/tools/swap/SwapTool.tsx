"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, maxUint256, type Address } from "viem";
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
import { readAllowance } from "@/lib/web3/vault";
import { ERC20_ABI } from "@/lib/web3/abis/erc20";
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

type QuoteStatus =
  | "IDLE"
  | "QUOTING"
  | "READY"
  | "NO_ROUTE"
  | "ERROR"
  | "APPROVAL_REQUIRED"
  | "APPROVING"
  | "EXECUTING"
  | "CONFIRMED"
  | "REVERTED";

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

/** Build address -> decimals map from route tokens */
function buildAddrToDecimals(tokens: NonNullable<RouteQuote["tokens"]>): Record<string, number> {
  const byAddr: Record<string, number> = {};
  const add = (addr: string, dec: number) => {
    const a = addr.toLowerCase();
    if (byAddr[a] === undefined) byAddr[a] = dec;
  };
  add(tokens.tokenIn.address, tokens.tokenIn.decimals);
  add(tokens.tokenOut.address, tokens.tokenOut.decimals);
  tokens.intermediates?.forEach((t) => add(t.address, t.decimals));
  add(NATIVE_HYPE_OUT_ADDRESS, 18);
  return byAddr;
}

export interface SwapToolProps {
  onLog?: (line: string) => void;
}

export function SwapTool({ onLog }: SwapToolProps) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
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
  const [autoQuoteEnabled, setAutoQuoteEnabled] = useState(true);
  const lastStatusRef = useRef<QuoteStatus>("IDLE");
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load common OUT tokens (HYPE, WHYPE, USDC, USD₮0) from LiquidSwap token list
  useEffect(() => {
    getCommonOutTokens()
      .then(setCommonOut)
      .catch(() => setCommonOut(null));
  }, []);

  // Process balances: sort by USD, filter dust, set state. Shared by initial load and balances-refreshed.
  const applyBalancesToState = useCallback(
    async (wallet: string, b: LiquidSwapBalance[]) => {
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
      const newBalances = aboveDust.map((x) => x.balance);
      setBalances(newBalances);
      setInToken((prev) => {
        if (!prev?.address) return prev;
        const updated = newBalances.find((b) => b.address === prev.address);
        return updated ?? prev;
      });
    },
    []
  );

  // Load balances when wallet connected; read from shared cache
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
        await applyBalancesToState(address, b);
      })
      .catch(() => {
        if (!cancelled) setBalances([]);
      });
    return () => {
      cancelled = true;
    };
  }, [address, applyBalancesToState]);

  // Re-read from cache when CLI swap has refreshed balances
  useEffect(() => {
    if (!address) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ wallet: string }>).detail;
      if (detail?.wallet?.toLowerCase() !== address.toLowerCase()) return;
      getBalances(address).then(({ balances }) => applyBalancesToState(address, balances));
    };
    window.addEventListener("balances-refreshed", handler);
    return () => window.removeEventListener("balances-refreshed", handler);
  }, [address, applyBalancesToState]);

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

  // Debounced auto-quote (disabled after CONFIRMED/REVERTED until user edits amount or token)
  useEffect(() => {
    if (!autoQuoteEnabled) return;
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
  }, [autoQuoteEnabled, inToken, outToken, amount, slippageBps]);

  // When READY with ERC20 input: check allowance; if insufficient set APPROVAL_REQUIRED
  useEffect(() => {
    if (
      quoteStatus !== "READY" ||
      !route?.execution?.to ||
      !inToken ||
      !amount.trim() ||
      !address ||
      !publicClient
    ) {
      return;
    }
    if (inToken.address === "NATIVE_HYPE") return; // no approval for native
    const tokenInAddr = inToken.address as Address;
    const spender = route.execution!.to as Address;
    let cancelled = false;
    (async () => {
      try {
        const requiredRaw = parseUnits(amount.trim(), inToken.decimals);
        const allowance = await readAllowance({
          owner: address as Address,
          assetAddress: tokenInAddr,
          spender,
          publicClient,
        });
        if (cancelled) return;
        if (allowance < requiredRaw) {
          setQuoteStatus("APPROVAL_REQUIRED");
          onLog?.("SWAP // APPROVAL_REQUIRED");
        }
      } catch {
        if (!cancelled) setQuoteStatus("ERROR");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [quoteStatus, route?.execution?.to, inToken, amount, address, publicClient, onLog]);

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
      const inDec = route.tokens?.tokenIn?.decimals ?? 18;
      const outDec = route.tokens?.tokenOut?.decimals ?? 18;
      const amountInFormatted = formatBalanceAmount(route.execution.details.amountIn ?? "0", inDec);
      const outFormatted = formatBalanceAmount(route.execution.details.amountOut ?? "0", outDec);
      const minFormatted = formatBalanceAmount(route.execution.details.minAmountOut, outDec);
      onLog(`SWAP // ROUTE_READY  PAIR: ${amountInFormatted} ${inSym} -> ${outFormatted} ${outSym}  (MIN: ${minFormatted} ${outSym})`);
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

  const outSymbolForLog = customOutMode ? customOutResult?.symbol : outToken?.symbol;
  const inSymbolForLog = inToken?.symbol ?? "?";

  const routeDetailLines = useMemo(() => {
    const lines: string[] = [];
    if (!route?.execution?.details || !route?.tokens) return lines;
    const byAddr = buildAddrToSymbol(route.tokens);
    const byDecimals = buildAddrToDecimals(route.tokens);
    const hopSwaps = route.execution.details.hopSwaps ?? [];
    let lineNum = 1;
    for (const hops of hopSwaps) {
      for (const swap of hops) {
        const inSym = byAddr[swap.tokenIn.toLowerCase()] ?? swap.tokenIn.slice(0, 6) + "…";
        const outSym = byAddr[swap.tokenOut.toLowerCase()] ?? swap.tokenOut.slice(0, 6) + "…";
        const inDec = byDecimals[swap.tokenIn.toLowerCase()] ?? 18;
        const outDec = byDecimals[swap.tokenOut.toLowerCase()] ?? 18;
        const amountInStr = formatBalanceAmount(swap.amountIn ?? "0", inDec);
        const amountOutStr = formatBalanceAmount(swap.amountOut ?? "0", outDec);
        lines.push(
          `${String(lineNum).padStart(2, "0")} ${amountInStr} ${inSym} -> ${amountOutStr} ${outSym} via ${swap.routerName} fee ${swap.fee}`
        );
        lineNum++;
      }
    }
    return lines;
  }, [route?.execution?.details, route?.tokens]);

  const handleApprove = useCallback(async () => {
    if (quoteStatus !== "APPROVAL_REQUIRED")
      return;
    if (!address || !walletClient?.account || !publicClient || !inToken || !route?.execution) return;
    if (inToken.address === "NATIVE_HYPE") return;
    const tokenInAddr = inToken.address as Address;
    const spender = route.execution.to as Address;
    setQuoteStatus("APPROVING");
    setQuoteError("");
    onLog?.("SWAP // APPROVING...");
    try {
      const hash = await walletClient.writeContract({
        account: walletClient.account,
        address: tokenInAddr,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, maxUint256],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        onLog?.("SWAP // ERROR  APPROVE_REVERTED");
        setQuoteStatus("ERROR");
        setQuoteError("APPROVE_REVERTED");
        return;
      }
      onLog?.("SWAP // APPROVED");
      setQuoteStatus("READY");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isReject = /reject|denied|user denied|user rejected/i.test(msg);
      onLog?.(isReject ? "SWAP // ERROR  SIGN_REJECTED" : `SWAP // ERROR  ${msg}`);
      setQuoteStatus("APPROVAL_REQUIRED");
      setQuoteError(isReject ? "SIGN_REJECTED" : msg);
    }
  }, [quoteStatus, inToken, route?.execution, address, walletClient, publicClient, onLog]);

  const handleSwap = useCallback(async () => {
    if (quoteStatus !== "READY" || !route?.execution || !inToken || !address || !walletClient?.account || !publicClient)
      return;
    const requiredRaw = parseUnits(amount.trim(), inToken.decimals);
    const balanceRaw = BigInt(inToken.balanceRaw ?? "0");
    if (balanceRaw < requiredRaw) {
      onLog?.("SWAP // ERROR  INSUFFICIENT_BALANCE");
      setQuoteStatus("ERROR");
      setQuoteError("INSUFFICIENT_BALANCE");
      return;
    }
    setQuoteStatus("EXECUTING");
    setQuoteError("");
    const outDec = route.tokens?.tokenOut?.decimals ?? 18;
    const amountOutFormatted = formatBalanceAmount(route.execution.details?.amountOut ?? "0", outDec);
    onLog?.(`SWAP // SUBMITTING...  PAIR: ${amount.trim()} ${inSymbolForLog} -> ${amountOutFormatted} ${outSymbolForLog ?? "?"}`);
    try {
      const hash = await walletClient.sendTransaction({
        to: route.execution.to as Address,
        data: route.execution.calldata as `0x${string}`,
        value: 0n,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") {
        onLog?.(`TX_CONFIRMED  ${hash}`);
        setAutoQuoteEnabled(false);
        setAmount("");
        setRoute(null);
        setQuoteStatus("IDLE");
        setQuoteError("");
        setNoRouteMessage("");
        try {
          const { balances: nextBalances } = await getBalances(address);
          await applyBalancesToState(address, nextBalances);
          onLog?.("SWAP // BALANCES_REFRESHED");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          onLog?.(`SWAP // BALANCES_REFRESH_FAILED  ${msg}`);
          if (process.env.NODE_ENV === "development") console.warn("[SwapTool] balance refresh failed:", err);
        }
      } else {
        onLog?.(`TX_REVERTED  ${hash}`);
        setAutoQuoteEnabled(false);
        setAmount("");
        setRoute(null);
        setQuoteStatus("REVERTED");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isReject = /reject|denied|user denied|user rejected/i.test(msg);
      onLog?.(isReject ? "SWAP // ERROR  SIGN_REJECTED" : `SWAP // ERROR  ${msg}`);
      setQuoteStatus("ERROR");
      setQuoteError(isReject ? "SIGN_REJECTED" : msg);
    }
  }, [quoteStatus, route, inToken, amount, address, walletClient, publicClient, onLog, inSymbolForLog, outSymbolForLog]);

  const handleViewRoute = useCallback(() => {
    if (!route?.execution?.details || !route?.tokens || routeDetailLines.length === 0) return;
    onLog?.("SWAP // ROUTE_DETAIL");
    routeDetailLines.forEach((line) => onLog?.(line));
  }, [route, routeDetailLines, onLog]);

  const handleCopyTx = useCallback(() => {
    if (!route?.execution) return;
    const payload = JSON.stringify({
      to: route.execution!.to,
      data: route.execution!.calldata,
      value: "0",
    });
    void navigator.clipboard.writeText(payload).then(() => onLog?.("SWAP // COPIED  to/data/value"));
  }, [route?.execution, onLog]);

  const displayOutToken = customOutMode ? customOutResult : outToken;
  const outOptions = commonOut
    ? [
        commonOut.HYPE,
        commonOut.WHYPE,
        commonOut.USDC,
        commonOut.USDT0,
      ]
    : [];

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
        {quoteStatus === "ERROR" || quoteStatus === "REVERTED" ? (
          <span className="text-danger glow-red font-bold uppercase tracking-wider">{quoteStatus}</span>
        ) : quoteStatus === "CONFIRMED" ? (
          <span className="text-success glow-green font-bold uppercase tracking-wider">{quoteStatus}</span>
        ) : quoteStatus === "QUOTING" || quoteStatus === "APPROVING" || quoteStatus === "EXECUTING" ? (
          <span className="text-text-dim">{quoteStatus}…</span>
        ) : quoteStatus === "READY" || quoteStatus === "APPROVAL_REQUIRED" ? (
          <span className="text-text">{quoteStatus}</span>
        ) : (
          <span className="text-text-dim">{quoteStatus}</span>
        )}
        {quoteStatus === "READY" && route?.execution?.details?.amountOut != null && route?.execution?.details?.minAmountOut != null && (() => {
          const outDec = route.tokens?.tokenOut?.decimals ?? 18;
          const outSym = customOutMode ? customOutResult?.symbol : outToken?.symbol;
          const outFormatted = formatBalanceAmount(route.execution.details.amountOut, outDec);
          const minFormatted = formatBalanceAmount(route.execution.details.minAmountOut, outDec);
          return (
            <span className="text-text-dim ml-1">
              OUT: {outFormatted} {outSym ?? "?"} / MIN: {minFormatted} {outSym ?? "?"}
            </span>
          );
        })()}
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
                setAutoQuoteEnabled(true);
                const addr = e.target.value;
                const t = balances.find((b) => b.address === addr) ?? null;
                setInToken(t);
              }}
            >
              <option value="">Select token</option>
              {balances.map((b) => (
                <option key={b.address} value={b.address}>
                  {formatBalanceAmount(b.balanceRaw, b.decimals)} {b.symbol}
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
                      setAutoQuoteEnabled(true);
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
                        setAutoQuoteEnabled(true);
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
              onChange={(e) => {
                setAutoQuoteEnabled(true);
                setAmount(e.target.value);
              }}
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

      <div className="flex flex-wrap items-center gap-2">
        {quoteStatus === "READY" && (
          <Button
            variant="gold"
            size="md"
            onClick={() => void handleSwap()}
            disabled={!address || !walletClient?.account || !publicClient}
          >
            SWAP
          </Button>
        )}
        {quoteStatus === "APPROVAL_REQUIRED" && (
          <Button
            variant="outline"
            size="md"
            onClick={() => void handleApprove()}
            disabled={!address || !walletClient?.account || !publicClient}
          >
            APPROVE
          </Button>
        )}
        {quoteStatus === "APPROVING" && (
          <Button variant="outline" size="md" disabled>
            APPROVING…
          </Button>
        )}
        {quoteStatus === "EXECUTING" && (
          <Button variant="gold" size="md" disabled>
            EXECUTING…
          </Button>
        )}
        {routeDetailLines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleViewRoute}>
            VIEW ROUTE
          </Button>
        )}
        {route?.execution && (
          <Button variant="ghost" size="sm" onClick={handleCopyTx}>
            COPY TX
          </Button>
        )}
      </div>
    </div>
  );
}
