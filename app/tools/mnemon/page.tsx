"use client";

import { useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/chrome/AppShell";
import { AppSubnav } from "@/components/chrome/AppSubnav";
import { MnemonMarketsTab } from "@/components/tools/mnemon/MnemonMarketsTab";

// MNEMON market observatory. Data comes from the MNEMON archive's static JSON
// snapshots via /api/mnemon/*. Tabs are kept for the deferred benchmark view;
// only "Markets" ships today.
export default function MnemonToolPage() {
  const [activeTab, setActiveTab] = useState("markets");

  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base">
      <AppShell>
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-base shrink-0">
          <Link
            href="/#tool=mnemon"
            className="text-[10px] font-mono uppercase tracking-widest text-text-dim hover:text-gold transition-colors"
          >
            ← TERMINAL
          </Link>
          <span className="text-[9px] font-mono uppercase tracking-widest text-text-dim/60">
            MNEMON // MARKET_OBSERVATORY
          </span>
        </div>
        <AppSubnav
          tabs={[{ value: "markets", label: "Markets" }]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
        <div className="flex-1 overflow-y-auto p-0 scroll-smooth">
          {activeTab === "markets" && <MnemonMarketsTab />}
        </div>
      </AppShell>
    </div>
  );
}
