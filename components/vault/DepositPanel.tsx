"use client";

import { useState, useEffect } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { type Address } from "viem";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { USDT0_VAULT_CHAIN_ID } from "@/lib/constants/vaults";
import { assertConnected, assertChain, Web3GuardError } from "@/lib/web3/guards";
import { parseAmount, formatAmount } from "@/lib/web3/format";
import {
  getVaultAssetAddress,
  readAssetMeta,
  readVaultDecimals,
  readBalances,
  readAllowance,
  approveExact,
  deposit,
  withdraw,
  previewDeposit,
} from "@/lib/web3/vault";
import { useWaitForTransactionReceipt } from "wagmi";

const EXPECTED_CHAIN_ID = USDT0_VAULT_CHAIN_ID; // 999

type TxState = "idle" | "signing" | "pending" | "confirmed" | "failed";

interface DepositPanelProps {
  vaultAddress: Address;
}

export function DepositPanel({ vaultAddress }: DepositPanelProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Hooks must be called unconditionally, but we'll guard their usage
  const { address: account } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [amount, setAmount] = useState("");
  const [assetAddress, setAssetAddress] = useState<Address | null>(null);
  const [assetMeta, setAssetMeta] = useState<{ decimals: number; symbol: string } | null>(null);
  const [vaultDecimals, setVaultDecimals] = useState<number | null>(null);
  const [assetBalance, setAssetBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [estimatedShares, setEstimatedShares] = useState<bigint | null>(null);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if connected and on correct chain
  const isConnected = !!account;
  const isWrongChain = isConnected && chainId !== EXPECTED_CHAIN_ID;
  const isCorrectChain = isConnected && chainId === EXPECTED_CHAIN_ID;

  // Load asset address and metadata, and vault decimals
  useEffect(() => {
    if (!publicClient || !isCorrectChain) return;

    let cancelled = false;

    async function loadAsset() {
      try {
        const [asset, vaultDec] = await Promise.all([
          getVaultAssetAddress(vaultAddress, publicClient),
          readVaultDecimals(vaultAddress, publicClient),
        ]);
        if (cancelled) return;
        setAssetAddress(asset);
        setVaultDecimals(vaultDec);

        const meta = await readAssetMeta(asset, publicClient);
        if (cancelled) return;
        setAssetMeta(meta);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load asset:", err);
        }
      }
    }

    loadAsset();

    return () => {
      cancelled = true;
    };
  }, [vaultAddress, publicClient, isCorrectChain]);

  // Load balances and allowance
  useEffect(() => {
    if (!publicClient || !account || !assetAddress || !isCorrectChain) {
      setAssetBalance(null);
      setAllowance(null);
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        const [balances, allow] = await Promise.all([
          readBalances({
            account,
            assetAddress,
            vaultAddress,
            publicClient,
          }),
          readAllowance({
            owner: account,
            assetAddress,
            spender: vaultAddress,
            publicClient,
          }),
        ]);

        if (cancelled) return;

        setAssetBalance(balances.assetBalance);
        setAllowance(allow);
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load balances:", err);
        }
      }
    }

    loadData();

    // Refresh on interval
    const interval = setInterval(loadData, 10000); // Every 10 seconds

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [account, assetAddress, vaultAddress, publicClient, isCorrectChain, txState]);

  // Preview deposit when amount changes
  useEffect(() => {
    if (!publicClient || !amount || !assetMeta || !isCorrectChain) {
      setEstimatedShares(null);
      return;
    }

    let cancelled = false;

    async function preview() {
      try {
        const parsed = parseAmount(amount, assetMeta.decimals);
        const shares = await previewDeposit({
          vaultAddress,
          assets: parsed,
          publicClient,
        });

        if (!cancelled) {
          setEstimatedShares(shares);
        }
      } catch (err) {
        if (!cancelled) {
          setEstimatedShares(null);
        }
      }
    }

    preview();

    return () => {
      cancelled = true;
    };
  }, [amount, assetMeta, vaultAddress, publicClient, isCorrectChain]);

  // Watch transaction receipt (only when mounted)
  const { isLoading: isTxPending } = useWaitForTransactionReceipt({
    hash: txHash || undefined,
    enabled: mounted && !!txHash && txState === "pending",
    onSuccess: () => {
      setTxState("confirmed");
      setAmount(""); // Clear input on success
      // Refresh balances
      if (publicClient && account && assetAddress) {
        readBalances({
          account,
          assetAddress,
          vaultAddress,
          publicClient,
        }).then((balances) => {
          setAssetBalance(balances.assetBalance);
        });
        readAllowance({
          owner: account,
          assetAddress,
          spender: vaultAddress,
          publicClient,
        }).then(setAllowance);
      }
      // Reset tx state after 5 seconds
      setTimeout(() => {
        setTxState("idle");
        setTxHash(null);
      }, 5000);
    },
    onError: () => {
      setTxState("failed");
      // Reset tx state after 10 seconds on error
      setTimeout(() => {
        setTxState("idle");
        setTxHash(null);
      }, 10000);
    },
  });

  // Parse and validate amount
  let parsedAmount: bigint | null = null;
  let amountError: string | null = null;

  if (amount && assetMeta) {
    try {
      parsedAmount = parseAmount(amount, assetMeta.decimals);
      if (assetBalance !== null && parsedAmount > assetBalance) {
        amountError = "Insufficient balance";
      }
    } catch (err) {
      amountError = err instanceof Error ? err.message : "Invalid amount";
    }
  }

  const needsApproval =
    parsedAmount !== null &&
    allowance !== null &&
    parsedAmount > allowance;

  const canApprove = isCorrectChain && parsedAmount !== null && !amountError && needsApproval;
  const canDeposit =
    isCorrectChain &&
    parsedAmount !== null &&
    !amountError &&
    !needsApproval &&
    txState === "idle";
  const canWithdraw =
    isCorrectChain &&
    parsedAmount !== null &&
    !amountError &&
    txState === "idle";

  const isProcessing = txState === "signing" || txState === "pending" || isTxPending;

  const handleApprove = async () => {
    if (!walletClient || !publicClient || !account || !assetAddress || !parsedAmount) return;

    setError(null);
    setTxState("signing");

    try {
      assertConnected(account);
      assertChain(chainId, EXPECTED_CHAIN_ID);

      const hash = await approveExact({
        assetAddress,
        spender: vaultAddress,
        amount: parsedAmount,
        walletClient,
        publicClient,
      });

      setTxHash(hash);
      setTxState("pending");
    } catch (err) {
      setTxState("failed");
      if (err instanceof Web3GuardError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Approval failed");
      }
    }
  };

  const handleDeposit = async () => {
    if (!walletClient || !account || !parsedAmount) return;

    setError(null);
    setTxState("signing");

    try {
      assertConnected(account);
      assertChain(chainId, EXPECTED_CHAIN_ID);

      const hash = await deposit({
        vaultAddress,
        assets: parsedAmount,
        receiver: account,
        walletClient,
      });

      setTxHash(hash);
      setTxState("pending");
    } catch (err) {
      setTxState("failed");
      if (err instanceof Web3GuardError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Deposit failed");
      }
    }
  };

  const handleWithdraw = async () => {
    if (!walletClient || !account || !parsedAmount) return;

    setError(null);
    setTxState("signing");

    try {
      assertConnected(account);
      assertChain(chainId, EXPECTED_CHAIN_ID);

      const hash = await withdraw({
        vaultAddress,
        assets: parsedAmount,
        receiver: account,
        owner: account,
        walletClient,
      });

      setTxHash(hash);
      setTxState("pending");
    } catch (err) {
      setTxState("failed");
      if (err instanceof Web3GuardError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Withdraw failed");
      }
    }
  };

  const handleMax = () => {
    if (assetBalance !== null && assetMeta) {
      setAmount(formatAmount(assetBalance, assetMeta.decimals));
    }
  };

  const showLargeAmountWarning = parsedAmount !== null && assetMeta && (() => {
    const amountNum = Number(formatAmount(parsedAmount, assetMeta.decimals));
    return amountNum > 10000;
  })();

  // Don't render until mounted (prevents SSR/hydration issues with wagmi)
  if (!mounted) {
    return (
      <div className="space-y-4">
        <div className="text-xs text-text/50 font-mono text-center py-4">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      {!isConnected && (
        <Badge variant="danger" className="text-xs w-full justify-center">
          CONNECT WALLET
        </Badge>
      )}
      {isWrongChain && (
        <Badge variant="danger" className="text-xs w-full justify-center">
          WRONG NETWORK
        </Badge>
      )}

      {/* Amount Input */}
      <div>
        <label className="text-xs uppercase tracking-wide text-text/70 mb-2 block">
          Amount
        </label>
        <div className="relative">
          <Input
            type="text"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            disabled={!isCorrectChain || isProcessing}
            className="pr-20"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            {assetMeta && (
              <>
                <span className="text-xs text-text/70 font-mono">
                  {assetMeta.symbol}
                </span>
                {isCorrectChain && assetBalance !== null && (
                  <button
                    type="button"
                    onClick={handleMax}
                    className="text-xs text-border hover:text-text transition-colors font-mono"
                    disabled={isProcessing}
                  >
                    MAX
                  </button>
                )}
              </>
            )}
          </div>
        </div>
        {amountError && (
          <p className="text-xs text-danger mt-1 font-mono">{amountError}</p>
        )}
        {showLargeAmountWarning && (
          <p className="text-xs text-gold mt-1 font-mono">
            Warning: Large amount detected
          </p>
        )}
      </div>

      {/* Balance & Allowance Info */}
      {isCorrectChain && assetMeta && (
        <div className="space-y-1 text-xs font-mono text-text/70">
          {assetBalance !== null && (
            <div className="flex justify-between">
              <span>Balance:</span>
              <span>{formatAmount(assetBalance, assetMeta.decimals)} {assetMeta.symbol}</span>
            </div>
          )}
          {allowance !== null && parsedAmount !== null && (
            <div className="flex justify-between">
              <span>Allowance:</span>
              <span>
                {formatAmount(allowance, assetMeta.decimals)} {assetMeta.symbol}
                {needsApproval && (
                  <span className="text-gold ml-1">(insufficient)</span>
                )}
              </span>
            </div>
          )}
          {estimatedShares !== null && vaultDecimals !== null && (
            <div className="flex justify-between text-text/50">
              <span>Est. shares:</span>
              <span>{formatAmount(estimatedShares, vaultDecimals)}</span>
            </div>
          )}
        </div>
      )}

      {/* Transaction Status */}
      {txState === "pending" && txHash && (
        <div className="text-xs font-mono text-text/70 space-y-1">
          <div>Transaction pending...</div>
          <a
            href={`https://hyperevmscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-border hover:text-text transition-colors underline"
          >
            View on explorer
          </a>
        </div>
      )}
      {txState === "confirmed" && txHash && (
        <div className="text-xs font-mono text-success space-y-1">
          <div>Transaction confirmed!</div>
          <a
            href={`https://hyperevmscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-success/80 hover:text-success transition-colors underline"
          >
            View on explorer
          </a>
        </div>
      )}
      {txState === "failed" && error && (
        <div className="text-xs font-mono text-danger">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {needsApproval && (
          <Button
            variant="outline"
            className="w-full"
            onClick={handleApprove}
            disabled={!canApprove || isProcessing}
          >
            {txState === "signing" ? "Signing..." : "Approve"}
          </Button>
        )}
        <Button
          variant="gold"
          className="w-full"
          onClick={handleDeposit}
          disabled={!canDeposit || isProcessing}
        >
          {isProcessing && txState !== "idle" ? "Processing..." : "Deposit"}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={handleWithdraw}
          disabled={!canWithdraw || isProcessing}
        >
          {isProcessing && txState !== "idle" ? "Processing..." : "Withdraw"}
        </Button>
      </div>

      <p className="text-xs text-text/60 font-mono text-center">
        Transactions executed on-chain
      </p>
    </div>
  );
}

