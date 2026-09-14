import { useQuery } from "@tanstack/react-query";
import type { Address, Client, Hex, PublicClient, WalletClient } from "viem";
import { usePublicClient } from "wagmi";
import {
  isRequirementSignature,
  morphoViemExtension,
  type CallRequirement,
  type Requirement,
  type RequirementSignature,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { addressesRegistry } from "@morpho-org/morpho-sdk/blue/addresses";
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

/**
 * The position as it would stand after a draft action — same SDK entity, so
 * ltv / healthFactor / liquidationPrice / maxBorrowableAssets come from the
 * SDK's own math (oracle price included), not a re-implementation. Deltas
 * are in assets; the debt delta is converted to shares at current totals.
 */
export function projectPosition(
  pos: BluePositionData,
  market: BlueMarketData,
  { collateralDelta = 0n, debtDelta = 0n, closeDebt = false }: { collateralDelta?: bigint; debtDelta?: bigint; closeDebt?: boolean }
): BluePositionData {
  const collateral = pos.collateral + collateralDelta;
  const debt = closeDebt ? 0n : pos.borrowAssets + debtDelta;
  return new AccrualPosition(
    {
      user: pos.user,
      supplyShares: pos.supplyShares,
      borrowShares: debt <= 0n ? 0n : market.toBorrowShares(debt),
      collateral: collateral < 0n ? 0n : collateral,
    },
    market
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
