"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, createStorage, noopStorage } from "wagmi";
import { ReactNode, useState, useEffect } from "react";
import { CHAINS } from "@/lib/web3/chains";

// Use noopStorage so wagmi never touches indexedDB during SSR/build (fixes "indexedDB is not defined")
const config = getDefaultConfig({
  appName: "Myrmidons OS",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: CHAINS,
  storage: createStorage({ storage: noopStorage }),
  transports: Object.fromEntries(CHAINS.map((c) => [c.id, http()])),
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
        {mounted ? <RainbowKitProvider>{children}</RainbowKitProvider> : children}
      </WagmiProvider>
    </QueryClientProvider>
  );
}
