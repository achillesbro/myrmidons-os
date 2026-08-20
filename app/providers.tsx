"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base } from "viem/chains";
import { http, createStorage, noopStorage } from "wagmi";
import { defineChain } from "viem";
import { ReactNode, useState, useEffect } from "react";
import { LastReallocTxProvider } from "@/lib/logs/last-realloc-context";

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

// Robinhood Chain (LiquidSwap + Morpho live there; swap tool supports it)
const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
    public: {
      http: ["https://rpc.mainnet.chain.robinhood.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
  contracts: {
    // Verified deployed (eth_getCode, 2026-08-20).
    multicall3: {
      address: "0xca11bde05977b3631167028862be2a173976ca11",
    },
  },
});

// Use noopStorage so wagmi never touches indexedDB during SSR/build (fixes "indexedDB is not defined")
const config = getDefaultConfig({
  appName: "Myrmidons OS",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [base, hyperEVM, robinhoodChain],
  storage: createStorage({ storage: noopStorage }),
  transports: {
    [base.id]: http(),
    [hyperEVM.id]: http(),
    [robinhoodChain.id]: http(),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        {mounted ? (
          <RainbowKitProvider>
            <LastReallocTxProvider>{children}</LastReallocTxProvider>
          </RainbowKitProvider>
        ) : (
          <LastReallocTxProvider>{children}</LastReallocTxProvider>
        )}
      </WagmiProvider>
    </QueryClientProvider>
  );
}

