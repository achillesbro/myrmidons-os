/**
 * WHYPE contract: wrap (deposit) and unwrap (withdraw) native HYPE.
 * No approval needed for wrap/unwrap.
 */

import { type Abi, type Address, type WalletClient, type PublicClient } from "viem";
import { WHYPE_ADDRESS } from "./tokens";

export const WHYPE_ABI = [
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "wad", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const satisfies Abi;

export async function wrapHype({
  walletClient,
  publicClient,
  account,
  amountRaw,
  onLog,
}: {
  walletClient: NonNullable<WalletClient>;
  publicClient: PublicClient;
  account: Address;
  amountRaw: bigint;
  onLog?: (line: string) => void;
}): Promise<{ hash: `0x${string}`; success: boolean }> {
  onLog?.("SWAP // WRAPPING_HYPE...");
  const hash = await walletClient.writeContract({
    account,
    address: WHYPE_ADDRESS as Address,
    abi: WHYPE_ABI,
    functionName: "deposit",
    args: [],
    value: amountRaw,
    chain: walletClient.chain ?? undefined,
  });
  onLog?.(`SWAP // TX_SUBMITTED  ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "success") {
    onLog?.(`SWAP // TX_CONFIRMED  ${hash}`);
  }
  return { hash, success: receipt.status === "success" };
}

export async function unwrapHype({
  walletClient,
  publicClient,
  account,
  amountRaw,
  onLog,
}: {
  walletClient: NonNullable<WalletClient>;
  publicClient: PublicClient;
  account: Address;
  amountRaw: bigint;
  onLog?: (line: string) => void;
}): Promise<{ hash: `0x${string}`; success: boolean }> {
  onLog?.("SWAP // UNWRAPPING_HYPE...");
  const hash = await walletClient.writeContract({
    account,
    address: WHYPE_ADDRESS as Address,
    abi: WHYPE_ABI,
    functionName: "withdraw",
    args: [amountRaw],
    chain: walletClient.chain ?? undefined,
  });
  onLog?.(`SWAP // TX_SUBMITTED  ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === "success") {
    onLog?.(`SWAP // TX_CONFIRMED  ${hash}`);
  }
  return { hash, success: receipt.status === "success" };
}
