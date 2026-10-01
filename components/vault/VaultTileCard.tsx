"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { CornerFrame } from "@/components/ui/corner-frame";
import { useVaultMetadata, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis } from "@/lib/morpho/view";

/** The `.frame-reveal` CSS animation (globals.css): text types in once the
 *  frame has expanded and the content starts fading in (55%). */
const FRAME_MS = 900;
const CONTENT_AT = 0.55;

/**
 * Vault index tile with live TVL / net APY — shared by the landing's HEGEMON
 * section and the /vaults index. `v2` selects the vaultV2ByAddress API entity
 * (V1 HEGEMON passes false). `revealDelayMs` (the /vaults index) plays the
 * corner-frame trace and glitch-types every line, staggered by that delay;
 * without it the card renders as before.
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
  revealDelayMs,
}: {
  name: string;
  secondary: string;
  address: string;
  chainId: number;
  route: string;
  v2?: boolean;
  status?: "live" | "dev" | "offline" | "maintenance";
  note?: string;
  revealDelayMs?: number;
}) {
  const metadata = useVaultMetadata(address, chainId, v2);
  const apy = useVaultApy(address, chainId, v2);
  const kpis = pickKpis(metadata.data ?? null, apy.data ?? null);
  const loading = metadata.isLoading || apy.isLoading;

  // Text types in once the frame (which starts when scrolled into view) has
  // expanded and its content begins fading in.
  const animate = revealDelayMs !== undefined;
  const [revealed, setRevealed] = useState(!animate);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const onReveal = () => {
    timer.current = setTimeout(() => setRevealed(true), (revealDelayMs ?? 0) + FRAME_MS * CONTENT_AT);
  };

  const text = (value: string) => (
    <GlitchTypeText loading={!revealed} value={value} mode="text" />
  );

  return (
    <Link href={route} className="block group">
      <CornerFrame
        className="p-5 transition-colors group-hover:bg-white/5"
        reveal={revealDelayMs}
        onReveal={onReveal}
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold uppercase tracking-widest">{text(name)}</h3>
          <StatusIndicator status={status} reveal={animate ? revealed : undefined} />
        </div>
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-5">
          {text(secondary)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
              {text("TVL")}
            </div>
            <div className="text-xl font-bold tracking-tight">
              <GlitchTypeText loading={loading || !revealed} value={kpis.tvlUsd ?? "—"} mode="text" />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-text-dim font-mono mb-1">
              {text("NET APY")}
            </div>
            <div className="text-xl font-bold tracking-tight text-gold">
              <GlitchTypeText loading={loading || !revealed} value={kpis.netApyPct ?? "—"} mode="text" />
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-text-dim group-hover:text-gold transition-colors">
            &gt; {text("OPEN VAULT")}
          </span>
          {note && (
            <span className="text-[9px] uppercase tracking-widest font-mono text-text-dim">
              {text(note)}
            </span>
          )}
        </div>
      </CornerFrame>
    </Link>
  );
}
