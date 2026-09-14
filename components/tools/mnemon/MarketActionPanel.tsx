"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { Landmark } from "lucide-react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TransactionLog } from "@/components/vault/TransactionTerminal";
import { blueActionsSupported, runBlueAction, useBlueMarket } from "@/lib/web3/blue";
import { formatAmount, parseAmount } from "@/lib/web3/format";
import { chainOf, chainTag, explorerTxUrl, fmtPct } from "@/lib/mnemon/format";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import { cn, formatNumberWithCommas } from "@/lib/utils";

// Lend / withdraw the loan token of one Morpho Blue market from the MNEMON
// drill-down. Mirrors components/vault/DepositPanel.tsx (status badges,
// gold mode toggle, bordered amount box with token chip + HALF/MAX, gold
// primary button) so the two write surfaces read as one. Logs are lifted to
// the parent via onTransactionLogsChange — the drill-down renders the
// TransactionTerminal beside this panel, exactly like the vault page.
// Writes go through lib/web3/blue.ts (Morpho SDK → Bundler3): the SDK's
// approval requirement is a classic approve tx, sent before the bundle in
// the same click. Market-health warnings live in the drill-down banner, not
// here — only wallet state gates the button.
// ponytail: borrow side (collateral/borrow/repay) is the next phase.

const ACK_KEY = "mnemon-blue-terms-ack";
const DISCLAIMER_URL = "https://morpho.org/disclaimers/";
// Icons we ship for the assets our vaults use; other loan tokens get the
// generic icon-slot, same as DepositPanel without assetLogoSrc.
const TOKEN_ICONS: Record<string, string> = {
  USDT0: "/USDT0-TokenIcon.png",
  USDC: "/USDC-TokenIcon.svg",
  WHYPE: "/WHYPE-TokenIcon.svg",
};

function nowHms(): string {
  return new Date().toTimeString().slice(0, 8);
}

function shortError(e: unknown): string {
  const msg =
    (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

export function MarketActionPanel({
  market,
  onTransactionLogsChange,
}: {
  market: MarketHealthEntry;
  onTransactionLogsChange?: (logs: TransactionLog[]) => void;
}) {
  const chainId = chainOf(market);
  const { address: account, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const q = useBlueMarket(chainId, market.market_id, account);

  const [isLendMode, setIsLendMode] = useState(true);
  const [amount, setAmount] = useState("");
  const [withdrawAll, setWithdrawAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [ack, setAck] = useState(false);
  // Client-only read — the drill-down can be server-rendered on the landing.
  useEffect(() => {
    try {
      setAck(localStorage.getItem(ACK_KEY) === "1");
    } catch {
      /* storage blocked — the checkbox gates this session only */
    }
  }, []);
  useEffect(() => {
    onTransactionLogsChange?.(logs);
  }, [logs, onTransactionLogsChange]);

  const supported = blueActionsSupported(chainId);
  const isCorrectChain = isConnected && walletChainId === chainId;
  const sym = q.data?.loanToken.symbol ?? market.loan_symbol ?? "?";
  const dec = q.data?.loanToken.decimals ?? null;
  const supplied = q.data?.positionData?.supplyAssets ?? null;
  const walletBalance = q.data?.walletBalance ?? null;
  const source = isLendMode ? walletBalance : supplied; // what HALF/MAX draw from
  const iconSrc = TOKEN_ICONS[sym];
  const fmt = (v: bigint | null | undefined, digits = 4) =>
    v != null && dec != null ? formatNumberWithCommas(Number(formatAmount(v, dec, dec)), digits, true) : "0.0000";

  const addLog = useCallback(
    (level: TransactionLog["level"], message: string, txHash?: `0x${string}`) =>
      setLogs((prev) => [
        ...prev,
        {
          timestamp: nowHms(),
          level,
          message,
          txHash,
          explorerUrl: txHash ? explorerTxUrl(chainId, txHash) ?? undefined : undefined,
        },
      ]),
    [chainId]
  );

  const acceptTerms = (checked: boolean) => {
    setAck(checked);
    try {
      localStorage.setItem(ACK_KEY, checked ? "1" : "0");
    } catch {
      /* see above */
    }
  };

  const setFraction = (den: bigint) => {
    if (source == null || dec == null) return;
    setAmount(formatAmount(source / den, dec, dec));
    setWithdrawAll(!isLendMode && den === 1n);
    setError(null);
  };

  const submit = async () => {
    if (!account || !q.data || !walletClient || !publicClient || dec == null) return;
    const { market: m, marketData, positionData } = q.data;
    setBusy(true);
    setError(null);
    try {
      const amt = parseAmount(amount, dec);
      const action = isLendMode
        ? m.supply({ amount: amt, userAddress: account, marketData })
        : withdrawAll && positionData
          ? // Full exit by shares: an asset snapshot leaves interest dust behind.
            m.withdraw({ shares: positionData.supplyShares, userAddress: account, positionData })
          : m.withdraw({ assets: amt, userAddress: account, positionData: positionData! });
      addLog("INFO", `${isLendMode ? "Supplying" : "Withdrawing"} ${amount} ${sym}…`);
      const hash = await runBlueAction(action, {
        account,
        walletClient,
        publicClient,
        log: (line) => addLog("INFO", line),
      });
      addLog("SUCCESS", `${isLendMode ? "Supplied" : "Withdrew"} ${amount} ${sym}`, hash);
      setAmount("");
      setWithdrawAll(false);
      void q.refetch();
    } catch (e) {
      const msg = shortError(e);
      setError(msg);
      addLog("ERROR", `${isLendMode ? "Supply" : "Withdrawal"} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const processing = busy || switching;
  const canSubmit = isCorrectChain && supported && ack && !!amount && !!q.data && !processing;

  return (
    <div className="space-y-3">
      {/* Connection status — clickable, unlike the vault page's static badges */}
      {!isConnected && (
        <button
          type="button"
          onClick={() => openConnectModal?.()}
          className="w-full border border-danger/60 bg-danger/10 text-danger text-[10px] py-1 uppercase tracking-wider font-mono hover:bg-danger/20 transition-colors"
        >
          CONNECT WALLET
        </button>
      )}
      {isConnected && !supported && (
        <div className="w-full border border-danger/60 bg-danger/10 text-danger text-[10px] py-1 text-center uppercase tracking-wider font-mono">
          UNSUPPORTED CHAIN
        </div>
      )}
      {isConnected && supported && walletChainId !== chainId && (
        <button
          type="button"
          onClick={() => switchChainAsync({ chainId }).catch((e) => setError(shortError(e)))}
          disabled={switching}
          className="w-full border border-danger/60 bg-danger/10 text-danger text-[10px] py-1 uppercase tracking-wider font-mono hover:bg-danger/20 transition-colors disabled:opacity-60"
        >
          {switching ? "SWITCHING…" : `WRONG NETWORK — SWITCH TO ${chainTag(chainId)}`}
        </button>
      )}

      {/* Lend/Withdraw Toggle */}
      <div className="grid grid-cols-2 gap-2 bg-panel p-1 border border-border">
        {[true, false].map((lend) => (
          <button
            key={String(lend)}
            type="button"
            onClick={() => {
              setIsLendMode(lend);
              setAmount("");
              setWithdrawAll(false);
              setError(null);
            }}
            className={cn(
              "font-bold text-[10px] py-2 uppercase tracking-wider text-center transition-colors",
              isLendMode === lend ? "bg-gold text-bg-base" : "bg-transparent text-text-dim hover:text-white"
            )}
          >
            {lend ? "Lend" : "Withdraw"}
          </button>
        ))}
      </div>

      {/* Amount Input */}
      <div className="border border-border p-3 bg-panel/30">
        <div className="text-[9px] text-text-dim uppercase tracking-wider mb-2 font-bold">
          {isLendMode ? "Lend Amount" : "Withdraw Amount"}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setWithdrawAll(false);
              setError(null);
            }}
            disabled={!isCorrectChain || processing}
            className="w-full bg-bg-base border border-border text-white text-lg p-2 rounded-none focus:border-gold focus:ring-0 focus:outline-none font-mono placeholder:text-text-dim/30"
          />
          <div className="flex items-center bg-bg-base border border-border h-full px-2 py-2 gap-1 shrink-0">
            {iconSrc ? (
              <Image src={iconSrc} alt={sym} width={14} height={14} className="w-[14px] h-[14px] rounded-full" unoptimized />
            ) : (
              <span className="icon-slot w-[14px] h-[14px] border border-success glow-gold-icon" />
            )}
            <span className="text-[10px] font-bold text-white">{sym}</span>
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-[9px] text-text-dim flex items-center gap-1" title={isLendMode ? "Wallet balance" : "Your supply in this market, interest accrued"}>
            <Landmark className="w-[10px] h-[10px] text-text-dim" strokeWidth={2} />
            {fmt(source)} {sym}
            {!isLendMode && <span className="text-text-dim/50">supplied</span>}
          </div>
          <div className="flex gap-1">
            {(
              [
                ["Half", 2n],
                ["Max", 1n],
              ] as const
            ).map(([label, den]) => (
              <button
                key={label}
                type="button"
                onClick={() => setFraction(den)}
                className="border border-border text-text-dim hover:text-white hover:bg-border/20 text-[10px] sm:text-[8px] px-3 py-1.5 sm:px-2 sm:py-0.5 uppercase font-bold transition-all disabled:opacity-40"
                disabled={!isCorrectChain || processing || !source}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-danger mt-1 font-mono">{error}</p>}
      </div>

      {/* Market Info */}
      <div className="space-y-1 text-xs font-mono text-text-dim/50">
        <div className="flex justify-between" title="Live on-chain supply rate (variable — moves with utilization)">
          <span>Supply APY:</span>
          <span className="text-gold/70">{q.data ? fmtPct(q.data.marketData.supplyApy) : fmtPct(market.supply_apy)}</span>
        </div>
        <div className="flex justify-between" title="Loan tokens withdrawable right now">
          <span>Liquidity:</span>
          <span>{q.data ? `${fmt(q.data.marketData.liquidity, 2)} ${sym}` : "—"}</span>
        </div>
        {isConnected && isLendMode && (
          <div className="flex justify-between" title="Your supply in this market, interest accrued">
            <span>Supplied:</span>
            <span>{fmt(supplied)} {sym}</span>
          </div>
        )}
      </div>

      {/* Terms — Morpho's integration guidance asks for an acknowledgment before the first tx */}
      {isCorrectChain && (
        <label className="flex items-start gap-2 text-[9px] font-mono text-text-dim leading-snug cursor-pointer">
          <input type="checkbox" checked={ack} onChange={(e) => acceptTerms(e.target.checked)} className="mt-0.5 accent-[var(--gold)]" />
          <span>
            Variable-rate Morpho market with smart-contract, oracle and liquidity risk. I accept the{" "}
            <a href={DISCLAIMER_URL} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
              Morpho disclaimer
            </a>
            .
          </span>
        </label>
      )}

      {/* Action Button */}
      {isLendMode ? (
        <Button
          variant="outline"
          className="w-full border-gold bg-gold/80 hover:bg-gold text-text"
          onClick={submit}
          disabled={!canSubmit}
        >
          {processing ? "Processing..." : `Lend ${sym}`}
        </Button>
      ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={submit}
          disabled={!canSubmit || (supplied ?? 0n) === 0n}
        >
          {processing ? "Processing..." : "Withdraw"}
        </Button>
      )}
    </div>
  );
}
