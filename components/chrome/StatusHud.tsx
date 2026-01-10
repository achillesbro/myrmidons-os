"use client";

import { useBlockNumber, usePublicClient } from "wagmi";
import { useEffect, useState, useRef } from "react";
import { formatUnits } from "viem";
import { cn } from "@/lib/utils";

export function StatusHud() {
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const publicClient = usePublicClient();
  const [gasPrice, setGasPrice] = useState<bigint | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll gas price
  useEffect(() => {
    if (!publicClient) return;

    const fetchGasPrice = async () => {
      try {
        const price = await publicClient.getGasPrice();
        setGasPrice(price);
      } catch (error) {
        // Silently handle errors - will show "—" for gas
        setGasPrice(null);
      }
    };

    // Fetch immediately
    fetchGasPrice();

    // Poll every 5 seconds
    intervalRef.current = setInterval(fetchGasPrice, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [publicClient]);

  // Format gas price in gwei with high precision
  const formatGasPrice = (price: bigint | null): string => {
    if (price === null) return "—";
    // Use formatUnits to get precise string representation (9 decimals for gwei: 1 gwei = 10^9 wei)
    const formatted = formatUnits(price, 9);
    const parts = formatted.split(".");
    
    if (parts.length === 2) {
      // Ensure at least 3 decimal places, show up to 6
      const decimals = parts[1].slice(0, 6).padEnd(3, "0");
      // Remove trailing zeros while keeping at least 3 decimals
      const trimmed = decimals.replace(/0+$/, "") || "000";
      const finalDecimals = trimmed.length >= 3 ? trimmed : trimmed.padEnd(3, "0");
      return `${parts[0]}.${finalDecimals}`;
    }
    
    return formatted;
  };

  // Format block number with commas
  const formatBlockNumber = (block: bigint | undefined): string => {
    if (block === undefined) return "—";
    return block.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const blockDisplay = formatBlockNumber(blockNumber);
  const gasDisplay = formatGasPrice(gasPrice);

  return (
    <div
      className={cn(
        "font-mono text-[10px] tracking-widest uppercase whitespace-nowrap overflow-hidden text-ellipsis max-w-[420px] text-text-dim/60"
      )}
    >
      HYPEREVM · BLOCK {blockDisplay} · GAS {gasDisplay} gwei
    </div>
  );
}
