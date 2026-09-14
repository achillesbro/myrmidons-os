"use client";

import { useState } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TransactionTerminal, type TransactionLog } from "@/components/vault/TransactionTerminal";
import { blueActionsSupported, runBlueAction, useBlueMarket } from "@/lib/web3/blue";
import { formatAmount, parseAmount } from "@/lib/web3/format";
import { chainOf, chainTag, explorerTxUrl, fmtPct } from "@/lib/mnemon/format";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import { cn, formatNumberWithCommas } from "@/lib/utils";

// Lend / withdraw the loan token of one Morpho Blue market, straight from the
// MNEMON drill-down (replaces the old LIQUIDATIONS // 30D column; the
// analyser table is the only caller — vault pages stay read-only). Writes go
// through lib/web3/blue.ts (Morpho SDK → Bundler3): classic approve tx, then
// the bundle. Warnings live in the drill-down banner above, never here — the
// confirm button is never blocked by market health, only by wallet state.
// ponytail: borrow side (collateral/borrow/repay) is the next phase.

const ACK_KEY = "mnemon-blue-terms-ack";
const DISCLAIMER_URL = "https://morpho.org/disclaimers/";

function nowHms(): string {
  return new Date().toTimeString().slice(0, 8);
}

function shortError(e: unknown): string {
  const msg =
    (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex justify-between gap-3 text-[10px] font-mono" title={title}>
      <span className="text-text-dim">{label}</span>
      <span className="text-text">{value}</span>
    </div>
  );
}

export function MarketActionPanel({ market }: { market: MarketHealthEntry }) {
  const chainId = chainOf(market);
  const { address: account } = useAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const q = useBlueMarket(chainId, market.market_id, account);

  const [mode, setMode] = useState<"lend" | "withdraw">("lend");
  const [amount, setAmount] = useState("");
  const [withdrawAll, setWithdrawAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<TransactionLog[]>([]);
  const [ack, setAck] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(ACK_KEY) === "1";
    } catch {
      return false;
    }
  });

  const supported = blueActionsSupported(chainId);
  const sym = q.data?.loanToken.symbol ?? market.loan_symbol ?? "?";
  const dec = q.data?.loanToken.decimals;
  const supplied = q.data?.positionData?.supplyAssets ?? null;
  const fmt = (v: bigint | null | undefined) =>
    v != null && dec != null ? `${formatNumberWithCommas(Number(formatAmount(v, dec, dec)), 2, true)} ${sym}` : "—";

  const log = (level: TransactionLog["level"], message: string, txHash?: `0x${string}`) =>
    setLogs((prev) => [
      ...prev,
      { timestamp: nowHms(), level, message, txHash, explorerUrl: txHash ? explorerTxUrl(chainId, txHash) ?? undefined : undefined },
    ]);

  const acceptTerms = (checked: boolean) => {
    setAck(checked);
    try {
      localStorage.setItem(ACK_KEY, checked ? "1" : "0");
    } catch {
      /* storage blocked — the checkbox still gates this session */
    }
  };

  const setMax = () => {
    if (dec == null) return;
    const v = mode === "lend" ? q.data?.walletBalance : supplied;
    if (v == null) return;
    setAmount(formatAmount(v, dec, dec));
    setWithdrawAll(mode === "withdraw");
  };

  const submit = async () => {
    if (!account) return openConnectModal?.();
    if (walletChainId !== chainId) {
      await switchChainAsync({ chainId });
      return;
    }
    if (!q.data || !walletClient || !publicClient || dec == null) return;
    const { market: m, marketData, positionData } = q.data;
    setBusy(true);
    try {
      const amt = parseAmount(amount, dec);
      const action =
        mode === "lend"
          ? m.supply({ amount: amt, userAddress: account, marketData })
          : withdrawAll && positionData
            ? // Full exit by shares: an asset snapshot leaves interest dust behind.
              m.withdraw({ shares: positionData.supplyShares, userAddress: account, positionData })
            : m.withdraw({ assets: amt, userAddress: account, positionData: positionData! });
      log("INFO", `${mode === "lend" ? "Supplying" : "Withdrawing"} ${amount} ${sym}…`);
      const hash = await runBlueAction(action, {
        account,
        walletClient,
        publicClient,
        log: (line) => log("INFO", line),
      });
      log("SUCCESS", `${mode === "lend" ? "Supplied" : "Withdrew"} ${amount} ${sym}`, hash);
      setAmount("");
      setWithdrawAll(false);
      void q.refetch();
    } catch (e) {
      log("ERROR", shortError(e));
    } finally {
      setBusy(false);
    }
  };

  const noPosition = mode === "withdraw" && (supplied ?? 0n) === 0n;
  const label = !supported
    ? "UNSUPPORTED_CHAIN"
    : !account
      ? "CONNECT_WALLET"
      : walletChainId !== chainId
        ? `SWITCH_TO_${chainTag(chainId)}`
        : !ack
          ? "ACCEPT_TERMS"
          : busy || switching
            ? "PENDING…"
            : noPosition
              ? "NO_POSITION"
              : mode === "lend"
                ? "SUPPLY"
                : "WITHDRAW";
  const needsInput = Boolean(account) && walletChainId === chainId;
  const disabled =
    !supported || busy || switching || (needsInput && (!ack || noPosition || !amount || !q.data));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[9px] uppercase tracking-widest font-mono">
        <span className="text-text-dim">LEND // {market.loan_symbol ?? "?"}</span>
        <div className="flex gap-3">
          {(["lend", "withdraw"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setAmount("");
                setWithdrawAll(false);
              }}
              className={cn(
                "uppercase tracking-widest transition-colors",
                mode === m ? "text-gold border-b border-gold" : "text-text-dim hover:text-text"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Row label="WALLET" value={account ? fmt(q.data?.walletBalance) : "—"} />
        <Row label="SUPPLIED" value={account ? fmt(supplied) : "—"} title="Your supply in this market, interest accrued" />
        <Row
          label="SUPPLY_APY"
          value={q.data ? fmtPct(q.data.marketData.supplyApy) : fmtPct(market.supply_apy)}
          title="Live on-chain rate (variable — moves with utilization)"
        />
        <Row label="LIQUIDITY" value={fmt(q.data?.marketData.liquidity)} title="Loan tokens withdrawable right now" />
      </div>

      <div className="flex gap-1">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setWithdrawAll(false);
          }}
          disabled={!needsInput || busy}
          className="w-full bg-bg-base border border-border text-white text-sm p-2 h-9 rounded-none focus:border-gold focus:ring-0 focus:outline-none font-mono placeholder:text-text-dim/30"
        />
        <button
          type="button"
          onClick={setMax}
          disabled={!needsInput || busy || dec == null}
          className="px-2 h-9 border border-border bg-bg-base text-[9px] tracking-widest text-text-dim hover:text-gold hover:border-gold disabled:opacity-40 disabled:hover:text-text-dim disabled:hover:border-border transition-colors"
        >
          MAX
        </button>
      </div>

      {needsInput && (
        <label className="flex items-start gap-2 text-[9px] font-mono text-text-dim leading-snug cursor-pointer">
          <input type="checkbox" checked={ack} onChange={(e) => acceptTerms(e.target.checked)} className="mt-0.5 accent-[var(--gold)]" />
          <span>
            I understand this is a variable-rate Morpho market with smart-contract, oracle and liquidity risk, and accept the{" "}
            <a href={DISCLAIMER_URL} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
              Morpho disclaimer
            </a>
            .
          </span>
        </label>
      )}

      <Button onClick={submit} disabled={disabled} className="w-full h-9 rounded-none font-mono text-[10px] tracking-widest">
        {label}
      </Button>

      {logs.length > 0 && <TransactionTerminal logs={logs} className="max-h-32 min-h-0" />}
    </div>
  );
}
