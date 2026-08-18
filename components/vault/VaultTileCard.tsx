"use client";

import Link from "next/link";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { CornerFrame } from "@/components/ui/corner-frame";
import { useVaultMetadata, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis } from "@/lib/morpho/view";

/**
 * Vault index tile with live TVL / net APY — shared by the landing's HEGEMON
 * section and the /vaults index. `v2` selects the vaultV2ByAddress API entity
 * (V1 HEGEMON passes false).
 */
export function VaultTileCard({
  name,
  secondary,
  address,
  chainId,
  route,
  v2 = true,
  status = "dev",
  note,
}: {
  name: string;
  secondary: string;
  address: string;
  chainId: number;
  route: string;
  v2?: boolean;
  status?: "live" | "dev" | "offline" | "maintenance";
  note?: string;
}) {
  const metadata = useVaultMetadata(address, chainId, v2);
  const apy = useVaultApy(address, chainId, v2);
  const kpis = pickKpis(metadata.data ?? null, apy.data ?? null);
  const loading = metadata.isLoading || apy.isLoading;

  return (
    <Link href={route} className="block group">
      <CornerFrame className="p-5 transition-colors group-hover:bg-white/5">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold uppercase tracking-widest">{name}</h3>
          <StatusIndicator status={status} />
        </div>
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-5">
          {secondary}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
              TVL
            </div>
            <div className="text-xl font-bold tracking-tight">
              <GlitchTypeText loading={loading} value={kpis.tvlUsd ?? "—"} mode="text" />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
              NET APY
            </div>
            <div className="text-xl font-bold tracking-tight text-gold">
              <GlitchTypeText loading={loading} value={kpis.netApyPct ?? "—"} mode="text" />
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-text-dim group-hover:text-gold transition-colors">
            &gt; OPEN VAULT
          </span>
          {note && (
            <span className="text-[9px] uppercase tracking-widest font-mono text-text-dim">
              {note}
            </span>
          )}
        </div>
      </CornerFrame>
    </Link>
  );
}
