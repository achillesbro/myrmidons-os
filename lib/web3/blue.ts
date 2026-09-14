import { useQuery } from "@tanstack/react-query";
import type { Address, Client, Hex, PublicClient, WalletClient } from "viem";
import { usePublicClient } from "wagmi";
import {
  isRequirementSignature,
  morphoViemExtension,
  type ActionRequirement,
  type RequirementSignature,
  type Transaction,
} from "@morpho-org/morpho-sdk";
import { addressesRegistry } from "@morpho-org/morpho-sdk/blue/addresses";
import { fetchMarketParams } from "@morpho-org/morpho-sdk/blue/fetch";
import type { MarketParams } from "@morpho-org/morpho-sdk/blue/entities";
import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
import { isWalletChain } from "./chains";

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

/** Anything the SDK returns from market.supply()/withdraw()/borrow()/... */
export interface BlueAction {
  getRequirements: () => Promise<readonly ActionRequirement[]>;
  buildTx: (signatures?: RequirementSignature[]) => Readonly<Transaction>;
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
  const send = (tx: Readonly<Transaction>) =>
    walletClient.sendTransaction({ account, to: tx.to, data: tx.data, value: tx.value, chain: walletClient.chain ?? null });
  const requirements = await action.getRequirements();
  const signatures: RequirementSignature[] = [];
  for (const req of requirements) {
    if (isRequirementSignature(req)) {
      log?.(`Signing ${req.action.type}…`);
      signatures.push(await req.sign(walletClient, account));
    } else {
      log?.(`Sending ${req.action.type}…`);
      const hash = await send(req);
      await publicClient.waitForTransactionReceipt({ hash });
      log?.(`${req.action.type} confirmed`);
    }
  }
  const tx = action.buildTx(signatures);
  log?.(`Sending ${tx.action.type}…`);
  const hash = await send(tx);
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/**
 * Fresh accrued market state (+ the account's position when connected) for a
 * MNEMON market. Reads go through wagmi's client for `chainId`, so they work
 * without switching the wallet. Keyed by account: reconnecting refetches.
 */
export function useBlueMarket(chainId: number, marketId: string | undefined, account?: Address) {
  const publicClient = usePublicClient({ chainId });
  return useQuery({
    queryKey: ["blue", chainId, marketId, account ?? null],
    enabled: Boolean(publicClient && marketId),
    queryFn: async () => {
      const client = publicClient as Client;
      const params = await fetchMarketParams(marketId as MarketId, client, { chainId });
      const market = blueMarket(client, params, chainId);
      const [marketData, positionData] = await Promise.all([
        market.getMarketData(),
        account ? market.getPositionData(account) : Promise.resolve(null),
      ]);
      return { params, market, marketData, positionData };
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
