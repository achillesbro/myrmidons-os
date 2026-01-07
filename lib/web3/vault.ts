import { type Address, type PublicClient, type WalletClient } from "viem";
import { ERC20_ABI } from "./abis/erc20";
import { ERC4626_ABI } from "./abis/erc4626";
import { formatAmount } from "./format";

export interface AssetMeta {
  decimals: number;
  symbol: string;
  name?: string;
}

export interface Balances {
  assetBalance: bigint;
  vaultShareBalance: bigint;
}

/**
 * Get the asset address for a vault
 */
export async function getVaultAssetAddress(
  vaultAddress: Address,
  publicClient: PublicClient
): Promise<Address> {
  const asset = await publicClient.readContract({
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: "asset",
  });
  return asset as Address;
}

/**
 * Read asset metadata (decimals and symbol)
 */
export async function readAssetMeta(
  assetAddress: Address,
  publicClient: PublicClient
): Promise<AssetMeta> {
  const [decimals, symbol, name] = await Promise.all([
    publicClient.readContract({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
    publicClient.readContract({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: "symbol",
    }),
    publicClient
      .readContract({
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "name",
      })
      .catch(() => undefined), // name is optional
  ]);

  return {
    decimals: Number(decimals),
    symbol: symbol as string,
    name: name as string | undefined,
  };
}

/**
 * Read vault share decimals (vault is ERC-20, so it has decimals)
 */
export async function readVaultDecimals(
  vaultAddress: Address,
  publicClient: PublicClient
): Promise<number> {
  const decimals = await publicClient.readContract({
    address: vaultAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
  });

  return Number(decimals);
}

/**
 * Read balances for an account (asset balance and vault share balance)
 */
export async function readBalances({
  account,
  assetAddress,
  vaultAddress,
  publicClient,
}: {
  account: Address;
  assetAddress: Address;
  vaultAddress: Address;
  publicClient: PublicClient;
}): Promise<Balances> {
  const [assetBalance, vaultShareBalance] = await Promise.all([
    publicClient.readContract({
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    }),
    publicClient.readContract({
      address: vaultAddress,
      abi: ERC20_ABI, // Vault shares are ERC-20
      functionName: "balanceOf",
      args: [account],
    }),
  ]);

  return {
    assetBalance: assetBalance as bigint,
    vaultShareBalance: vaultShareBalance as bigint,
  };
}

/**
 * Read allowance for an asset
 */
export async function readAllowance({
  owner,
  assetAddress,
  spender,
  publicClient,
}: {
  owner: Address;
  assetAddress: Address;
  spender: Address;
  publicClient: PublicClient;
}): Promise<bigint> {
  const allowance = await publicClient.readContract({
    address: assetAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: [owner, spender],
  });

  return allowance as bigint;
}

/**
 * Approve exact amount
 * Handles USDT-style approve quirks: if approve fails due to non-zero allowance,
 * reset to 0 first, then approve the new amount
 */
export async function approveExact({
  assetAddress,
  spender,
  amount,
  walletClient,
  publicClient,
}: {
  assetAddress: Address;
  spender: Address;
  amount: bigint;
  walletClient: WalletClient;
  publicClient: PublicClient;
}): Promise<`0x${string}`> {
  const account = walletClient.account?.address;
  if (!account) {
    throw new Error("Wallet not connected");
  }

  // Check current allowance
  const currentAllowance = await readAllowance({
    owner: account,
    assetAddress,
    spender,
    publicClient,
  });

  // If current allowance is non-zero and different from amount, reset first
  if (currentAllowance > 0n && currentAllowance !== amount) {
    try {
      // Try to reset to 0 first (for USDT-style tokens that require zero before new approval)
      const resetHash = await walletClient.writeContract({
        account,
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, 0n],
      });

      // Wait for confirmation
      await publicClient.waitForTransactionReceipt({ hash: resetHash });
    } catch (error) {
      // If reset fails, continue to direct approve (some tokens allow direct approval)
      // This will fail if the token requires reset, and the error will be surfaced
    }
  }

  // Approve the exact amount
  try {
    const hash = await walletClient.writeContract({
      account,
      address: assetAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });

    return hash;
  } catch (error) {
    // If direct approve fails and we haven't reset, try reset then approve
    if (currentAllowance > 0n && currentAllowance !== amount) {
      // Reset to 0
      const resetHash = await walletClient.writeContract({
        account,
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, 0n],
      });

      await publicClient.waitForTransactionReceipt({ hash: resetHash });

      // Now approve the amount
      const hash = await walletClient.writeContract({
        account,
        address: assetAddress,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [spender, amount],
      });

      return hash;
    }

    throw error;
  }
}

/**
 * Deposit assets into vault
 */
export async function deposit({
  vaultAddress,
  assets,
  receiver,
  walletClient,
}: {
  vaultAddress: Address;
  assets: bigint;
  receiver: Address;
  walletClient: WalletClient;
}): Promise<`0x${string}`> {
  const account = walletClient.account?.address;
  if (!account) {
    throw new Error("Wallet not connected");
  }

  const hash = await walletClient.writeContract({
    account,
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: "deposit",
    args: [assets, receiver],
  });

  return hash;
}

/**
 * Withdraw assets from vault
 */
export async function withdraw({
  vaultAddress,
  assets,
  receiver,
  owner,
  walletClient,
}: {
  vaultAddress: Address;
  assets: bigint;
  receiver: Address;
  owner: Address;
  walletClient: WalletClient;
}): Promise<`0x${string}`> {
  const account = walletClient.account?.address;
  if (!account) {
    throw new Error("Wallet not connected");
  }

  const hash = await walletClient.writeContract({
    account,
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: "withdraw",
    args: [assets, receiver, owner],
  });

  return hash;
}

/**
 * Preview deposit (estimate shares for given assets)
 */
export async function previewDeposit({
  vaultAddress,
  assets,
  publicClient,
}: {
  vaultAddress: Address;
  assets: bigint;
  publicClient: PublicClient;
}): Promise<bigint> {
  const shares = await publicClient.readContract({
    address: vaultAddress,
    abi: ERC4626_ABI,
    functionName: "previewDeposit",
    args: [assets],
  });

  return shares as bigint;
}

