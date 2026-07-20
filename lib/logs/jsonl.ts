// JSONL event parsing and formatting utilities

export interface JsonlEvent {
  ts: string;
  bot?: "HEGEMON_KEEPER" | "EREBUS";
  chainId?: number;
  type: "tick_start" | "tick_end" | "tick_skip" | "scores" | "tx_sent" | "tx_confirmed" | "tx_reverted" | "plan_built" | "plan_simulated" | "error";
  tickId?: string;
  mode?: string;
  durationMs?: number;
  summary?: Record<string, any>;
  reason?: string;
  reasonCode?: string;
  counts?: {
    candidates?: number;
    confirmedLiquidatable?: number;
    passed?: number;
  };
  txHash?: string;
  message?: string;
  pair?: string;
  repay?: {
    assets?: string;
    symbol?: string;
    decimals?: number;
  };
  profit?: {
    hype?: string;
    minHype?: string;
    assets?: string;
    symbol?: string;
  };
  status?: string;
  // HEGEMON-specific fields
  plan?: {
    actionsCount?: number;
    withdrawCount?: number;
    depositCount?: number;
    marketsTouched?: number;
    movedAssets?: string;
    movedUsd?: string | number;
    expectedApyBefore?: number;
    expectedApyAfter?: number;
    expectedImprovementBps?: number;
    /** Only on tx_confirmed: amount withdrawn from markets in the reallocation (e.g. "1339.956882") */
    totalWithdrawn?: string | number;
    /** Only on tx_confirmed: amount supplied to markets in the reallocation */
    totalSupplied?: string | number;
    /** HEGEMON_V2: per-market deltas, e.g. {market:"kHYPE", delta:"-2.10", weightBefore:41.1, weightAfter:3.1} */
    moves?: Array<{
      market: string;
      delta: string;
      weightBefore?: number;
      weightAfter?: number;
    }>;
    /** HEGEMON_V2: vault asset symbol for the move amounts (e.g. "USD₮0") */
    asset?: string;
    /** HEGEMON_V2: market the liquidity adapter rotated to, when it did */
    liquidityTo?: string;
  };
  decision?: {
    reallocationLane?: string;
    yieldLane?: {
      improvementBps?: number;
      triggered?: boolean;
    };
    riskLane?: {
      triggered?: boolean;
      currentUtil?: number;
      targetUtil?: number;
    };
  };
  simulation?: {
    ok?: boolean;
    gasUsed?: string;
    revertReason?: string;
    balanceDeltas?: {
      idleDelta?: string;
      assetDelta?: string;
    };
    constraints?: {
      passed?: Record<string, boolean>;
      failedReasons?: string[];
    };
  };
  gas?: {
    gasUsed?: string;
    effectiveGasPrice?: string;
    gasUsd?: string | number;
  };
  tx?: {
    hash?: string;
    explorerUrl?: string;
    status?: string;
    blockNumber?: string;
    revertReason?: string;
  };
  stage?: string;
  /** tx_sent: reallocation tx → "realloc update" (no queueUpdate). */
  realloc?: boolean;
  /** tx_sent: supply/withdraw queue update → "queue update" (no realloc). */
  queueUpdate?: boolean;
}

/**
 * HEGEMON_V2 per-market flow rendering:
 *   flow    "out: kHYPE -2.10 · UBTC -0.48 → in: WHYPE +2.58 USD₮0"
 *   weights "wts: kHYPE 41.1→3.1% · WHYPE 25.6→94.2%"
 */
function formatMoves(plan: NonNullable<JsonlEvent["plan"]>): { flow?: string; weights?: string } {
  const moves = plan.moves;
  if (!moves || moves.length === 0) return {};
  const outs = moves.filter((m) => m.delta.startsWith("-"));
  const ins = moves.filter((m) => !m.delta.startsWith("-"));
  const fmtSide = (side: typeof moves) =>
    side.map((m) => `${m.market} ${m.delta.replace("-", "\u2212")}`).join(" \u00b7 ");
  const segments: string[] = [];
  if (outs.length > 0) segments.push(`out: ${fmtSide(outs)}`);
  if (ins.length > 0) segments.push(`in: ${fmtSide(ins)}`);
  const flow = `${segments.join(" \u2192 ")}${plan.asset ? ` ${plan.asset}` : ""}`;
  const withWeights = moves.filter((m) => m.weightBefore !== undefined && m.weightAfter !== undefined);
  const weights =
    withWeights.length > 0
      ? `wts: ${withWeights.map((m) => `${m.market} ${m.weightBefore}\u2192${m.weightAfter}%`).join(" \u00b7 ")}`
      : undefined;
  return { flow, weights };
}

export interface FormattedEvent {
  level: "TICK" | "PHASE" | "INFO" | "SUCCESS" | "WARN" | "ERROR" | "DEBUG" | "BATCH" | "SUMMARY";
  title: string;
  subtitle?: string;
  txHash?: string;
  tickId?: string;
}

// Try to parse a line as JSONL event
export function tryParseJsonEvent(line: string): { ok: boolean; evt?: JsonlEvent } {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return { ok: false };
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && parsed.type && parsed.ts) {
      // Extract txHash from nested tx object if present (HEGEMON)
      if (!parsed.txHash && parsed.tx?.hash) {
        parsed.txHash = parsed.tx.hash;
      }
      return { ok: true, evt: parsed as JsonlEvent };
    }
  } catch {
    // Not valid JSON
  }

  return { ok: false };
}

// Format a JSONL event for display
// Rules:
//   - title: max ~80 chars (hard truncate with ellipsis)
//   - subtitle: 2-4 key metrics max (compact, space-separated)
//   - always use shortHash() for tx hashes (never full hash in default view)
//   - always include compact tick identifier when available
//   - progressive disclosure: txHash kept in FormattedEvent for UI expansion
export function formatEvent(evt: JsonlEvent): FormattedEvent {
  const mode = evt.mode || "";
  const chainId = evt.chainId || "";
  const tickShort = formatTickId(evt.tickId);

  switch (evt.type) {
    case "tick_start": {
      // EREBUS: "FLASHLOAN start · T42 · chain:999"
      // HEGEMON: "APPLY start · abc123 · chain:999"
      const modeLabel = mode ? `${mode} ` : "";
      const title = truncate(`${modeLabel}start · ${tickShort}${chainId ? ` · chain:${chainId}` : ""}`, 80);
      return {
        level: "TICK",
        title,
        tickId: evt.tickId,
      };
    }

    case "tick_end": {
      // EREBUS: "done 5.1s" with subtitle: "liq:12 pass:8 tx:3 ok:2 pnl:$1.5k"
      const duration = formatDuration(evt.durationMs);
      const title = truncate(`done ${duration}`, 80);

      // Build subtitle: max 4 metrics (priority: liq, pass, tx, ok, pnl)
      const parts: string[] = [];
      if (evt.summary) {
        const s = evt.summary;

        // Priority 1: liquidatable
        const liquidatable = s.confirmation?.liquidatable ?? s.confirmedLiquidatable;
        if (liquidatable !== undefined) parts.push(`liq:${liquidatable}`);

        // Priority 2: passed filters
        const passed = s.filtering?.passed ?? s.filteredPassed;
        if (passed !== undefined) parts.push(`pass:${passed}`);

        // Priority 3: tx sent
        const sent = s.execution?.sent ?? s.executedSent;
        if (sent !== undefined) parts.push(`tx:${sent}`);

        // Priority 4: tx success
        const success = s.execution?.success ?? s.executedSuccess;
        if (success !== undefined) parts.push(`ok:${success}`);

        // Priority 5: profit (only if available and > 0)
        if (s.economics?.totalProfitAsset) {
          const profit = formatMoney(s.economics.totalProfitAsset);
          if (profit) parts.push(`pnl:${profit}`);
        }
      }

      // Keep to max 4 metrics
      const subtitle = parts.slice(0, 4).join(" ");

      return {
        level: "SUMMARY",
        title,
        subtitle: subtitle || undefined,
        tickId: evt.tickId,
      };
    }

    case "tick_skip": {
      // EREBUS: "skip" with subtitle: "all filtered · 2.0s · cand:150"
      const title = "skip";
      const parts: string[] = [];
      
      // Reason (priority 1)
      if (evt.reason) {
        parts.push(evt.reason);
      } else if (evt.reasonCode) {
        const reasonMap: Record<string, string> = {
          "NO_VAULTS": "no vaults",
          "NO_MARKETS": "no markets",
          "NO_CANDIDATES": "no candidates",
          "ALL_FILTERED": "all filtered",
          "NO_LIQUIDATABLE": "no liquidatable",
        };
        parts.push(reasonMap[evt.reasonCode] || evt.reasonCode.toLowerCase());
      }
      
      // Duration (priority 2)
      const duration = formatDuration(evt.durationMs);
      if (duration) parts.push(duration);
      
      // Candidates count (priority 3, optional)
      if (evt.counts?.candidates !== undefined) {
        parts.push(`cand:${evt.counts.candidates}`);
      }
      
      const subtitle = parts.slice(0, 3).join(" ");
      
      return {
        level: "INFO",
        title,
        subtitle: subtitle || undefined,
        tickId: evt.tickId,
      };
    }

    case "tx_sent": {
      // EREBUS: "tx sent" with subtitle: "0x1234…abcd WHYPE→USDC +$0.5k"
      // HEGEMON: realloc: true → "realloc update", queueUpdate: true → "queue update"
      const title = "tx sent";
      const txHash = evt.txHash || evt.tx?.hash || "";
      let subtitle: string | undefined;

      if (evt.pair || evt.profit) {
        // EREBUS: short hash + pair + profit
        const parts: string[] = [];
        if (txHash) parts.push(shortHash(txHash));
        if (evt.pair) parts.push(evt.pair);
        if (evt.profit) {
          let profitStr = "";
          if (evt.profit.hype) {
            const hypeFormatted = formatBigIntString(evt.profit.hype, 18);
            const hypeNum = parseFloat(hypeFormatted);
            if (hypeNum > 0) profitStr = formatMoney(hypeNum.toString());
          } else if (evt.profit.assets && evt.profit.symbol) {
            const formatted = formatBigIntString(evt.profit.assets, 18);
            const profitNum = parseFloat(formatted);
            if (profitNum > 0) profitStr = formatMoney(profitNum.toString());
          }
          if (profitStr) parts.push(`+${profitStr}`);
        }
        subtitle = parts.join(" ");
      } else if (evt.realloc === true) {
        subtitle = "realloc update";
      } else if (evt.queueUpdate === true) {
        subtitle = "queue update";
      } else {
        // Fallback when keeper omits flags (e.g. legacy)
        const isReallocFromPlan =
          evt.plan != null &&
          (evt.plan.actionsCount != null ||
            evt.plan.movedUsd != null ||
            evt.plan.marketsTouched != null ||
            evt.plan.withdrawCount != null ||
            evt.plan.depositCount != null ||
            evt.plan.expectedApyBefore != null ||
            evt.plan.expectedApyAfter != null);
        subtitle = isReallocFromPlan ? "realloc update" : "queue update";
      }

      return {
        level: "INFO",
        title,
        subtitle: subtitle || undefined,
        txHash,
      };
    }

    case "tx_confirmed": {
      // EREBUS: "confirmed" with subtitle: "0x1234…abcd +$0.5k gas:245k"
      // HEGEMON: "confirmed" with subtitle: "moved:$1.3k apy 13.1→14.6 (+1.5%) gas:2.5M #12345679"
      const status = evt.status || evt.tx?.status;
      const title = status === "reverted" ? "reverted" : "confirmed";
      const parts: string[] = [];
      const txHash = evt.txHash || evt.tx?.hash || "";
      
      if (evt.bot === "EREBUS") {
        // EREBUS: shortHash + profit + gas
        if (txHash) parts.push(shortHash(txHash));
        
        // Profit (only if > 0)
        if (evt.profit) {
          let profitStr = "";
          if (evt.profit.hype) {
            const hypeFormatted = formatBigIntString(evt.profit.hype, 18);
            const hypeNum = parseFloat(hypeFormatted);
            if (hypeNum > 0) profitStr = formatMoney(hypeNum.toString());
          } else if (evt.profit.assets && evt.profit.symbol) {
            const formatted = formatBigIntString(evt.profit.assets, 18);
            const profitNum = parseFloat(formatted);
            if (profitNum > 0) profitStr = formatMoney(profitNum.toString());
          }
          if (profitStr) parts.push(`+${profitStr}`);
        }
        
        // Gas
        if (evt.gas?.gasUsed) {
          parts.push(`gas:${formatGas(evt.gas.gasUsed)}`);
        }
      } else {
        // HEGEMON tx_confirmed (always realloc): totalWithdrawn/totalSupplied only here; then apy delta + gas + block
        // HEGEMON_V2: per-market flow replaces the aggregate when present
        if (evt.plan?.moves?.length) {
          const { flow } = formatMoves(evt.plan);
          if (flow) parts.push(flow);
          if (evt.plan.liquidityTo) parts.push(`liq\u2192${evt.plan.liquidityTo}`);
          if (evt.plan.expectedApyBefore !== undefined && evt.plan.expectedApyAfter !== undefined) {
            const before = evt.plan.expectedApyBefore;
            const after = evt.plan.expectedApyAfter;
            parts.push(`apy ${before.toFixed(1)}\u2192${after.toFixed(1)} ${formatDelta(before, after)}`);
          }
        } else if (evt.plan) {
          // moved: totalWithdrawn/totalSupplied are only emitted on tx_confirmed
          const withdrawn = evt.plan.totalWithdrawn != null ? formatMoney(evt.plan.totalWithdrawn) : null;
          const supplied = evt.plan.totalSupplied != null ? formatMoney(evt.plan.totalSupplied) : null;
          if (withdrawn || supplied) {
            const movedParts: string[] = [];
            if (withdrawn) movedParts.push(`withdrawn:${withdrawn}`);
            if (supplied) movedParts.push(`supplied:${supplied}`);
            parts.push(movedParts.join(" "));
          } else if (evt.plan.movedUsd) {
            const moved = formatMoney(evt.plan.movedUsd);
            if (moved) parts.push(`moved:${moved}`);
          } else if (evt.plan.movedAssets) {
            const moved = formatMoney(evt.plan.movedAssets);
            if (moved) parts.push(`moved:${moved}`);
          }

          // apy delta
          if (evt.plan.expectedApyBefore !== undefined && evt.plan.expectedApyAfter !== undefined) {
            const before = evt.plan.expectedApyBefore;
            const after = evt.plan.expectedApyAfter;
            const delta = formatDelta(before, after);
            parts.push(`apy ${before.toFixed(1)}→${after.toFixed(1)} ${delta}`);
          }
        }
        
        // gas
        if (evt.gas?.gasUsed) {
          parts.push(`gas:${formatGas(evt.gas.gasUsed)}`);
        }
        
        // block number
        if (evt.tx?.blockNumber) {
          parts.push(`#${evt.tx.blockNumber}`);
        }
      }
      
      const subtitle = parts.slice(0, 5).join(" ");
      
      return {
        level: status === "reverted" ? "ERROR" : "SUCCESS",
        title,
        subtitle: subtitle || undefined,
        txHash,
      };
    }

    case "tx_reverted": {
      // HEGEMON: "reverted" with subtitle: "0x1234…abcd revert:reason gas:2.5M"
      const title = "reverted";
      const parts: string[] = [];
      const txHash = evt.txHash || evt.tx?.hash || "";
      
      // shortHash
      if (txHash) parts.push(shortHash(txHash));
      
      // revert reason (truncated)
      if (evt.tx?.revertReason) {
        const reason = truncate(evt.tx.revertReason, 40);
        parts.push(`revert:${reason}`);
      } else {
        parts.push("revert:unknown");
      }
      
      // gas
      if (evt.gas?.gasUsed) {
        parts.push(`gas:${formatGas(evt.gas.gasUsed)}`);
      }
      
      const subtitle = parts.slice(0, 3).join(" ");
      
      return {
        level: "ERROR",
        title,
        subtitle: subtitle || undefined,
        txHash,
      };
    }

    case "plan_built": {
      // HEGEMON: "plan built" with subtitle: "lane:risk_override util 89.3→87.6 (-1.7%) moved:$1.3k apy 13.1→7.4 (-5.7%)"
      // HEGEMON_V2: "plan built" with subtitle: "out: kHYPE −2.10 → in: WHYPE +2.58 USD₮0 wts: kHYPE 41.1→3.1% · WHYPE 25.6→94.2%"
      const title = "plan built";
      const parts: string[] = [];

      // HEGEMON_V2 per-market flow detail (takes precedence when present)
      if (evt.plan?.moves?.length) {
        const { flow, weights } = formatMoves(evt.plan);
        if (flow) parts.push(flow);
        if (weights) parts.push(weights);
        if (evt.plan.liquidityTo) parts.push(`liq\u2192${evt.plan.liquidityTo}`);
      }

      // lane (priority 1)
      if (evt.decision?.reallocationLane) {
        parts.push(`lane:${evt.decision.reallocationLane}`);
      }
      
      // util delta (priority 2) - from riskLane
      if (evt.decision?.riskLane?.currentUtil !== undefined && evt.decision.riskLane.targetUtil !== undefined) {
        const current = evt.decision.riskLane.currentUtil;
        const target = evt.decision.riskLane.targetUtil;
        const delta = formatDelta(current, target);
        parts.push(`util ${formatUtil(current)}→${formatUtil(target)} ${delta}`);
      }
      
      // moved (priority 3): plan_built has movedUsd/movedAssets only; totalWithdrawn/totalSupplied are on tx_confirmed
      if (evt.plan?.movedUsd) {
        const moved = formatMoney(evt.plan.movedUsd);
        if (moved) parts.push(`moved:${moved}`);
      } else if (evt.plan?.movedAssets) {
        const moved = formatMoney(evt.plan.movedAssets);
        if (moved) parts.push(`moved:${moved}`);
      }

      // apy delta (priority 4)
      if (evt.plan?.expectedApyBefore !== undefined && evt.plan.expectedApyAfter !== undefined) {
        const before = evt.plan.expectedApyBefore;
        const after = evt.plan.expectedApyAfter;
        const delta = formatDelta(before, after);
        parts.push(`apy ${before.toFixed(1)}→${after.toFixed(1)} ${delta}`);
      }

      const subtitle = parts.slice(0, 5).join(" ");

      return {
        level: "PHASE",
        title,
        subtitle: subtitle || undefined,
        tickId: evt.tickId,
      };
    }

    case "plan_simulated": {
      // HEGEMON: "simulated ✓" or "simulated FAIL" with subtitle: "gas:2.5M" or "revert:reason"
      const sim = evt.simulation;
      const ok = sim?.ok ?? false;
      const title = ok ? "simulated ✓" : "simulated FAIL";
      const parts: string[] = [];
      
      if (sim) {
        if (ok) {
          // Success: gas only
          if (sim.gasUsed) {
            parts.push(`gas:${formatGas(sim.gasUsed)}`);
          }
        } else {
          // Failure: revert reason (truncated)
          if (sim.revertReason) {
            const reason = truncate(sim.revertReason, 40);
            parts.push(`revert:${reason}`);
          } else {
            parts.push("reason:unknown");
          }
        }
      }
      
      const subtitle = parts.join(" ");
      
      return {
        level: ok ? "SUCCESS" : "ERROR",
        title,
        subtitle: subtitle || undefined,
        tickId: evt.tickId,
      };
    }

    case "error": {
      // EREBUS/HEGEMON: "error" with subtitle: "simulate:message" (truncated hard)
      const title = "error";
      const parts: string[] = [];
      
      // Stage (if available)
      const stage = evt.stage || "";
      const message = evt.message || "";
      const messageShort = truncate(message, 50);
      
      if (stage && messageShort) {
        parts.push(`${stage}:${messageShort}`);
      } else if (messageShort) {
        parts.push(messageShort);
      } else if (stage) {
        parts.push(stage);
      }
      
      const subtitle = parts.join(" ");
      
      return {
        level: "ERROR",
        title,
        subtitle: subtitle || undefined,
      };
    }

    default:
      return {
        level: "INFO",
        title: truncate(`Event: ${evt.type}`, 80),
        subtitle: tickShort || undefined,
        tickId: evt.tickId,
      };
  }
}

// Get explorer URL for a transaction hash
export function getTxExplorerUrl(txHash: string, chainId?: number): string {
  if (chainId === 999) {
    return `https://hyperevmscan.io/tx/${txHash}`;
  }
  // Default to HyperEVM for now
  return `https://hyperevmscan.io/tx/${txHash}`;
}

// Format BigInt string with decimals
function formatBigIntString(value: string, decimals: number): string {
  try {
    // For small values, use Number
    if (value.length <= 15) {
      const num = Number(value);
      if (!isNaN(num) && isFinite(num)) {
        return (num / 10 ** decimals).toFixed(Math.min(decimals, 6));
      }
    }
    
    // For large values, do string manipulation
    const padded = value.padStart(decimals + 1, "0");
    const wholePart = padded.slice(0, -decimals) || "0";
    const fracPart = padded.slice(-decimals).replace(/0+$/, "");
    
    if (fracPart) {
      return `${wholePart}.${fracPart.slice(0, 6)}`;
    }
    return wholePart;
  } catch {
    return value;
  }
}

// Format duration: ms → "26.9s"
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return "";
  const sec = ms / 1000;
  return `${sec.toFixed(1)}s`;
}

// Format gas: integer → "1.06M" / "245k"
function formatGas(gas: string | number | undefined): string {
  if (gas === undefined || gas === null) return "";
  const num = typeof gas === "string" ? parseInt(gas, 10) : gas;
  if (isNaN(num)) return "";
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}k`;
  }
  return num.toString();
}

// Format money: numeric → "$11.45k" (assume USD). Strips commas from strings (e.g. "4,837.208964").
function formatMoney(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const num =
    typeof value === "string"
      ? parseFloat(value.replace(/,/g, ""))
      : value;
  if (isNaN(num) || num === 0) return "";
  const abs = Math.abs(num);
  if (abs >= 1_000_000) {
    return `$${(abs / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `$${(abs / 1_000).toFixed(2)}k`;
  }
  return `$${abs.toFixed(2)}`;
}

// Format percentage: handle both 0.1456 and 14.56 safely
function formatPct(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) return "";
  let pct: number;
  if (value > 1 && value <= 100) {
    pct = value; // Already percent
  } else if (value > 0 && value <= 1) {
    pct = value * 100; // Fraction → percent
  } else {
    pct = value; // Assume already percent if > 100
  }
  return `${pct.toFixed(1)}%`;
}

// Format utilization: always show as percent with 1 decimal
function formatUtil(value: number | undefined): string {
  if (value === undefined || value === null || isNaN(value)) return "";
  return `${(value * 100).toFixed(1)}%`;
}

// Format delta: show sign and 1-2 decimals: "(-2.3%)"
function formatDelta(before: number | undefined, after: number | undefined): string {
  if (before === undefined || after === undefined || isNaN(before) || isNaN(after)) return "";
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `(${sign}${delta.toFixed(1)}%)`;
}

// Format short hash: "0x1234…abcd"
function shortHash(hash: string | undefined | null): string {
  if (!hash || hash.length < 10) return hash || "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

// Format tick ID: extract short form (T### for EREBUS, or first 8 chars for UUID)
function formatTickId(tickId: string | undefined): string {
  if (!tickId) return "";
  // EREBUS format: T42 → T42
  if (/^T\d+$/.test(tickId)) return tickId;
  // UUID format: abc123-def456-... → abc123
  const match = tickId.match(/^([a-f0-9-]{8})/i);
  return match ? match[1] : tickId.slice(0, 8);
}

// Truncate string with ellipsis (max length)
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

// Check if a legacy text line should be suppressed when structured events are present
export function isLegacyNoiseLine(line: string): boolean {
  // Box drawing tick banners
  if (line.includes("║ TICK") || /^[╔╗╚╝║═─]{10,}/.test(line.trim())) {
    return true;
  }
  // "Waiting for next tick" messages
  if (/waiting\s+for\s+next\s+tick/i.test(line)) {
    return true;
  }
  return false;
}
