"use client";

import Link from "next/link";
import { VaultTileCard } from "@/components/vault/VaultTileCard";
import {
  USDT0_VAULT_ADDRESS,
  USDT0_VAULT_CHAIN_ID,
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";

/** Vault index — same tile cards as the landing's EXECUTION section, with
 *  live TVL / net APY per vault. V1 stays listed for withdrawals. */
export default function VaultsPage() {
  return (
    <div className="min-h-screen bg-bg-base pt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-[9px] uppercase tracking-widest text-gold font-mono mb-4">
          [ VAULTS // INDEX ]
        </div>
        <h1 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-2">
          MYRMIDONS vaults
        </h1>
        <p className="font-mono text-sm text-text/80 leading-relaxed max-w-2xl mb-8">
          ERC-4626 vaults on HyperEVM, reallocated by the HEGEMON_V2 program. Deposits are open on
          the V2 vaults; the V1 vault is deprecated and open for withdrawals only.
        </p>
        <div className="grid md:grid-cols-2 gap-5">
          <VaultTileCard
            name="MYRMIDONS_USDT0"
            secondary="MORPHO VAULT V2 // USDT0 // HEGEMON_V2"
            address={HEGEMON_V2_VAULT_ADDRESS}
            chainId={HEGEMON_V2_VAULT_CHAIN_ID}
            route="/vaults/usdt0-v2"
          />
          <VaultTileCard
            name="MYRMIDONS_USDC"
            secondary="MORPHO VAULT V2 // USDC // HEGEMON_V2"
            address={USDC_V2_VAULT_ADDRESS}
            chainId={USDC_V2_VAULT_CHAIN_ID}
            route="/vaults/usdc-v2"
          />
          <VaultTileCard
            name="HEGEMON"
            secondary="MORPHO METAMORPHO // USDT0 // V1"
            address={USDT0_VAULT_ADDRESS}
            chainId={USDT0_VAULT_CHAIN_ID}
            route="/vaults/usdt0"
            v2={false}
            status="offline"
            note="DEPRECATED — WITHDRAWALS OPEN"
          />
        </div>
        <div className="mt-10 font-mono text-[10px] font-bold uppercase tracking-widest">
          <Link href="/terminal" className="text-text-dim hover:text-gold transition-colors">
            &gt; BACK TO TERMINAL
          </Link>
        </div>
      </div>
    </div>
  );
}
