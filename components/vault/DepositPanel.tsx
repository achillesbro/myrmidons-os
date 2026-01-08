"use client";

import { useState, useEffect, useCallback } from "react";
import { useAccount, useChainId, usePublicClient, useWalletClient } from "wagmi";
import { type Address } from "viem";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Landmark } from "lucide-react";
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
  convertSharesToAssets,
} from "@/lib/web3/vault";
import { useWaitForTransactionReceipt } from "wagmi";
import { TransactionTerminal, type TransactionLog } from "./TransactionTerminal";
import { useVaultMetadata } from "@/lib/morpho/queries";

const EXPECTED_CHAIN_ID = USDT0_VAULT_CHAIN_ID; // 999
const EXPLORER_BASE_URL = "https://hyperevmscan.io/tx";

type TxState = "idle" | "signing" | "pending" | "confirmed" | "failed";

interface DepositPanelProps {
  vaultAddress: Address;
  onTransactionLogsChange?: (logs: TransactionLog[]) => void;
}

export function DepositPanel({ vaultAddress, onTransactionLogsChange }: DepositPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [isDepositMode, setIsDepositMode] = useState(true);

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
  const [vaultShareBalance, setVaultShareBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);
  const [estimatedShares, setEstimatedShares] = useState<bigint | null>(null);
  const [txState, setTxState] = useState<TxState>("idle");
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transactionLogs, setTransactionLogs] = useState<TransactionLog[]>([]);

  // Helper to format current time as HH:MM:SS
  const getCurrentTimestamp = () => {
    const now = new Date();
    return now.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Helper to format error messages for human readability
  const formatErrorMessage = (error: unknown): string => {
    if (error instanceof Web3GuardError) {
      return error.message;
    }

    if (!(error instanceof Error)) {
      return "An unknown error occurred";
    }

    const message = error.message;

    // Handle user rejection - check for this pattern first before any technical details
    if (message.includes("User rejected") || message.includes("user rejected")) {
      return "Transaction cancelled";
    }

    // Extract the meaningful part before technical details
    // Viem errors often have structure like: "Error message. Request Arguments: ..." or "... Details: ..."
    // Look for common technical detail markers
    const technicalMarkers = [
      "Request Arguments:",
      "Contract Call:",
      "Details:",
      "Docs:",
      "Version:",
    ];

    let cleanMessage = message;
    for (const marker of technicalMarkers) {
      const index = cleanMessage.indexOf(marker);
      if (index !== -1) {
        cleanMessage = cleanMessage.substring(0, index).trim();
        break;
      }
    }

    // Clean up trailing punctuation
    cleanMessage = cleanMessage.replace(/[.,;]\s*$/, "").trim();

    // If we extracted something meaningful, use it
    if (cleanMessage.length > 0 && cleanMessage.length < 200) {
      return cleanMessage;
    }

    // If message is too long, truncate it intelligently
    if (message.length > 150) {
      // Try to find a sentence boundary
      const firstSentence = message.match(/^[^.!?]+[.!?]/);
      if (firstSentence && firstSentence[0].length < 150) {
        return firstSentence[0].trim();
      }
      // Otherwise just truncate
      return message.substring(0, 147).trim() + "...";
    }

    return message;
  };

  // Helper to add a transaction log
  const addTransactionLog = useCallback((log: Omit<TransactionLog, "timestamp">) => {
    setTransactionLogs((prev) => {
      const newLogs = [
        ...prev,
        {
          ...log,
          timestamp: getCurrentTimestamp(),
          explorerUrl: log.txHash ? `${EXPLORER_BASE_URL}/${log.txHash}` : undefined,
        },
      ];
      onTransactionLogsChange?.(newLogs);
      return newLogs;
    });
  }, [onTransactionLogsChange]);

  // Fetch vault metadata for asset logo
  const vaultMetadataQuery = useVaultMetadata(vaultAddress, EXPECTED_CHAIN_ID);
  const assetAddressFromMetadata = vaultMetadataQuery.data?.vaultByAddress?.asset?.address;

  // Construct logo URL from asset address (using a token logo service)
  // Using a generic token logo service that supports contract addresses
  const assetLogoUrl = assetAddressFromMetadata
    ? `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${assetAddressFromMetadata.toLowerCase()}/logo.png`
    : null;

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
        // TypeScript type narrowing: publicClient is checked above
        const client = publicClient!;
        const [asset, vaultDec] = await Promise.all([
          getVaultAssetAddress(vaultAddress, client),
          readVaultDecimals(vaultAddress, client),
        ]);
        if (cancelled) return;
        setAssetAddress(asset);
        setVaultDecimals(vaultDec);

        const meta = await readAssetMeta(asset, client);
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
      setVaultShareBalance(null);
      setAllowance(null);
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        // Check if we're on the correct chain
        if (publicClient) {
          const currentChainId = await publicClient.getChainId();
          if (currentChainId !== EXPECTED_CHAIN_ID) {
            console.warn(`Chain mismatch: expected ${EXPECTED_CHAIN_ID}, got ${currentChainId}`);
            return;
          }
        }

        // TypeScript type narrowing: publicClient, account, and assetAddress are checked above
        const client = publicClient!;
        const userAccount = account!;
        const assetAddr = assetAddress!;
        const [balances, allow] = await Promise.all([
          readBalances({
            account: userAccount,
            assetAddress: assetAddr,
            vaultAddress,
            publicClient: client,
          }),
          readAllowance({
            owner: userAccount,
            assetAddress: assetAddr,
            spender: vaultAddress,
            publicClient: client,
          }),
        ]);

        if (cancelled) return;

        setAssetBalance(balances.assetBalance);
        setVaultShareBalance(balances.vaultShareBalance);
        setAllowance(allow);
        
        // Debug: Log vault share balance
        if (process.env.NODE_ENV === "development") {
          console.log("Vault share balance:", balances.vaultShareBalance?.toString(), "for account:", account);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to load balances:", err);
          // Try to get vault share balance directly as fallback
          if (publicClient && account) {
            try {
              const vaultBalance = await publicClient.readContract({
                address: vaultAddress,
                abi: [{ name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] }],
                functionName: "balanceOf",
                args: [account],
              });
              setVaultShareBalance(vaultBalance as bigint);
              console.log("Fallback vault share balance:", vaultBalance?.toString());
            } catch (fallbackErr) {
              console.error("Fallback vault balance fetch failed:", fallbackErr);
            }
          }
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
    if (!publicClient || !assetMeta || !isCorrectChain) {
      // Don't reset estimatedShares when amount is empty - keep UI static
      if (amount) {
      setEstimatedShares(null);
      }
      return;
    }
    
    if (!amount) {
      // Don't reset estimatedShares when amount is empty - keep UI static
      return;
    }

    let cancelled = false;

    async function preview() {
      try {
        if (!assetMeta || !publicClient) return;
        const parsed = parseAmount(amount, assetMeta.decimals);
        // TypeScript type narrowing: publicClient is checked above
        const shares = await previewDeposit({
          vaultAddress,
          assets: parsed,
          publicClient: publicClient!,
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

  // Track if we just approved and should auto-deposit
  const [shouldAutoDeposit, setShouldAutoDeposit] = useState(false);
  const [pendingDepositAmount, setPendingDepositAmount] = useState<bigint | null>(null);
  const [hookConfirmed, setHookConfirmed] = useState(false);

  // Helper function to handle transaction failure
  const handleTransactionFailed = useCallback(async () => {
    setTxState("failed");
    setHookConfirmed(true);
    setShouldAutoDeposit(false);
    setPendingDepositAmount(null);
    
    if (txHash) {
      const actionType = shouldAutoDeposit ? "Approval" : (isDepositMode ? "Deposit" : "Withdrawal");
      addTransactionLog({
        level: "ERROR",
        message: `${actionType} transaction reverted (failed)`,
        txHash,
      });
      setError("Transaction reverted");
    }
    
    // Reset tx state after 5 seconds
    setTimeout(() => {
      setTxState("idle");
      setTxHash(null);
      setHookConfirmed(false);
      setError(null);
    }, 5000);
  }, [txHash, shouldAutoDeposit, isDepositMode, addTransactionLog]);

  // Helper function to handle transaction confirmation
  const handleTransactionConfirmed = useCallback(async () => {
      setTxState("confirmed");
    setHookConfirmed(true);
    
    if (txHash) {
      const actionType = shouldAutoDeposit ? "Approval" : (isDepositMode ? "Deposit" : "Withdrawal");
      addTransactionLog({
        level: "SUCCESS",
        message: `${actionType} confirmed successfully`,
        txHash,
      });
    }
    
    // If this was an approval and we should auto-deposit, proceed
    if (shouldAutoDeposit && pendingDepositAmount !== null && walletClient && account) {
      // Refresh allowance first
      if (publicClient && assetAddress) {
        const newAllowance = await readAllowance({
          owner: account,
          assetAddress,
          spender: vaultAddress,
          publicClient,
        });
        setAllowance(newAllowance);
        
        // If we have enough allowance now, proceed to deposit
        if (newAllowance >= pendingDepositAmount) {
          setTimeout(async () => {
            try {
              setError(null);
              setTxState("signing");
              const hash = await deposit({
                vaultAddress,
                assets: pendingDepositAmount,
                receiver: account,
                walletClient,
              });
              setTxHash(hash);
              setTxState("pending");
              setShouldAutoDeposit(false);
              setPendingDepositAmount(null);
              setHookConfirmed(false); // Reset for next transaction
              addTransactionLog({
                level: "INFO",
                message: "Deposit transaction submitted",
                txHash: hash,
              });
            } catch (err) {
              setTxState("failed");
              const errorMessage = formatErrorMessage(err);
              setError(errorMessage);
              setShouldAutoDeposit(false);
              setPendingDepositAmount(null);
              setHookConfirmed(false);
              addTransactionLog({
                level: "ERROR",
                message: `Deposit failed: ${errorMessage}`,
              });
            }
          }, 2000);
          return; // Don't reset state yet
        }
      }
    }
    
    // Refresh balances and allowance
      if (publicClient && account && assetAddress) {
      const [balances, newAllowance] = await Promise.all([
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
      setAssetBalance(balances.assetBalance);
      setVaultShareBalance(balances.vaultShareBalance);
      setAllowance(newAllowance);
    }
    
    // Clear input on success (only if not auto-depositing)
    if (!shouldAutoDeposit) {
      setAmount("");
      }
    
    // Reset tx state after 5 seconds (if not auto-depositing)
    if (!shouldAutoDeposit) {
      setTimeout(() => {
        setTxState("idle");
        setTxHash(null);
        setHookConfirmed(false);
      }, 5000);
    }
  }, [txHash, shouldAutoDeposit, isDepositMode, pendingDepositAmount, walletClient, account, publicClient, assetAddress, vaultAddress, addTransactionLog]);

  // Watch transaction receipt with explicit configuration (primary method)
  const shouldWatchTx = mounted && !!txHash && txState === "pending" && !hookConfirmed;
  const { data: receipt, isLoading: isTxPending, error: receiptError } = useWaitForTransactionReceipt({
    hash: shouldWatchTx ? txHash : undefined,
    chainId: EXPECTED_CHAIN_ID,
    confirmations: 1,
    pollingInterval: 1_000, // 1 second
    timeout: 120_000, // 120 seconds
  });

  // Handle receipt confirmation from hook
  useEffect(() => {
    if (receipt && !hookConfirmed) {
      if (receipt.status === "success") {
        handleTransactionConfirmed();
      } else if (receipt.status === "reverted") {
        handleTransactionFailed();
      }
    } else if (receiptError) {
      console.error("Transaction receipt hook error:", receiptError);
      // Don't set failed state immediately - let fallback handle it
    }
  }, [receipt, receiptError, hookConfirmed, handleTransactionConfirmed, handleTransactionFailed]);

  // Fallback: Direct waitForTransactionReceipt if hook hasn't confirmed after 30 seconds
  useEffect(() => {
    if (!mounted || !txHash || txState !== "pending" || hookConfirmed || !publicClient) return;

    const startTime = Date.now();
    const FALLBACK_DELAY = 30_000; // 30 seconds

    const fallbackTimer = setTimeout(async () => {
      // Only start fallback if hook hasn't confirmed yet
      if (txState === "pending" && !hookConfirmed && txHash) {
        console.log("Starting fallback transaction confirmation check...");
        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: txHash,
            confirmations: 1,
            pollingInterval: 1_000,
            timeout: 90_000, // 90 seconds remaining
          });

          if (receipt.status === "success") {
            console.log("Fallback: Transaction confirmed via direct check");
            await handleTransactionConfirmed();
          } else if (receipt.status === "reverted") {
            console.error("Fallback: Transaction reverted");
            await handleTransactionFailed();
          }
        } catch (error) {
          console.error("Fallback transaction check failed:", error);
          // Don't set failed state - let allowance polling handle it
        }
      }
    }, FALLBACK_DELAY);

    return () => clearTimeout(fallbackTimer);
  }, [mounted, txHash, txState, hookConfirmed, publicClient, shouldAutoDeposit, pendingDepositAmount, walletClient, account, assetAddress, vaultAddress, handleTransactionConfirmed, handleTransactionFailed]);

  // Final fallback: Poll allowance when waiting for approval confirmation
  useEffect(() => {
    if (!mounted || !shouldAutoDeposit || !pendingDepositAmount || hookConfirmed || !publicClient || !account || !assetAddress) return;

    const ALLOWANCE_POLL_INTERVAL = 5_000; // 5 seconds
    const MAX_POLL_TIME = 120_000; // 2 minutes max
    const startTime = Date.now();
    let cancelled = false;

    const allowanceInterval = setInterval(async () => {
      // Stop if cancelled
      if (cancelled) {
        clearInterval(allowanceInterval);
        return;
      }

      // Stop if we've been polling too long
      if (Date.now() - startTime > MAX_POLL_TIME) {
        clearInterval(allowanceInterval);
        return;
      }

      // Stop if already confirmed
      if (hookConfirmed || txState !== "pending") {
        clearInterval(allowanceInterval);
        return;
      }

      try {
        const currentAllowance = await readAllowance({
          owner: account,
          assetAddress,
          spender: vaultAddress,
          publicClient,
  });

        // If allowance has increased to expected amount, treat as confirmed
        if (!cancelled && currentAllowance >= pendingDepositAmount) {
          console.log("Allowance check: Approval detected via allowance increase");
          clearInterval(allowanceInterval);
          setAllowance(currentAllowance);
          await handleTransactionConfirmed();
        } else if (!cancelled) {
          // Update allowance in state even if not enough yet
          setAllowance(currentAllowance);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Allowance polling error:", error);
        }
      }
    }, ALLOWANCE_POLL_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(allowanceInterval);
    };
  }, [mounted, shouldAutoDeposit, pendingDepositAmount, hookConfirmed, publicClient, account, assetAddress, vaultAddress, txState, handleTransactionConfirmed]);

  // Parse and validate amount
  let parsedAmount: bigint | null = null;
  let amountError: string | null = null;

  if (amount) {
    try {
      if (isDepositMode) {
        if (assetMeta) {
      parsedAmount = parseAmount(amount, assetMeta.decimals);
      if (assetBalance !== null && parsedAmount > assetBalance) {
        amountError = "Insufficient balance";
          }
        }
      } else {
        // In withdraw mode, parse as vault shares (using vault decimals)
        if (vaultDecimals !== null) {
          parsedAmount = parseAmount(amount, vaultDecimals);
          if (vaultShareBalance !== null && parsedAmount > vaultShareBalance) {
            amountError = "Insufficient balance";
          }
        }
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
    setTransactionLogs([]); // Clear previous logs
    addTransactionLog({
      level: "INFO",
      message: "Requesting approval signature...",
    });
    // Set flag to auto-deposit after approval
    setShouldAutoDeposit(true);
    setPendingDepositAmount(parsedAmount);

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
      addTransactionLog({
        level: "INFO",
        message: "Approval transaction submitted",
        txHash: hash,
      });
    } catch (err) {
      setTxState("failed");
      setShouldAutoDeposit(false);
      setPendingDepositAmount(null);
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      addTransactionLog({
        level: "ERROR",
        message: `Approval failed: ${errorMessage}`,
      });
    }
  };

  const handleDeposit = async () => {
    if (!walletClient || !account || !parsedAmount) return;

    setError(null);
    setTxState("signing");
    setTransactionLogs([]); // Clear previous logs
    addTransactionLog({
      level: "INFO",
      message: "Requesting deposit signature...",
    });

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
      addTransactionLog({
        level: "INFO",
        message: "Deposit transaction submitted",
        txHash: hash,
      });
    } catch (err) {
      setTxState("failed");
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      addTransactionLog({
        level: "ERROR",
        message: `Deposit failed: ${errorMessage}`,
      });
    }
  };

  const handleWithdraw = async () => {
    if (!walletClient || !account || !parsedAmount || !publicClient) return;

    setError(null);
    setTxState("signing");
    setTransactionLogs([]); // Clear previous logs
    addTransactionLog({
      level: "INFO",
      message: "Requesting withdrawal signature...",
    });

    try {
      assertConnected(account);
      assertChain(chainId, EXPECTED_CHAIN_ID);

      // Convert shares to assets (withdraw function expects assets, not shares)
      const assetsAmount = await convertSharesToAssets({
        vaultAddress,
        shares: parsedAmount,
        publicClient,
      });

      const hash = await withdraw({
        vaultAddress,
        assets: assetsAmount,
        receiver: account,
        owner: account,
        walletClient,
      });

      setTxHash(hash);
      setTxState("pending");
      addTransactionLog({
        level: "INFO",
        message: "Withdrawal transaction submitted",
        txHash: hash,
      });
    } catch (err) {
      setTxState("failed");
      const errorMessage = formatErrorMessage(err);
      setError(errorMessage);
      addTransactionLog({
        level: "ERROR",
        message: `Withdrawal failed: ${errorMessage}`,
      });
    }
  };

  const handleMax = () => {
    if (isDepositMode) {
    if (assetBalance !== null && assetMeta) {
      setAmount(formatAmount(assetBalance, assetMeta.decimals));
      }
    } else {
      if (vaultShareBalance !== null && vaultDecimals !== null) {
        setAmount(formatAmount(vaultShareBalance, vaultDecimals));
      }
    }
  };


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

      {/* Deposit/Withdraw Toggle */}
      <div className="grid grid-cols-2 gap-2 bg-panel p-1 border border-border">
        <button
          type="button"
          onClick={() => setIsDepositMode(true)}
          className={cn(
            "font-bold text-[10px] py-2 uppercase tracking-wider text-center transition-colors",
            isDepositMode
              ? "bg-gold text-bg-base"
              : "bg-transparent text-text-dim hover:text-white"
          )}
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => setIsDepositMode(false)}
          className={cn(
            "font-bold text-[10px] py-2 uppercase tracking-wider text-center transition-colors",
            !isDepositMode
              ? "bg-gold text-bg-base"
              : "bg-transparent text-text-dim hover:text-white"
          )}
        >
          Withdraw
        </button>
      </div>

      {/* Amount Input */}
      <div className="border border-border p-3 bg-panel/30">
        <div className="text-[9px] text-text-dim uppercase tracking-wider mb-2 font-bold">
          {isDepositMode ? "Deposit Amount" : "Withdraw Amount"}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input
            type="text"
            placeholder="0.0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            disabled={!isCorrectChain || isProcessing}
            className="w-full bg-bg-base border border-border text-white text-lg p-2 rounded-none focus:border-gold focus:ring-0 focus:outline-none font-mono placeholder-text-dim/30"
          />
          <div className="flex items-center bg-bg-base border border-border h-full px-2 py-2 gap-1 shrink-0">
            {assetLogoUrl ? (
              <>
                <Image
                  src={assetLogoUrl}
                  alt={assetMeta?.symbol || "Asset"}
                  width={14}
                  height={14}
                  className="w-[14px] h-[14px] rounded-full glow-gold-icon"
                  unoptimized
                />
                <span className="text-[10px] font-bold text-white">{assetMeta?.symbol || "USDT0"}</span>
              </>
            ) : assetMeta ? (
              <>
                <span className="icon-slot w-[14px] h-[14px] border border-success glow-gold-icon" />
                <span className="text-[10px] font-bold text-white">{assetMeta.symbol}</span>
              </>
            ) : (
              <>
                <span className="icon-slot w-[14px] h-[14px] border border-success glow-gold-icon" />
                <span className="text-[10px] font-bold text-white">USDT0</span>
              </>
            )}
          </div>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-[9px] text-text-dim flex items-center gap-1">
            <Landmark className="w-[10px] h-[10px] text-text-dim" strokeWidth={2} />
            {isDepositMode ? (
              assetBalance !== null && assetMeta
                ? `${formatAmount(assetBalance, assetMeta.decimals)} ${assetMeta.symbol}`
                : "0.0000 USDT0"
            ) : (
              vaultShareBalance !== null && vaultDecimals !== null
                ? `${formatAmount(vaultShareBalance, vaultDecimals)} shares`
                : "0.0000 shares"
            )}
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                if (isDepositMode) {
                  if (assetBalance !== null && assetMeta) {
                    const halfAmount = assetBalance / BigInt(2);
                    setAmount(formatAmount(halfAmount, assetMeta.decimals));
                  }
                } else {
                  if (vaultShareBalance !== null && vaultDecimals !== null) {
                    const halfAmount = vaultShareBalance / BigInt(2);
                    setAmount(formatAmount(halfAmount, vaultDecimals));
                  }
                }
              }}
              className="border border-border text-text-dim hover:text-white hover:bg-border/20 text-[8px] px-2 py-0.5 uppercase font-bold transition-all"
              disabled={!isCorrectChain || isProcessing || (isDepositMode ? !assetBalance : !vaultShareBalance)}
            >
              Half
            </button>
            <button
              type="button"
              onClick={handleMax}
              className="border border-border text-text-dim hover:text-white hover:bg-border/20 text-[8px] px-2 py-0.5 uppercase font-bold transition-all"
              disabled={!isCorrectChain || isProcessing || (isDepositMode ? !assetBalance : !vaultShareBalance)}
            >
              Max
            </button>
          </div>
        </div>
        {amountError && (
          <p className="text-xs text-danger mt-1 font-mono">{amountError}</p>
        )}
      </div>

      {/* Balance Info */}
      {isCorrectChain && assetMeta && vaultDecimals !== null && (
        <div className="space-y-1 text-xs font-mono text-text-dim">
          {isDepositMode && (
            <div className="flex justify-between text-text-dim/50">
              <span>Est. shares:</span>
              <span>
                {estimatedShares !== null 
                  ? formatAmount(estimatedShares, vaultDecimals)
                  : "—"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-2">
        {isDepositMode ? (
          <Button
            variant="outline"
            className="w-full border-gold bg-gold/80 hover:bg-gold text-text"
            onClick={needsApproval ? handleApprove : handleDeposit}
            disabled={needsApproval ? (!canApprove || isProcessing) : (!canDeposit || isProcessing)}
          >
            {isProcessing
              ? "Processing..." 
              : needsApproval 
                ? "Approve"
                : "Deposit USDT0"}
          </Button>
        ) : (
        <Button
          variant="outline"
          className="w-full"
          onClick={handleWithdraw}
          disabled={!canWithdraw || isProcessing}
        >
          {isProcessing && txState !== "idle" ? "Processing..." : "Withdraw"}
        </Button>
        )}
      </div>

    </div>
  );
}

