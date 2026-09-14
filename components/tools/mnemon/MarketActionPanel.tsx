"use client";

import { useCallback, useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlitchTypeText } from "@/components/ui/animated-text";
import type { TransactionLog } from "@/components/vault/TransactionTerminal";
import { blueActionsSupported, runBlueAction, useBlueMarket } from "@/lib/web3/blue";
import { formatAmount, parseAmount } from "@/lib/web3/format";
import { chainOf, chainTag, explorerTxUrl, fmtAmount, fmtPct } from "@/lib/mnemon/format";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import { cn, formatNumberWithCommas } from "@/lib/utils";

// Lend / withdraw the loan token of one Morpho Blue market from the MNEMON
// drill-down. A cross of the vault DepositPanel (bordered amount box with
// HALF/MAX, gold primary button) and the drill-down's own conventions
// (9px tracking-widest labels, Metric rows, bg-bg-base panel, glitch-in
// values), kept to the chart's height. The LEND|WITHDRAW mode lives in the
// column's label row — the parent renders it via `ModeTabs` — so the panel
// body starts at the amount box. Logs are lifted through
// onTransactionLogsChange; the parent renders the TransactionTerminal
// beside this panel. Writes go through lib/web3/blue.ts (Morpho SDK →
// Bundler3): the SDK's approval requirement is a classic approve tx sent
// before the bundle in the same click. Market-health warnings live in the
// drill-down banner — only wallet state gates the button.
// ponytail: borrow side (collateral/borrow/repay) is the next phase.

const ACK_KEY = "mnemon-blue-terms-ack";
const DISCLAIMER_URL = "https://morpho.org/disclaimers/";

export type ActionMode = "lend" | "withdraw";

function nowHms(): string {
  return new Date().toTimeString().slice(0, 8);
}

function shortError(e: unknown): string {
  const msg =
    (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

// Drill-down Metric look (label dim, value right), async-aware.
function Metric({
  label,
  value,
  loading,
  tone = "text-text",
  title,
}: {
  label: string;
  value: string;
  loading: boolean;
  tone?: string;
  title?: string;
}) {
  return (
    <div className="flex justify-between gap-3 text-[10px] font-mono" title={title}>
      <span className="text-text-dim">{label}</span>
      <span className={tone}>
        <GlitchTypeText loading={loading} value={value} mode="text" />
      </span>
    </div>
  );
}

/** LEND | WITHDRAW tabs for the column label row (drill-down micro-tab style). */
export function ModeTabs({ mode, onChange }: { mode: ActionMode; onChange: (m: ActionMode) => void }) {
  return (
    <div className="flex gap-3">
      {(["lend", "withdraw"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={cn(
            "uppercase tracking-widest transition-colors",
            mode === m ? "text-gold border-b border-gold" : "text-text-dim hover:text-text"
          )}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function MarketActionPanel({
  market,
  mode,
  onTransactionLogsChange,
}: {
  market: MarketHealthEntry;
  mode: ActionMode;
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
  const isLend = mode === "lend";

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
  // Mode switch resets the draft.
  useEffect(() => {
    setAmount("");
    setWithdrawAll(false);
    setError(null);
  }, [mode]);

  const supported = blueActionsSupported(chainId);
  const isCorrectChain = isConnected && walletChainId === chainId;
  const sym = q.data?.loanToken.symbol ?? market.loan_symbol ?? "?";
  const dec = q.data?.loanToken.decimals ?? null;
  const supplied = q.data?.positionData?.supplyAssets ?? null;
  const walletBalance = q.data?.walletBalance ?? null;
  const source = isLend ? walletBalance : supplied; // what HALF/MAX draw from
  const toNum = (v: bigint) => (dec == null ? 0 : Number(formatAmount(v, dec, dec)));
  const exact = (v: bigint | null | undefined) =>
    v != null && dec != null ? `${formatNumberWithCommas(toNum(v), 2, true)} ${sym}` : "—";

  // Draft impact: what the book and the position look like AFTER this action
  // (a deposit lowers utilization and therefore the rate — worth seeing
  // before clicking). Null draft = show the current state.
  let draft: bigint | null = null;
  try {
    if (dec != null && amount) draft = parseAmount(amount, dec);
  } catch {
    /* partial input — fall back to current state */
  }
  const md = q.data?.marketData;
  const signed = draft == null ? 0n : isLend ? draft : -draft;
  const supplyAfter = md ? md.totalSupplyAssets + signed : null;
  const positionAfter = supplied != null ? supplied + signed : null;
  const utilAfter =
    md && supplyAfter != null && supplyAfter > 0n && md.totalBorrowAssets <= supplyAfter
      ? Number(md.totalBorrowAssets) / Number(supplyAfter)
      : null;
  const bookShare =
    positionAfter != null && supplyAfter != null && supplyAfter > 0n && positionAfter >= 0n
      ? Number(positionAfter) / Number(supplyAfter)
      : null;
  const yieldPerYear =
    positionAfter != null && positionAfter >= 0n && md ? toNum(positionAfter) * md.supplyApy : null;

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

  const acceptTerms = () => {
    setAck(true);
    try {
      localStorage.setItem(ACK_KEY, "1");
    } catch {
      /* see above */
    }
  };

  const setFraction = (den: bigint) => {
    if (source == null || dec == null) return;
    setAmount(formatAmount(source / den, dec, dec));
    setWithdrawAll(!isLend && den === 1n);
    setError(null);
  };

  const submit = async () => {
    if (!isConnected) return openConnectModal?.();
    if (!isCorrectChain) {
      await switchChainAsync({ chainId }).catch((e) => setError(shortError(e)));
      return;
    }
    if (!account || !q.data || !walletClient || !publicClient || dec == null) return;
    const { market: m, marketData, positionData } = q.data;
    setBusy(true);
    setError(null);
    try {
      const amt = parseAmount(amount, dec);
      const action = isLend
        ? m.supply({ amount: amt, userAddress: account, marketData })
        : withdrawAll && positionData
          ? // Full exit by shares: an asset snapshot leaves interest dust behind.
            m.withdraw({ shares: positionData.supplyShares, userAddress: account, positionData })
          : m.withdraw({ assets: amt, userAddress: account, positionData: positionData! });
      addLog("INFO", `${isLend ? "Supplying" : "Withdrawing"} ${amount} ${sym}…`);
      const hash = await runBlueAction(action, {
        account,
        walletClient,
        publicClient,
        log: (line) => addLog("INFO", line),
      });
      addLog("SUCCESS", `${isLend ? "Supplied" : "Withdrew"} ${amount} ${sym}`, hash);
      setAmount("");
      setWithdrawAll(false);
      void q.refetch();
    } catch (e) {
      const msg = shortError(e);
      setError(msg);
      addLog("ERROR", `${isLend ? "Supply" : "Withdrawal"} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const processing = busy || switching;
  const noPosition = !isLend && (supplied ?? 0n) === 0n;
  // The button is the state machine — no separate status badges (keeps the
  // panel at the chart's height). Wallet state first, then the draft.
  const label = !supported
    ? "UNSUPPORTED_CHAIN"
    : !isConnected
      ? "CONNECT_WALLET"
      : !isCorrectChain
        ? `SWITCH_TO_${chainTag(chainId)}`
        : processing
          ? "PROCESSING…"
          : noPosition
            ? "NO_POSITION"
            : isLend
              ? `LEND ${sym}`
              : `WITHDRAW ${sym}`;
  const disabled =
    !supported || processing || (isCorrectChain && (!ack || noPosition || !amount || !q.data));

  return (
    <div className="h-full flex flex-col gap-2 p-3 bg-bg-base border border-border">
      {/* Amount box — DepositPanel's, compacted to two lines */}
      <div className="border border-border p-2 bg-panel/30 space-y-1.5">
        <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-widest text-text-dim">
          <span>{isLend ? "LEND_AMOUNT" : "WITHDRAW_AMOUNT"}</span>
          <span
            className="flex items-center gap-1 normal-case tracking-normal"
            title={isLend ? "Wallet balance" : "Your supply in this market, interest accrued"}
          >
            <Landmark className="w-[10px] h-[10px]" strokeWidth={2} />
            {isConnected ? exact(source) : "—"}
          </span>
        </div>
        <div className="flex items-stretch gap-1">
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
            className="w-full min-w-0 h-8 bg-bg-base border border-border text-white text-sm p-2 rounded-none focus:border-gold focus:ring-0 focus:outline-none font-mono placeholder:text-text-dim/30"
          />
          <span className="flex items-center px-2 border border-border bg-bg-base text-[10px] font-bold text-white shrink-0">
            {sym}
          </span>
          {(
            [
              ["HALF", 2n],
              ["MAX", 1n],
            ] as const
          ).map(([l, den]) => (
            <button
              key={l}
              type="button"
              onClick={() => setFraction(den)}
              disabled={!isCorrectChain || processing || !source}
              className="px-2 border border-border text-text-dim hover:text-white hover:bg-border/20 text-[8px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:hover:text-text-dim disabled:hover:bg-transparent shrink-0"
            >
              {l}
            </button>
          ))}
        </div>
        {error && <p className="text-[10px] text-danger font-mono">{error}</p>}
      </div>

      {/* Market + position metrics, drill-down style. flex-1 + content-between
          spread the rows over whatever height the chart column imposes, so
          the panel never shows an empty band. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 flex-1 content-between">
        <Metric
          label="SUPPLY_APY"
          value={q.data ? fmtPct(q.data.marketData.supplyApy) : fmtPct(market.supply_apy)}
          loading={!q.data}
          tone="text-gold"
          title="Live on-chain supply rate (variable — moves with utilization)"
        />
        <Metric
          label="LIQUIDITY"
          value={q.data ? fmtAmount(toNum(q.data.marketData.liquidity), sym) : "—"}
          loading={!q.data}
          title="Loan tokens withdrawable right now"
        />
        <Metric
          label="WALLET"
          value={isConnected ? exact(walletBalance) : "—"}
          loading={isConnected && !q.data}
          title="Loan-token balance in the connected wallet"
        />
        <Metric
          label="SUPPLIED"
          value={isConnected ? exact(supplied) : "—"}
          loading={isConnected && !q.data}
          title="Your supply in this market, interest accrued"
        />
        <Metric
          label="TOTAL_SUPPLY"
          value={md ? fmtAmount(toNum(md.totalSupplyAssets), sym) : "—"}
          loading={!q.data}
          title="Whole lender book of this market, on-chain"
        />
        <Metric
          label="UTIL_AFTER"
          value={fmtPct(utilAfter, 1)}
          loading={!q.data}
          tone={draft != null ? "text-gold" : "text-text"}
          title="Utilization once this action lands — a deposit dilutes borrowers' demand and pulls the rate down; a withdrawal does the reverse"
        />
        <Metric
          label="BOOK_SHARE"
          value={isConnected ? fmtPct(bookShare, 2) : "—"}
          loading={isConnected && !q.data}
          tone={draft != null ? "text-gold" : "text-text"}
          title="Your share of the lender book after this action"
        />
        <Metric
          label="YIELD_1Y"
          value={isConnected && yieldPerYear != null ? fmtAmount(yieldPerYear, sym) : "—"}
          loading={isConnected && !q.data}
          tone={draft != null ? "text-gold" : "text-text"}
          title="What your position after this action earns per year at today's variable rate — not a promise"
        />
      </div>

      {/* Terms — Morpho's integration guidance asks for one acknowledgment
          before the first tx; persisted, so the line disappears afterwards. */}
      {isCorrectChain && !ack && (
        <label className="flex items-start gap-2 text-[9px] font-mono text-text-dim leading-snug cursor-pointer">
          <input type="checkbox" checked={false} onChange={acceptTerms} className="mt-0.5 accent-[var(--gold)]" />
          <span>
            Variable-rate Morpho market: smart-contract, oracle and liquidity risk. I accept the{" "}
            <a href={DISCLAIMER_URL} target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">
              Morpho disclaimer
            </a>
            .
          </span>
        </label>
      )}

      <Button
        variant="outline"
        onClick={submit}
        disabled={disabled}
        className={cn(
          "w-full h-8 rounded-none font-mono text-[10px] tracking-widest uppercase",
          isLend && isCorrectChain && "border-gold bg-gold/80 hover:bg-gold text-text"
        )}
      >
        {label}
      </Button>
    </div>
  );
}
