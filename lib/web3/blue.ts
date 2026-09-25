import { useQuery } from "@tanstack/react-query";
import type { Address, Client, Hex, PublicClient, WalletClient } from "viem";
import { usePublicClient } from "wagmi";
import {
  DEFAULT_LLTV_BUFFER,
  isRequirementSignature,
  morphoViemExtension,
  type ActionRequirement,
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
// @morpho-org/morpho-sdk v6: every write is ONE direct call to the chain's
// BlueBundlesV1 contract (Bundler3 + GeneralAdapter1 are deprecated since
// 2026-09), and the SDK owns the per-chain addresses, approvals, Morpho
// authorizations and share math. This file is the seam: resolve a market
// from its MNEMON id, run an action (requirements → tx) and one hook for
// fresh accrued market + position reads. Vault deposits keep using
// lib/web3/vault.ts (plain ERC-4626); markets are not ERC-4626.

const WAD = 10n ** 18n;

/** Every BlueBundlesV1 call carries an execution deadline; the SDK also
 *  accrues a shares-mode repay's funding cap to it and refuses one past its
 *  own +2h horizon (`getBlueBundlesV1QuoteTimestamp`). 20 min covers a
 *  wallet prompt without inflating the repay approval. */
export const BLUE_DEADLINE_S = 20n * 60n;
export const blueDeadline = () => BigInt(Math.floor(Date.now() / 1000)) + BLUE_DEADLINE_S;

/** BlueBundlesV1 deployed on the chain AND the wallet can switch to it. */
export function blueActionsSupported(chainId: number): boolean {
  const a = addressesRegistry[chainId as keyof typeof addressesRegistry];
  return isWalletChain(chainId) && Boolean(a?.bundles?.blueBundlesV1);
}

/** Off-chain prerequisites (Permit2 SignatureTransfer for the token, signed
 *  Morpho authorization) need canonical Permit2 on the chain: registered on
 *  Base / mainnet / Arbitrum / Monad / Robinhood, NOT on HyperEVM or Katana
 *  (SDK registry, 2026-09-25). With it, a lend is a one-time max approval
 *  to Permit2 then signature + one tx per action; without it, an exact
 *  approval tx to BlueBundlesV1 precedes every funded action. */
export function blueSignaturesSupported(chainId: number): boolean {
  return Boolean(addressesRegistry[chainId as keyof typeof addressesRegistry]?.permit2);
}

/** Bind a market entity to a client; `client.morpho.blue` needs the SDK extension. */
export function blueMarket(client: Client, params: MarketParams, chainId: number) {
  return client.extend(morphoViemExtension({ supportSignature: blueSignaturesSupported(chainId) })).morpho.blue(params, chainId);
}
export type BlueMarket = ReturnType<typeof blueMarket>;
export type BlueMarketData = Awaited<ReturnType<BlueMarket["getMarketData"]>>;
export type BluePositionData = Awaited<ReturnType<BlueMarket["getPositionData"]>>;

/** Anything the SDK returns from market.supply()/withdraw()/borrow()/... */
export interface BlueAction {
  getRequirements: () => Promise<readonly ActionRequirement[]>;
  buildTx: (signatures?: readonly RequirementSignature[]) => Readonly<Transaction>;
}

/** How long a draft may sit between preview and submit and still clear the
 *  SDK's guard. The SDK stamps "now" when the tx is BUILT, we stamp it when
 *  the draft is previewed; on a 2k USDC debt at 10% APY that is ~7 units of
 *  interest per second, and the fork refused a MAX collateral withdrawal by
 *  6 units over a one-second gap. Over-accruing by this margin leaves dust
 *  of collateral behind; sitting longer than it re-raises the SDK error
 *  (click MAX again). */
export const SUBMIT_MARGIN_S = 600n;

/** The SDK's own accrual horizon for repay / withdraw validation:
 *  max(now, market.lastUpdate) + 2h (`getBlueBundlesV1QuoteTimestamp`),
 *  plus SUBMIT_MARGIN_S. Projecting at least as far as the SDK makes our
 *  WITHDRAWABLE / DEBT preview agree with its guard — a shorter horizon
 *  under-counts the dust and the SDK then refuses a collateral withdrawal
 *  the panel said was fine. (A shares-mode repay accrues to the deadline
 *  instead, which is earlier — the preview stays conservative.) */
export function projectionTimestamp(market: BlueMarketData): bigint {
  const now = BigInt(Math.floor(Date.now() / 1000));
  return (now > market.lastUpdate ? now : market.lastUpdate) + 7_200n + SUBMIT_MARGIN_S;
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
 *
 * A repay leg runs the entity's OWN `repay()` simulation (assets → shares
 * rounded down, market totals reduced) because the SDK's withdraw guard
 * validates exactly that position — a hand-rolled conversion landed 5 units
 * of debt short on the fork and the guard refused the collateral. Borrow and
 * collateral legs stay manual: the entity's versions throw on an unhealthy
 * draft, and the panel previews those on purpose.
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
  let p = new AccrualPosition(pos, market.accrueInterest(at ?? projectionTimestamp(market)));
  if (p.borrowShares > 0n && (closeDebt || debtDelta < 0n)) {
    const wholeDebt = closeDebt || p.market.toBorrowShares(-debtDelta, "Down") >= p.borrowShares;
    p = wholeDebt ? p.repay(0n, p.borrowShares).position : p.repay(-debtDelta, 0n).position;
  }
  const borrowShares = debtDelta > 0n ? p.borrowShares + p.market.toBorrowShares(debtDelta, "Up") : p.borrowShares;
  const collateral = p.collateral + collateralDelta;
  return new AccrualPosition(
    { user: p.user, supplyShares: p.supplyShares, borrowShares, collateral: collateral < 0n ? 0n : collateral },
    p.market
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
  const requirements = await action.getRequirements();
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

/** A full-close repay (shares) pulls the debt accrued to the deadline and
 *  refunds the residual — the wallet needs a little headroom. */
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
    loan = 0n,
    coll = 0n,
    closeAll = false,
    loanSymbol,
    collateralSymbol,
  }: {
    mode: BlueMode;
    user: Address;
    pos: BluePositionData;
    /** Unused since SDK v6 (BlueBundlesV1 has no share-price bounds); callers still pass it. */
    marketData: BlueMarketData;
    loan?: bigint;
    coll?: bigint;
    closeAll?: boolean;
    loanSymbol: string;
    collateralSymbol: string;
  }
): { action: BlueAction; label: string } | null {
  const base = { userAddress: user, deadline: blueDeadline() };
  switch (mode) {
    case "lend":
      return loan > 0n ? { action: market.supply({ ...base, assets: loan }), label: `LEND ${loanSymbol}` } : null;
    case "withdraw":
      if (loan <= 0n) return null;
      return {
        action: closeAll
          ? market.withdraw({ ...base, shares: pos.supplyShares, positionData: pos })
          : market.withdraw({ ...base, assets: loan, positionData: pos }),
        label: `WITHDRAW ${loanSymbol}`,
      };
    case "borrow":
      if (coll > 0n && loan > 0n)
        return { action: market.supplyCollateralBorrow({ ...base, collateralAssets: coll, borrowAssets: loan, positionData: pos }), label: `BORROW ${loanSymbol}` };
      if (coll > 0n) return { action: market.supplyCollateral({ ...base, collateralAssets: coll }), label: `ADD ${collateralSymbol}` };
      if (loan > 0n) return { action: market.borrow({ ...base, borrowAssets: loan, positionData: pos }), label: `BORROW ${loanSymbol}` };
      return null;
    case "repay": {
      const repayArgs = closeAll ? { repayShares: pos.borrowShares } : { repayAssets: loan };
      if (loan > 0n && coll > 0n)
        return {
          action: market.repayWithdrawCollateral({ ...base, ...repayArgs, collateralAssets: coll, positionData: pos }),
          label: "REPAY & WITHDRAW",
        };
      if (loan > 0n) return { action: market.repay({ ...base, ...repayArgs, positionData: pos }), label: `REPAY ${loanSymbol}` };
      if (coll > 0n) return { action: market.withdrawCollateral({ ...base, collateralAssets: coll, positionData: pos }), label: `WITHDRAW ${collateralSymbol}` };
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
      const params = await fetchMarketParams(marketId as MarketId, client); // chain from the client
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
