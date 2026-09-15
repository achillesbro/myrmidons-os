"use client";

import Link from "next/link";
import { AppShell } from "@/components/chrome/AppShell";
import { PortfolioView } from "@/components/portfolio/PortfolioView";

// PORTFOLIO — the connected wallet's positions across the MYRMIDONS vaults
// and every MNEMON-indexed Morpho Blue market, with the cheap insights the
// analyser data affords. Same shell as the MNEMON tool page.
export default function PortfolioPage() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base">
      <AppShell>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-base shrink-0">
          <Link
            href="/#tool=portfolio"
            className="text-[10px] font-mono uppercase tracking-widest text-text-dim hover:text-gold transition-colors"
          >
            ← TERMINAL
          </Link>
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-dim/60">
            PORTFOLIO // POSITIONS
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-0 scroll-smooth">
          <PortfolioView />
        </div>
      </AppShell>
    </div>
  );
}
