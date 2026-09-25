import { defineChain } from "viem";
import { arbitrum, base, katana as katanaBase, mainnet as mainnetBase, monad } from "viem/chains";

// viem's mainnet default RPC (eth.merkle.io) answers 429 to the portfolio
// scan's burst of reads; publicnode does not (2026-09-15).
export const mainnet = defineChain({
  ...mainnetBase,
  rpcUrls: { default: { http: ["https://ethereum-rpc.publicnode.com"] } },
});

// viem's katana definition carries no multicall3 entry, so viem refuses to
// batch there; the canonical deployment is live (eth_getCode, 2026-09-15).
export const katana = defineChain({
  ...katanaBase,
  contracts: { ...katanaBase.contracts, multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" } },
});

// Single source for the wallet-reachable chains: wagmi/RainbowKit config
// (app/providers.tsx) and the Blue action guard (lib/web3/blue.ts) both read
// CHAINS, so a chain the wallet can't switch to never offers a write. Every
// MNEMON chain (lib/mnemon/format.ts MNEMON_CHAINS) must be here.

// Arc (Circle). Not in viem 2.43; metadata from @morpho-org/morpho-ts
// (native gas is USDC, 18 decimals). RPC answers chainId 5042 and multicall3
// + Morpho are deployed (eth_getCode, 2026-09-25).
export const arc = defineChain({
  id: 5042,
  name: "Arc",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.arc.io"] },
    public: { http: ["https://rpc.mainnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arc Explorer", url: "https://explorer.arc.io" },
  },
  contracts: {
    multicall3: { address: "0xcA11bde05977b3631167028862bE2a173976CA11" },
  },
});

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
    default: { name: "Robinhood Chain Explorer", url: "https://robin.etherscan.io" },
  },
  contracts: {
    // Verified deployed (eth_getCode, 2026-08-20).
    multicall3: { address: "0xca11bde05977b3631167028862be2a173976ca11" },
  },
});

// base stays first: RainbowKit treats the first entry as the default chain.
export const CHAINS = [base, hyperEVM, robinhoodChain, mainnet, arbitrum, katana, monad, arc] as const;

export function isWalletChain(chainId: number): boolean {
  return CHAINS.some((c) => c.id === chainId);
}
