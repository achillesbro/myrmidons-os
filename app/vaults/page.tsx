"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { VaultTileCard } from "@/components/vault/VaultTileCard";
import { useVaultMetadata } from "@/lib/morpho/queries";
import { formatUsd } from "@/lib/morpho/view";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
  WHYPE_V2_VAULT_ADDRESS,
  WHYPE_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";

/** Static page copy glitch-types in `delayMs` after hydration, so the page
 *  reads top-down: label, title, blurb, total, then the cards expand. */
function Copy({ value, delayMs = 0 }: { value: string; delayMs?: number }) {
  const [go, setGo] = useState(delayMs === 0);
  useEffect(() => {
    if (delayMs === 0) return;
    const t = setTimeout(() => setGo(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return <GlitchTypeText loading={!go} value={value} mode="text" />;
}

/** Vault index — same tile cards as the landing's EXECUTION section, with
 *  live TVL / net APY per vault, plus the TVL summed across the three. */
export default function VaultsPage() {
  // Same queries the cards run (TanStack dedupes); the sum waits for all three.
  const metas = [
    useVaultMetadata(HEGEMON_V2_VAULT_ADDRESS, HEGEMON_V2_VAULT_CHAIN_ID, true),
    useVaultMetadata(USDC_V2_VAULT_ADDRESS, USDC_V2_VAULT_CHAIN_ID, true),
    useVaultMetadata(WHYPE_V2_VAULT_ADDRESS, WHYPE_V2_VAULT_CHAIN_ID, true),
  ];
  const totalLoading = metas.some((m) => m.isLoading);
  const totalTvl = totalLoading
    ? undefined
    : formatUsd(
        metas.reduce(
          (sum, m) => sum + (Number(m.data?.vaultByAddress?.state?.totalAssetsUsd ?? 0) || 0),
          0,
        ),
      );

  return (
    <div className="min-h-screen bg-bg-base pt-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-[9px] uppercase tracking-widest text-gold font-mono mb-4">
          <Copy value="[ VAULTS // INDEX ]" />
        </div>
        <h1 className="text-lg sm:text-xl font-semibold uppercase tracking-wide mb-2">
          <Copy value="MYRMIDONS vaults" delayMs={120} />
        </h1>
        <p className="font-mono text-sm text-text/80 leading-relaxed max-w-2xl mb-8">
          <Copy value="ERC-4626 vaults on HyperEVM, reallocated by the HEGEMON_V2 program. Deposits are open." delayMs={240} />
        </p>
        <div className="mb-8">
          <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
            <Copy value="TOTAL TVL" delayMs={360} />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            <GlitchTypeText loading={totalLoading} value={totalTvl} mode="text" />
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <VaultTileCard
            name="MYRMIDONS_USDT0"
            secondary="MORPHO VAULT V2 // USDT0 // HEGEMON_V2"
            address={HEGEMON_V2_VAULT_ADDRESS}
            chainId={HEGEMON_V2_VAULT_CHAIN_ID}
            route="/vaults/usdt0-v2"
            revealDelayMs={400}
          />
          <VaultTileCard
            name="MYRMIDONS_USDC"
            secondary="MORPHO VAULT V2 // USDC // HEGEMON_V2"
            address={USDC_V2_VAULT_ADDRESS}
            chainId={USDC_V2_VAULT_CHAIN_ID}
            route="/vaults/usdc-v2"
            revealDelayMs={550}
          />
          <VaultTileCard
            name="MYRMIDONS_WHYPE"
            secondary="MORPHO VAULT V2 // WHYPE // HEGEMON_V2"
            address={WHYPE_V2_VAULT_ADDRESS}
            chainId={WHYPE_V2_VAULT_CHAIN_ID}
            route="/vaults/whype-v2"
            revealDelayMs={700}
          />
        </div>
        <div className="mt-10 font-mono text-[10px] font-bold uppercase tracking-widest">
          <Link href="/terminal" className="text-text-dim hover:text-gold transition-colors">
            &gt; <Copy value="BACK TO TERMINAL" />
          </Link>
        </div>
      </div>
    </div>
  );
}
