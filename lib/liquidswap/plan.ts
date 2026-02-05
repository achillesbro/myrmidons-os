/**
 * Execution plan for swap flows: WRAP / UNWRAP / SWAP.
 * LiquidSwap is never used for HYPE↔WHYPE or HYPE as tokenIn.
 */

import { type Address } from "viem";
import { NATIVE_HYPE_OUT_ADDRESS, WHYPE_ADDRESS } from "./tokens";
import { type RouteQuote } from "./route";
import { wrapHype, unwrapHype } from "./whype";

export type SwapIntent =
  | "WRAP_ONLY"
  | "UNWRAP_ONLY"
  | "WRAP_THEN_SWAP"
  | "SWAP_THEN_UNWRAP"
  | "SWAP_ONLY"
  | "NO_OP";

export type ExecutionStep =
  | { type: "WRAP"; amountRaw: bigint }
  | { type: "UNWRAP"; amountRaw: bigint }
  | { type: "SWAP"; route: RouteQuote };

export type ExecutionPlan = ExecutionStep[];

function isNativeHype(addr: string): boolean {
  if (addr === "NATIVE_HYPE") return true;
  return addr.toLowerCase() === NATIVE_HYPE_OUT_ADDRESS.toLowerCase();
}

function isWhype(addr: string): boolean {
  return addr.toLowerCase() === WHYPE_ADDRESS.toLowerCase();
}

export function areSameToken(inAddr: string, outAddr: string): boolean {
  if (inAddr === outAddr) return true;
  if (isNativeHype(inAddr) && isNativeHype(outAddr)) return true;
  if (isWhype(inAddr) && isWhype(outAddr)) return true;
  return false;
}

/**
 * Detect user intent before any route fetching.
 * Use token addresses: "NATIVE_HYPE" or NATIVE_HYPE_OUT_ADDRESS for native HYPE.
 */
export function getSwapIntent(tokenInAddress: string, tokenOutAddress: string): SwapIntent {
  const inAddr = tokenInAddress.trim();
  const outAddr = tokenOutAddress.trim();
  if (areSameToken(inAddr, outAddr)) return "NO_OP";
  if (isNativeHype(inAddr) && isWhype(outAddr)) return "WRAP_ONLY";
  if (isWhype(inAddr) && isNativeHype(outAddr)) return "UNWRAP_ONLY";
  if (isNativeHype(inAddr)) return "WRAP_THEN_SWAP";
  if (isNativeHype(outAddr)) return "SWAP_THEN_UNWRAP";
  return "SWAP_ONLY";
}

/**
 * Build execution plan. For WRAP_THEN_SWAP and SWAP_ONLY/SWAP_THEN_UNWRAP, route must be provided.
 */
export function buildExecutionPlan(
  intent: SwapIntent,
  amountRaw: bigint,
  route?: RouteQuote
): ExecutionPlan {
  switch (intent) {
    case "NO_OP":
      return [];
    case "WRAP_ONLY":
      return [{ type: "WRAP", amountRaw }];
    case "UNWRAP_ONLY":
      return [{ type: "UNWRAP", amountRaw }];
    case "WRAP_THEN_SWAP":
    case "SWAP_THEN_UNWRAP":
    case "SWAP_ONLY":
      if (!route?.execution?.details) return [];
      return intent === "WRAP_THEN_SWAP"
        ? [{ type: "WRAP", amountRaw }, { type: "SWAP", route }]
        : [{ type: "SWAP", route }];
    default:
      return [];
  }
}

export interface ExecutePlanParams {
  walletClient: NonNullable<import("viem").WalletClient>;
  publicClient: import("viem").PublicClient;
  account: Address;
  onLog?: (line: string) => void;
  /** Call before a SWAP step if allowance is insufficient. Must resolve after approval tx confirms. */
  approveIfNeeded?: (params: {
    tokenAddress: Address;
    spender: Address;
    amountRaw: bigint;
  }) => Promise<void>;
}

/**
 * Execute plan steps sequentially. Throws on revert or invalid plan.
 */
export async function executePlan(
  plan: ExecutionPlan,
  params: ExecutePlanParams
): Promise<{ success: boolean; lastHash?: `0x${string}` }> {
  const { walletClient, publicClient, account, onLog, approveIfNeeded } = params;
  if (plan.length === 0) {
    throw new Error("SWAP // ERROR  INVALID_EXECUTION_PLAN");
  }
  let lastHash: `0x${string}` | undefined;
  for (const step of plan) {
    if (step.type === "WRAP") {
      const result = await wrapHype({
        walletClient,
        publicClient,
        account,
        amountRaw: step.amountRaw,
        onLog,
      });
      if (!result.success) {
        onLog?.("TX_REVERTED");
        return { success: false, lastHash: result.hash };
      }
      lastHash = result.hash;
    } else if (step.type === "UNWRAP") {
      const result = await unwrapHype({
        walletClient,
        publicClient,
        account,
        amountRaw: step.amountRaw,
        onLog,
      });
      if (!result.success) {
        onLog?.("TX_REVERTED");
        return { success: false, lastHash: result.hash };
      }
      lastHash = result.hash;
    } else if (step.type === "SWAP") {
      const route = step.route;
      const to = route.execution!.to as Address;
      const calldata = route.execution!.calldata as `0x${string}`;
      const path = route.execution!.details!.path ?? [];
      const amountInRaw = BigInt(route.execution!.details!.amountIn ?? "0");
      const tokenInAddress = path[0] as Address;
      if (approveIfNeeded) {
        await approveIfNeeded({
          tokenAddress: tokenInAddress,
          spender: to,
          amountRaw: amountInRaw,
        });
      }
      onLog?.(`SWAP // SUBMITTING...`);
      const hash = await walletClient.sendTransaction({
        account,
        to,
        data: calldata,
        value: 0n,
      });
      onLog?.(`TX_SUBMITTED  ${hash}`);
      lastHash = hash;
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        onLog?.("TX_REVERTED");
        return { success: false, lastHash: hash };
      }
      onLog?.("TX_CONFIRMED");
    }
  }
  return { success: true, lastHash };
}
