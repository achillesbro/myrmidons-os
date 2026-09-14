import { useQuery } from "@tanstack/react-query";
import type { Address, Client, Hex, PublicClient, WalletClient } from "viem";
import { usePublicClient } from "wagmi";
import {
  DEFAULT_LLTV_BUFFER,
  isRequirementSignature,
  morphoViemExtension,
  type CallRequirement,
  type Requirement,
  type RequirementSignature,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { addressesRegistry } from "@morpho-org/morpho-sdk/blue/addresses";
import { ORACLE_PRICE_SCALE } from "@morpho-org/morpho-sdk/blue/constants";
import { fetchMarketParams } from "@morpho-org/morpho-sdk/blue/fetch";
import { AccrualPosition, type MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
import { isWalletChain } from "./chains";
import { ERC20_ABI } from "./abis/erc20";
import { readAssetMeta } from "./vault";

// Morpho Blue market actions (MNEMON drill-down lend/borrow) run through
// @morpho-org/morpho-sdk: it owns the per-chain Bundler3/GeneralAdapter1
// addresses, approvals, Morpho authorizations and share math — Morpho's
// guidance is to never hand-build bundler calldata. This file is the seam:
// resolve a market from its MNEMON id, run an action (requirements → tx) and
// one hook for fresh accrued market + position reads. Vault deposits keep
// using lib/web3/vault.ts (plain ERC-4626); markets are not ERC-4626.

const WAD = 10n ** 18n;

/** Bundler3 deployed on the chain AND the wallet can switch to it. */
export function blueActionsSupported(chainId: number): boolean {
  const a = addressesRegistry[chainId as keyof typeof addressesRegistry];
  return isWalletChain(chainId) && Boolean(a?.bundler3?.bundler3 && a?.bundler3?.generalAdapter1);
}

/** Bind a market entity to a client; `client.morpho.blue` needs the SDK extension. */
export function blueMarket(client: Client, params: MarketParams, chainId: number) {
  return client.extend(morphoViemExtension()).morpho.blue(params, chainId);
}
export type BlueMarket = ReturnType<typeof blueMarket>;
export type BlueMarketData = Awaited<ReturnType<BlueMarket["getMarketData"]>>;
export type BluePositionData = Awaited<ReturnType<BlueMarket["getPositionData"]>>;

/** Anything the SDK returns from market.supply()/withdraw()/borrow()/...
 *  (withdrawCollateral is a direct Morpho call with no requirements). */
export interface BlueAction {
  getRequirements?: () => Promise<readonly (CallRequirement | Requirement)[]>;
  buildTx: (signatures?: readonly RequirementSignature[]) => Readonly<Transaction>;
}

/** The SDK's own accrual horizon for repay / withdraw validation:
 *  max(now, market.lastUpdate) + 2h (entities/blue). Projecting to the same
 *  point makes our WITHDRAWABLE / DEBT preview agree with the SDK's guard
 *  to the unit — a shorter horizon under-counts the dust and the SDK then
 *  refuses a collateral withdrawal the panel said was fine. */
export function projectionTimestamp(market: BlueMarketData): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return (now > market.lastUpdate ? now : market.lastUpdate) + 7_200n;
}

/**
 * Collateral that can leave WITHOUT tripping the SDK's withdraw guard
 * (helpers/validate.js validatePositionHealthAfterWithdraw):
 *   value  = floor(collateralAfter × price / ORACLE_PRICE_SCALE)
 *   maxDebt = floor(value × (LLTV − 0.5% buffer) / WAD)   must be ≥ debt
 * Solved exactly with ceilings, so it matches the guard to the unit even on
 * dust positions (3 units of debt against 1.7e12 wei of collateral, where a
 * relative shave rounds the wrong way). null price → nothing is safe.
 */
export function safeWithdrawableCollateral(pos: BluePositionData): bigint {
  const debt = pos.borrowAssets;
  if (debt === 0n) return pos.collateral;
  const price = pos.market.price;
  const lltv = pos.market.params.lltv;
  const effLltv = lltv > DEFAULT_LLTV_BUFFER ? lltv - DEFAULT_LLTV_BUFFER : 0n;
  if (!price || effLltv === 0n) return 0n;
  const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
  const valueNeeded = ceilDiv(debt * WAD, effLltv);
  const collateralNeeded = ceilDiv(valueNeeded * ORACLE_PRICE_SCALE, price);
  return pos.collateral > collateralNeeded ? pos.collateral - collateralNeeded : 0n;
}

/** Debt owed at the projection horizon (interest accrued), not at fetch time. */
export function accruedDebt(pos: BluePositionData, market: BlueMarketData, at = projectionTimestamp(market)): bigint {
  return market.accrueInterest(at).toBorrowAssets(pos.borrowShares);
}

/**
 * The position as it would stand after a draft action — same SDK entity, so
 * ltv / healthFactor / liquidationPrice / maxBorrowableAssets come from the
 * SDK's own math (oracle price included), not a re-implementation. Interest
 * is accrued to `at` first: a projection off fetch-time debt says "0 left"
 * after a full-amount repay when the chain says "51 units left", and the
 * SDK then rightly refuses the collateral withdrawal. Deltas are in assets.
 */
export function projectPosition(
  pos: BluePositionData,
  market: BlueMarketData,
  {
    collateralDelta = 0n,
    debtDelta = 0n,
    closeDebt = false,
    at,
  }: { collateralDelta?: bigint; debtDelta?: bigint; closeDebt?: boolean; at?: bigint }
): BluePositionData {
  const accrued = market.accrueInterest(at ?? projectionTimestamp(market));
  const collateral = pos.collateral + collateralDelta;
  const debt = closeDebt ? 0n : accrued.toBorrowAssets(pos.borrowShares) + debtDelta;
  return new AccrualPosition(
    {
      user: pos.user,
      supplyShares: pos.supplyShares,
      borrowShares: debt <= 0n ? 0n : accrued.toBorrowShares(debt),
      collateral: collateral < 0n ? 0n : collateral,
    },
    accrued
  );
}

/**
 * Resolve an action's prerequisites (approvals / authorizations as txs,
 * permits as signatures), then send the built transaction. Mirrors the SDK
 * README flow; `account` must be the connected signer. `log` gets one line per
 * step for the transaction terminal.
 */
export async function runBlueAction(
  action: BlueAction,
  {
    account,
    walletClient,
    publicClient,
    log,
  }: { account: Address; walletClient: WalletClient; publicClient: PublicClient; log?: (line: string) => void }
): Promise<Hex> {
  // Send and wait; a mined-but-reverted tx must surface as a failure, not a
  // green line in the terminal. Gas: estimate +50%. Morpho accrues interest
  // on the first touch of a block (several SSTOREs) — an estimate taken
  // against the block where the market was just touched omits them, and the
  // repay bundle then dies with ~1k gas short (seen on the anvil fork).
  // Unused gas is refunded.
  const send = async (tx: Readonly<Transaction>) => {
    const request = { account, to: tx.to, data: tx.data, value: tx.value };
    const estimate = await publicClient.estimateGas(request);
    const hash = await walletClient.sendTransaction({ ...request, gas: (estimate * 3n) / 2n, chain: walletClient.chain ?? null });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${tx.action.type} reverted (${hash})`);
    return hash;
  };
  const requirements = action.getRequirements ? await action.getRequirements() : [];
  const signatures: RequirementSignature[] = [];
  for (const req of requirements) {
    if (isRequirementSignature(req)) {
      log?.(`Signing ${req.action.type}…`);
      signatures.push(await req.sign(walletClient, account));
    } else {
      log?.(`Sending ${req.action.type}…`);
      await send(req);
      log?.(`${req.action.type} confirmed`);
    }
  }
  const tx = action.buildTx(signatures);
  log?.(`Sending ${tx.action.type}…`);
  return send(tx);
}

// ─── Action rules shared by the drill-down panel and the terminal CLI ──────

export type BlueMode = "lend" | "withdraw" | "borrow" | "repay";

/** MAX on a borrow = this share of the SDK's max borrowable. The SDK refuses
 *  within 0.5% of LLTV; Morpho's guidance is a product default "materially
 *  below LLTV". */
export const SAFE_BORROW_BPS = 9000n;

/** 90% of what the position could borrow once `collateralDelta` is posted. */
export function safeMaxBorrow(pos: BluePositionData, market: BlueMarketData, collateralDelta = 0n): bigint {
  return ((projectPosition(pos, market, { collateralDelta }).maxBorrowableAssets ?? 0n) * SAFE_BORROW_BPS) / 10_000n;
}

/** A full-close repay pulls accrued debt + slippage (0.03%) and sweeps the
 *  residual back — the wallet needs a little headroom. */
export function canCloseDebt(debtNow: bigint, wallet: bigint): boolean {
  return debtNow > 0n && wallet >= debtNow + debtNow / 1000n;
}

/**
 * Close by SHARES (immune to interest accrual) whenever the drafted loan
 * amount covers the whole position; anything less is assets mode and leaves
 * dust. Same rule for MAX and for a typed amount — nothing to get out of sync.
 */
export function shouldCloseAll(
  mode: BlueMode,
  { loan, supplied, debtNow, wallet }: { loan: bigint | null; supplied: bigint | null; debtNow: bigint | null; wallet: bigint | null }
): boolean {
  if (loan == null) return false;
  if (mode === "withdraw") return supplied != null && supplied > 0n && loan >= supplied;
  if (mode === "repay") return debtNow != null && wallet != null && loan >= debtNow && canCloseDebt(debtNow, wallet);
  return false;
}

/**
 * The SDK action for a draft, or null when nothing valid is drafted. Atomic
 * pairs when both amounts are present (supplyCollateralBorrow /
 * repayWithdrawCollateral), single legs otherwise. May THROW: the SDK
 * validates health and amounts here.
 */
export function buildBlueAction(
  market: BlueMarket,
  {
    mode,
    user,
    pos,
    marketData,
    loan = 0n,
    coll = 0n,
    closeAll = false,
    loanSymbol,
    collateralSymbol,
  }: {
    mode: BlueMode;
    user: Address;
    pos: BluePositionData;
    marketData: BlueMarketData;
    loan?: bigint;
    coll?: bigint;
    closeAll?: boolean;
    loanSymbol: string;
    collateralSymbol: string;
  }
): { action: BlueAction; label: string } | null {
  switch (mode) {
    case "lend":
      return loan > 0n ? { action: market.supply({ amount: loan, userAddress: user, marketData }), label: `LEND ${loanSymbol}` } : null;
    case "withdraw":
      if (loan <= 0n) return null;
      return {
        action: closeAll
          ? market.withdraw({ shares: pos.supplyShares, userAddress: user, positionData: pos })
          : market.withdraw({ assets: loan, userAddress: user, positionData: pos }),
        label: `WITHDRAW ${loanSymbol}`,
      };
    case "borrow":
      if (coll > 0n && loan > 0n)
        return { action: market.supplyCollateralBorrow({ amount: coll, borrowAmount: loan, userAddress: user, positionData: pos }), label: `BORROW ${loanSymbol}` };
      if (coll > 0n) return { action: market.supplyCollateral({ amount: coll, userAddress: user }), label: `ADD ${collateralSymbol}` };
      if (loan > 0n) return { action: market.borrow({ amount: loan, userAddress: user, positionData: pos }), label: `BORROW ${loanSymbol}` };
      return null;
    case "repay": {
      const repayArgs = closeAll ? { shares: pos.borrowShares } : { amount: loan };
      if (loan > 0n && coll > 0n)
        return {
          action: market.repayWithdrawCollateral({ ...repayArgs, withdrawAmount: coll, userAddress: user, positionData: pos }),
          label: "REPAY & WITHDRAW",
        };
      if (loan > 0n) return { action: market.repay({ ...repayArgs, userAddress: user, positionData: pos }), label: `REPAY ${loanSymbol}` };
      if (coll > 0n) return { action: market.withdrawCollateral({ amount: coll, userAddress: user, positionData: pos }), label: `WITHDRAW ${collateralSymbol}` };
      return null;
    }
  }
}

/**
 * Fresh accrued market state, loan-token meta and (when connected) the
 * account's position + wallet balance for a MNEMON market. Reads go through
 * wagmi's client for `chainId`, so they work without switching the wallet.
 * Keyed by account: reconnecting refetches.
 */
export function useBlueMarket(chainId: number, marketId: string | undefined, account?: Address) {
  const publicClient = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["blue", chainId, marketId, account ?? null],
    enabled: Boolean(publicClient && marketId),
    queryFn: async () => {
      const client = publicClient as PublicClient;
      const params = await fetchMarketParams(marketId as MarketId, client, { chainId });
      const market = blueMarket(client, params, chainId);
      const balanceOf = (token: Address) =>
        account
          ? (client.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [account] }) as Promise<bigint>)
          : Promise.resolve(null);
      const [marketData, positionData, loanToken, collateralToken, walletBalance, collateralBalance] = await Promise.all([
        market.getMarketData(),
        account ? market.getPositionData(account) : Promise.resolve(null),
        readAssetMeta(params.loanToken, client),
        readAssetMeta(params.collateralToken, client),
        balanceOf(params.loanToken),
        balanceOf(params.collateralToken),
      ]);
      return { params, market, marketData, positionData, loanToken, collateralToken, walletBalance, collateralBalance };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
