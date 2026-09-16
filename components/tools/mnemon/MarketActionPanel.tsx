"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAccount, useChainId, usePublicClient, useSwitchChain, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlitchTypeText } from "@/components/ui/animated-text";
import type { TransactionLog } from "@/components/vault/TransactionTerminal";
import {
  accruedDebt,
  blueActionsSupported,
  buildBlueAction,
  canCloseDebt,
  projectPosition,
  runBlueAction,
  safeMaxBorrow,
  safeWithdrawableCollateral,
  shouldCloseAll,
  useBlueMarket,
  type BlueMode,
  type BluePositionData,
} from "@/lib/web3/blue";
import { formatAmount, parseAmount } from "@/lib/web3/format";
import { chainOf, chainTag, explorerTxUrl, fmtAmount, fmtLltv, fmtPct, fmtPrice, fmtRatio } from "@/lib/mnemon/format";
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";
import { cn, formatNumberWithCommas } from "@/lib/utils";

// Lend / withdraw / borrow / repay on one Morpho Blue market from the MNEMON
// drill-down. A cross of the vault DepositPanel (bordered amount box with
// HALF/MAX, gold primary button) and the drill-down's own conventions
// (9px tracking-widest labels, Metric rows at the tiles' pitch, bg-bg-base
// box, glitch-in values). The mode lives in the column's label row — the
// parent renders `ModeTabs` — so the body starts at the amount box(es):
//   LEND / WITHDRAW  one box (loan token)      metrics: book + position
//   BORROW           collateral box + loan box metrics: risk (LTV, liq price…)
//   REPAY            loan box + collateral box same risk metrics
// Borrow-side metrics are the SDK's AccrualPosition math on a PROJECTED
// position (projectPosition), so LTV / health / liquidation price after the
// draft come from the same code that guards the transaction. Writes go
// through lib/web3/blue.ts (Morpho SDK → Bundler3): classic approve tx, a
// one-time GeneralAdapter1 authorization, then the bundle, in one click.
// Atomic pairs: supplyCollateralBorrow / repayWithdrawCollateral. Full
// exits use shares (interest dust). Market-health warnings live in the
// drill-down banner — only wallet state and the draft gate the button.

const ACK_KEY = "mnemon-blue-terms-ack";
const DISCLAIMER_URL = "https://morpho.org/disclaimers/";
const WAD = 10n ** 18n;

export type ActionMode = BlueMode;
const MODES: readonly ActionMode[] = ["lend", "withdraw", "borrow", "repay"];
export const isBorrowSide = (m: ActionMode) => m === "borrow" || m === "repay";

function nowHms(): string {
  return new Date().toTimeString().slice(0, 8);
}

function shortError(e: unknown): string {
  const msg =
    (e as { shortMessage?: string })?.shortMessage ?? (e instanceof Error ? e.message : String(e));
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

function tryParse(amount: string, decimals: number | null): bigint | null {
  try {
    return decimals != null && amount ? parseAmount(amount, decimals) : null;
  } catch {
    return null; // partial input — treat as no draft
  }
}

// WAD-scaled ratio → number, with the SDK's MaxUint sentinel (price 0 /
// no debt) collapsed to null so nothing renders as a giant percentage.
function wadToNumber(v: bigint | null | undefined): number | null {
  if (v == null || v > WAD * 1_000_000n) return null;
  return Number(v) / 1e18;
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

/** Mode tabs for the column label row (drill-down micro-tab style). */
export function ModeTabs({ mode, onChange }: { mode: ActionMode; onChange: (m: ActionMode) => void }) {
  return (
    <div className="flex gap-3">
      {MODES.map((m) => (
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

// DepositPanel's amount box, compacted to two lines: label + reference
// figure (what HALF/MAX draw from), then input | symbol | HALF | MAX.
function AmountBox({
  label,
  sym,
  reference,
  referenceIcon,
  referenceTitle,
  value,
  onChange,
  onFraction,
  disabled,
  canFraction,
}: {
  label: string;
  sym: string;
  reference: string;
  referenceIcon?: ReactNode;
  referenceTitle: string;
  value: string;
  onChange: (v: string) => void;
  onFraction: (den: bigint) => void;
  disabled: boolean;
  canFraction: boolean;
}) {
  return (
    <div className="flex-1 flex flex-col justify-between gap-1.5 border border-border p-3 bg-panel/30">
      <div className="flex justify-between items-center text-[9px] font-mono uppercase tracking-widest text-text-dim">
        <span>{label}</span>
        <span className="flex items-center gap-1 normal-case tracking-normal" title={referenceTitle}>
          {referenceIcon}
          {reference}
        </span>
      </div>
      <div className="flex items-stretch gap-1">
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0.0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full min-w-0 h-10 bg-bg-base border border-border text-white text-base p-2 rounded-none focus:border-gold focus:ring-0 focus:outline-none font-mono placeholder:text-text-dim/30"
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
            onClick={() => onFraction(den)}
            disabled={disabled || !canFraction}
            className="px-2 border border-border text-text-dim hover:text-white hover:bg-border/20 text-[8px] uppercase font-bold tracking-wider transition-all disabled:opacity-40 disabled:hover:text-text-dim disabled:hover:bg-transparent shrink-0"
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MarketActionPanel({
  market,
  mode,
  onTransactionLogsChange,
  onActed,
}: {
  market: MarketHealthEntry;
  mode: ActionMode;
  onTransactionLogsChange?: (logs: TransactionLog[]) => void;
  /** Fires after a confirmed tx — hosts with their own position reads (the
   *  portfolio) refresh them instead of waiting for their next tick. */
  onActed?: () => void;
}) {
  const chainId = chainOf(market);
  const { address: account, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId });
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { openConnectModal } = useConnectModal();
  const q = useBlueMarket(chainId, market.market_id, account);
  const borrowSide = isBorrowSide(mode);

  const [loanAmt, setLoanAmt] = useState("");
  const [collAmt, setCollAmt] = useState("");
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
    setLoanAmt("");
    setCollAmt("");
    setError(null);
  }, [mode]);

  const supported = blueActionsSupported(chainId);
  const isCorrectChain = isConnected && walletChainId === chainId;
  const lsym = q.data?.loanToken.symbol ?? market.loan_symbol ?? "?";
  const csym = q.data?.collateralToken.symbol ?? market.collateral_symbol ?? "?";
  const ld = q.data?.loanToken.decimals ?? null;
  const cd = q.data?.collateralToken.decimals ?? null;
  const md = q.data?.marketData;
  const pos = q.data?.positionData ?? null;
  const supplied = pos?.supplyAssets ?? null;
  const walletLoan = q.data?.walletBalance ?? null;
  const walletColl = q.data?.collateralBalance ?? null;

  const num = (v: bigint, d: number | null) => (d == null ? 0 : Number(formatAmount(v, d, d)));
  const exact = (v: bigint | null | undefined, d: number | null, sym: string) =>
    v != null && d != null ? `${formatNumberWithCommas(num(v, d), 2, true)} ${sym}` : "—";

  // ─── Drafts and the projected position ──────────────────────────────────
  const loanDraft = tryParse(loanAmt, ld);
  const collDraft = tryParse(collAmt, cd);
  const hasDraft = (loanDraft ?? 0n) > 0n || (collDraft ?? 0n) > 0n;
  const sign = mode === "borrow" || mode === "lend" ? 1n : -1n;
  // Debt owed NOW (accrued), not at fetch time — the difference is the dust
  // that makes a fetch-time "full" repay leave 51 units behind.
  const debtNow = pos && md ? accruedDebt(pos, md) : null;
  const closeAll = shouldCloseAll(mode, { loan: loanDraft, supplied, debtNow, wallet: walletLoan });
  const after: BluePositionData | null =
    pos && md && borrowSide
      ? projectPosition(pos, md, {
          collateralDelta: sign * (collDraft ?? 0n),
          debtDelta: sign * (loanDraft ?? 0n),
          closeDebt: mode === "repay" && closeAll,
        })
      : pos;
  // What HALF/MAX draw from, per box.
  const safeMax = pos && md ? safeMaxBorrow(pos, md, collDraft ?? 0n) : null;
  // MAX on repay: the whole (accrued) debt when the wallet covers it, else
  // everything the wallet has (assets mode, dust stays).
  const repayable =
    debtNow != null && walletLoan != null ? (canCloseDebt(debtNow, walletLoan) ? debtNow : walletLoan) : null;
  const withdrawableColl =
    pos && md
      ? safeWithdrawableCollateral(
          projectPosition(pos, md, { debtDelta: -(loanDraft ?? 0n), closeDebt: mode === "repay" && closeAll })
        )
      : null;
  const loanSource = mode === "lend" ? walletLoan : mode === "withdraw" ? supplied : mode === "borrow" ? safeMax : repayable;
  const collSource = mode === "borrow" ? walletColl : withdrawableColl;

  // Lend/withdraw book impact (a deposit lowers utilization and the rate).
  const bookDelta = borrowSide ? 0n : sign * (loanDraft ?? 0n);
  const supplyAfter = md ? md.totalSupplyAssets + bookDelta : null;
  const positionAfter = supplied != null ? supplied + bookDelta : null;
  const utilAfter =
    md && supplyAfter != null && supplyAfter > 0n && md.totalBorrowAssets <= supplyAfter
      ? Number(md.totalBorrowAssets) / Number(supplyAfter)
      : null;
  const bookShare =
    positionAfter != null && supplyAfter != null && supplyAfter > 0n && positionAfter >= 0n
      ? Number(positionAfter) / Number(supplyAfter)
      : null;
  const yieldPerYear = positionAfter != null && positionAfter >= 0n && md ? num(positionAfter, ld) * md.supplyApy : null;

  // Borrow-side risk readout (SDK math on the projected position).
  const lltv = md ? wadToNumber(md.params.lltv) : null;
  const ltvAfter = after && after.borrowAssets > 0n ? wadToNumber(after.ltv) : null;
  const healthAfter = after && after.borrowAssets > 0n ? wadToNumber(after.healthFactor) : null;
  const liqPriceAfter =
    after?.liquidationPrice != null && ld != null && cd != null
      ? Number(after.liquidationPrice) / 10 ** (36 + ld - cd)
      : null;
  const ltvTone =
    ltvAfter == null || lltv == null
      ? "text-text"
      : ltvAfter >= lltv * 0.95
        ? "text-danger"
        : ltvAfter >= lltv * 0.8
          ? "text-gold"
          : "text-success";
  const draftTone = hasDraft ? "text-gold" : "text-text";

  // ─── Writes ─────────────────────────────────────────────────────────────
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

  const setLoanFraction = (den: bigint) => {
    if (loanSource == null || ld == null) return;
    setLoanAmt(formatAmount(loanSource / den, ld, ld));
    setError(null);
  };
  const setCollFraction = (den: bigint) => {
    if (collSource == null || cd == null) return;
    setCollAmt(formatAmount(collSource / den, cd, cd));
    setError(null);
  };

  // The action for the current draft (shared with the terminal CLI).
  const buildAction = () =>
    account && q.data && pos && md
      ? buildBlueAction(q.data.market, {
          mode,
          user: account,
          pos,
          marketData: md,
          loan: loanDraft ?? 0n,
          coll: collDraft ?? 0n,
          closeAll,
          loanSymbol: lsym,
          collateralSymbol: csym,
        })
      : null;

  const submit = async () => {
    if (!isConnected) return openConnectModal?.();
    if (!isCorrectChain) {
      await switchChainAsync({ chainId }).catch((e) => setError(shortError(e)));
      return;
    }
    if (!account || !walletClient || !publicClient) return;
    setBusy(true);
    setError(null);
    try {
      const built = buildAction(); // may throw: SDK validates health / amounts here
      if (!built) return;
      addLog("INFO", `${built.label}: ${[loanAmt && `${loanAmt} ${lsym}`, collAmt && `${collAmt} ${csym}`].filter(Boolean).join(" · ")}…`);
      const hash = await runBlueAction(built.action, {
        account,
        walletClient,
        publicClient,
        log: (line) => addLog("INFO", line),
      });
      addLog("SUCCESS", `${built.label} confirmed`, hash);
      setLoanAmt("");
      setCollAmt("");
      void q.refetch();
      onActed?.();
    } catch (e) {
      const msg = shortError(e);
      setError(msg);
      addLog("ERROR", `${mode.toUpperCase()} failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  // ─── Button state machine (wallet state first, then the draft) ──────────
  const processing = busy || switching;
  const noPosition =
    (mode === "withdraw" && (supplied ?? 0n) === 0n) ||
    (mode === "repay" && pos != null && pos.borrowAssets === 0n && pos.collateral === 0n);
  const idleLabel = { lend: `LEND ${lsym}`, withdraw: `WITHDRAW ${lsym}`, borrow: `BORROW ${lsym}`, repay: `REPAY ${lsym}` }[mode];
  const draftLabel = (() => {
    try {
      return buildAction()?.label ?? idleLabel;
    } catch {
      return idleLabel;
    }
  })();
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
            : draftLabel;
  const disabled = !supported || processing || (isCorrectChain && (!ack || noPosition || !hasDraft || !q.data));
  const boxDisabled = !isCorrectChain || processing;
  const primary = isCorrectChain && (mode === "lend" || mode === "borrow");

  const loanBox = (
    <AmountBox
      key="loan"
      label={{ lend: "LEND_AMOUNT", withdraw: "WITHDRAW_AMOUNT", borrow: "BORROW_AMOUNT", repay: "REPAY_AMOUNT" }[mode]}
      sym={lsym}
      value={loanAmt}
      onChange={(v) => {
        setLoanAmt(v);
        setError(null);
      }}
      onFraction={setLoanFraction}
      disabled={boxDisabled}
      canFraction={!!loanSource}
      reference={isConnected ? exact(loanSource, ld, lsym) : "—"}
      referenceIcon={<span>{{ lend: "WALLET", withdraw: "SUPPLIED", borrow: "SAFE_MAX", repay: "DEBT" }[mode]}</span>}
      referenceTitle={
        {
          lend: "Wallet balance",
          withdraw: "Your supply in this market, interest accrued",
          borrow: `90% of what the SDK lets this collateral borrow. The SDK refuses within 0.5% of LLTV, and a product default should sit well below it`,
          repay: "Your debt (interest accrued to now), capped at the wallet balance. An amount covering the whole debt closes it by shares, dust-free. The wallet needs about 0.1% headroom for that",
        }[mode]
      }
    />
  );
  const collBox = borrowSide && (
    <AmountBox
      key="coll"
      label={mode === "borrow" ? "ADD_COLLATERAL" : "WITHDRAW_COLLATERAL"}
      sym={csym}
      value={collAmt}
      onChange={(v) => {
        setCollAmt(v);
        setError(null);
      }}
      onFraction={setCollFraction}
      disabled={boxDisabled}
      canFraction={!!collSource}
      reference={isConnected ? exact(collSource, cd, csym) : "—"}
      referenceIcon={<span>{mode === "borrow" ? "WALLET" : "WITHDRAWABLE"}</span>}
      referenceTitle={mode === "borrow" ? "Wallet balance" : "Collateral you can pull without breaching LLTV after this repayment"}
    />
  );

  return (
    <div className="h-full flex flex-col gap-2 p-3 bg-bg-base border border-border">
      {/* Amount box(es): the block that takes the column's spare height, so
          the metric rows keep the tiles' pitch and no band appears. */}
      <div className="flex-1 flex flex-col gap-2">
        {mode === "borrow" ? collBox : loanBox}
        {mode === "borrow" ? loanBox : collBox}
        {error && <p className="text-[10px] text-danger font-mono">{error}</p>}
      </div>

      {/* Metrics — same 2-col grid and gap-y-1.5 pitch as the tiles below */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {borrowSide ? (
          <>
            <Metric label="COLLATERAL" value={isConnected ? exact(after?.collateral, cd, csym) : "—"} loading={isConnected && !q.data} tone={draftTone} title="Collateral posted after this action" />
            <Metric label="DEBT" value={isConnected ? exact(after?.borrowAssets, ld, lsym) : "—"} loading={isConnected && !q.data} tone={draftTone} title={`Debt after this action, interest accrued to now${mode === "repay" && closeAll ? ". Closes by shares, dust-free" : ""}`} />
            <Metric label="LTV" value={ltvAfter != null ? fmtPct(ltvAfter, 1) : "—"} loading={isConnected && !q.data} tone={ltvTone} title="Loan-to-value after this action (debt ÷ collateral value at the oracle price). Liquidation at LLTV." />
            <Metric label="LLTV" value={lltv != null ? fmtLltv(lltv) : fmtLltv(market.lltv)} loading={!q.data} title="Liquidation loan-to-value. The market's hard ceiling." />
            <Metric label="LIQ_PRICE" value={liqPriceAfter != null ? `${fmtPrice(liqPriceAfter)} ${lsym}` : "—"} loading={isConnected && !q.data} tone={draftTone} title={`Collateral price (in ${lsym}) at which this position becomes liquidatable`} />
            <Metric label="HEALTH" value={healthAfter != null ? fmtRatio(healthAfter) : "—"} loading={isConnected && !q.data} tone={healthAfter == null ? "text-text" : healthAfter < 1.05 ? "text-danger" : healthAfter < 1.2 ? "text-gold" : "text-success"} title="Health factor after this action. Below 1.00 is liquidatable, and interest accrual alone erodes it." />
            <Metric label="BORROW_APY" value={md ? fmtPct(md.borrowApy) : fmtPct(market.borrow_apy)} loading={!q.data} title="Live on-chain borrow rate (variable, moves with utilization)" />
            {mode === "borrow" ? (
              <Metric label="SAFE_MAX" value={isConnected ? exact(safeMax, ld, lsym) : "—"} loading={isConnected && !q.data} title="90% of the SDK's max borrowable with the collateral drafted above" />
            ) : (
              <Metric label="WITHDRAWABLE" value={isConnected ? exact(withdrawableColl, cd, csym) : "—"} loading={isConnected && !q.data} title="Collateral you can pull without breaching LLTV after the drafted repayment" />
            )}
          </>
        ) : (
          <>
            <Metric label="SUPPLY_APY" value={md ? fmtPct(md.supplyApy) : fmtPct(market.supply_apy)} loading={!q.data} tone="text-gold" title="Live on-chain supply rate (variable, moves with utilization)" />
            <Metric label="LIQUIDITY" value={md ? fmtAmount(num(md.liquidity, ld), lsym) : "—"} loading={!q.data} title="Loan tokens withdrawable right now" />
            <Metric label="WALLET" value={isConnected ? exact(walletLoan, ld, lsym) : "—"} loading={isConnected && !q.data} title="Loan-token balance in the connected wallet" />
            <Metric label="SUPPLIED" value={isConnected ? exact(supplied, ld, lsym) : "—"} loading={isConnected && !q.data} title="Your supply in this market, interest accrued" />
            <Metric label="TOTAL_SUPPLY" value={md ? fmtAmount(num(md.totalSupplyAssets, ld), lsym) : "—"} loading={!q.data} title="Whole lender book of this market, on-chain" />
            <Metric label="UTIL_AFTER" value={fmtPct(utilAfter, 1)} loading={!q.data} tone={draftTone} title="Utilization once this action lands. A deposit dilutes borrower demand and pulls the rate down, a withdrawal does the reverse." />
            <Metric label="BOOK_SHARE" value={isConnected ? fmtPct(bookShare, 2) : "—"} loading={isConnected && !q.data} tone={draftTone} title="Your share of the lender book after this action" />
            <Metric label="YIELD_1Y" value={isConnected && yieldPerYear != null ? fmtAmount(yieldPerYear, lsym) : "—"} loading={isConnected && !q.data} tone={draftTone} title="What your position after this action earns per year at today's variable rate. Not a promise." />
          </>
        )}
      </div>

      {/* Terms — Morpho's integration guidance asks for one acknowledgment
          before the first tx; persisted, so the line disappears afterwards. */}
      {isCorrectChain && !ack && (
        <label className="flex items-start gap-2 text-[9px] font-mono text-text-dim leading-snug cursor-pointer">
          <input type="checkbox" checked={false} onChange={acceptTerms} className="mt-0.5 accent-[var(--gold)]" />
          <span>
            Variable-rate Morpho market: smart-contract, oracle, liquidity and, when borrowing, liquidation risk. I accept the{" "}
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
          primary && "border-gold bg-gold/80 hover:bg-gold text-text"
        )}
      >
        {label}
      </Button>
    </div>
  );
}
