"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base } from "viem/chains";
import { http } from "wagmi";
import { defineChain } from "viem";
import { ReactNode, useState, useEffect } from "react";

// HyperEVM chain definition
const hyperEVM = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: {
    name: "HYPE",
    symbol: "HYPE",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.hyperliquid.xyz/evm"],
    },
    public: {
      http: ["https://rpc.hyperliquid.xyz/evm"],
    },
  },
  blockExplorers: {
    default: {
      name: "HyperEVM Scan",
      url: "https://hyperevmscan.io",
    },
  },
  contracts: {
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
    },
  },
});

const config = getDefaultConfig({
  appName: "Myrmidons OS",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [base, hyperEVM],
  transports: {
    [base.id]: http(),
    [hyperEVM.id]: http(),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30 seconds
            gcTime: 5 * 60_000, // 5 minutes (formerly cacheTime)
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  // QueryClientProvider is SSR-safe, always render it
  // Only conditionally render wallet providers (they need client-side)
  return (
    <QueryClientProvider client={queryClient}>
      {mounted ? (
        <WagmiProvider config={config}>
          <RainbowKitProvider>{children}</RainbowKitProvider>
        </WagmiProvider>
      ) : (
        children
      )}
    </QueryClientProvider>
  );
}

