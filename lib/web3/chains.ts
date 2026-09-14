import { defineChain } from "viem";
import { arbitrum, base, katana, mainnet, monad } from "viem/chains";

// Single source for the wallet-reachable chains: wagmi/RainbowKit config
// (app/providers.tsx) and the Blue action guard (lib/web3/blue.ts) both read
// CHAINS, so a chain the wallet can't switch to never offers a write.
// MNEMON tracks Arc (5042) too, but it has no public RPC yet — read-only there.

export const hyperEVM = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid.xyz/evm"] },
    public: { http: ["https://rpc.hyperliquid.xyz/evm"] },
  },
  blockExplorers: {
    default: { name: "HyperEVM Scan", url: "https://hyperevmscan.io" },
  },
  contracts: {
    multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11" },
  },
});

// Robinhood Chain (LiquidSwap + Morpho live there; swap tool supports it)
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    public: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Chain Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
  contracts: {
    // Verified deployed (eth_getCode, 2026-08-20).
    multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11" },
  },
});

// base stays first: RainbowKit treats the first entry as the default chain.
export const CHAINS = [base, hyperEVM, robinhoodChain, mainnet, arbitrum, katana, monad] as const;

export function isWalletChain(chainId: number): boolean {
  return CHAINS.some((c) => c.id === chainId);
}
