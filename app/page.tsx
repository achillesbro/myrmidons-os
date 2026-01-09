"use client";

import { GridPanel } from "@/components/ui/grid-panel";
import { GridKpi } from "@/components/ui/grid-kpi";
import { Button } from "@/components/ui/button";
import { ShardSvg, getSignalMarks, SHARD_CLIP_PATH, SHARD_HEIGHT, BRACKET_CLIP_PATH, CELL_CLIP_PATH, CELL_CLIP_PATH_RELATIVE } from "@/components/ui/shard-svg";
import { GlitchTypeText } from "@/components/ui/animated-text";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

type FileStatus = "ACTIVE" | "IN DEVELOPMENT" | "READ ONLY";
type FileAccess = "Public" | "Private" | "Internal";

interface FileItem {
  id: string;
  title: string;
  status: FileStatus;
  access: FileAccess;
}

interface FileGroup {
  name: string;
  files: FileItem[];
}

const fileGroups: FileGroup[] = [
  {
    name: "STRATEGIES",
    files: [
      {
        id: "strategy-usdt0",
        title: "Morpho Reallocator — USDT0",
        status: "ACTIVE",
        access: "Public",
      },
      {
        id: "strategy-dex-arb",
        title: "DEX Arbitrage",
        status: "IN DEVELOPMENT",
        access: "Private",
      },
      {
        id: "strategy-liq-protect",
        title: "Liquidation Protection",
        status: "IN DEVELOPMENT",
        access: "Private",
      },
    ],
  },
  {
    name: "SYSTEM",
    files: [
      {
        id: "system-myrmidons",
        title: "What is Myrmidons",
        status: "READ ONLY",
        access: "Public",
      },
      {
        id: "system-how-it-works",
        title: "How it Works",
        status: "READ ONLY",
        access: "Public",
      },
    ],
  },
  {
    name: "ACCESS",
    files: [
      {
        id: "access-contact",
        title: "Contact / Request Access",
        status: "READ ONLY",
        access: "Public",
      },
    ],
  },
];

const allFileIds = new Set(fileGroups.flatMap((group) => group.files.map((file) => file.id)));

function parseHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  const match = hash.match(/file=(.+)/);
  if (match) {
    const fileId = decodeURIComponent(match[1]);
    return allFileIds.has(fileId) ? fileId : null;
  }
  return null;
}

function setHash(fileId: string | null) {
  if (typeof window === "undefined") return;
  if (fileId) {
    window.location.hash = `file=${encodeURIComponent(fileId)}`;
  } else {
    window.location.hash = "";
  }
}

function getFileById(fileId: string): FileItem | null {
  for (const group of fileGroups) {
    const file = group.files.find((f) => f.id === fileId);
    if (file) return file;
  }
  return null;
}

function getStatusLabel(status: FileStatus): string {
  if (status === "ACTIVE") return "LIVE";
  if (status === "IN DEVELOPMENT") return "IN_DEV";
  return "READONLY";
}

function getFileLabel(fileId: string): string {
  const labelMap: Record<string, string> = {
    "strategy-usdt0": "MORPHO_REALLOCATOR",
    "strategy-dex-arb": "DEX_ARBITRAGE",
    "strategy-liq-protect": "LIQUIDATION_PROTECT",
    "system-myrmidons": "WHAT_IS_MYRMIDONS",
    "system-how-it-works": "HOW_IT_WORKS",
    "access-contact": "CONTACT_REQUEST_ACCESS",
  };
  return labelMap[fileId] || fileId.toUpperCase();
}

function ShardEntry({
  file,
  isSelected,
  onClick,
}: {
  file: FileItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  const fileLabel = getFileLabel(file.id);
  const isLive = file.status === "ACTIVE";
  const isDev = file.status === "IN DEVELOPMENT";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full text-left font-mono transition-all duration-300 cursor-pointer",
        isSelected ? "-translate-y-2 z-10" : "hover:-translate-y-2 hover:z-10"
      )}
      style={{
        height: SHARD_HEIGHT,
      }}
    >
      {/* Solid backplate for bracket - fully opaque */}
      <div
        className="absolute inset-0 bg-bg-base"
        style={{
          clipPath: BRACKET_CLIP_PATH,
        }}
      />
      
      {/* Solid backplate for cell - fully opaque */}
      <div
        className="absolute inset-0 bg-bg-base"
        style={{
          clipPath: CELL_CLIP_PATH,
        }}
      />
      
      {/* Scanline overlay for bracket */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: "linear-gradient(to bottom, transparent 50%, rgba(241, 245, 249, 0.02) 50%)",
          backgroundSize: "100% 4px",
          clipPath: BRACKET_CLIP_PATH,
        }}
      />
      
      {/* Scanline overlay for cell */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: "linear-gradient(to bottom, transparent 50%, rgba(241, 245, 249, 0.02) 50%)",
          backgroundSize: "100% 4px",
          clipPath: CELL_CLIP_PATH,
        }}
      />

      <ShardSvg fileId={file.id} isSelected={isSelected} />

      {/* Content overlay */}
      <div className="absolute top-0 bottom-0 left-[15.79%] right-0" style={{ clipPath: CELL_CLIP_PATH_RELATIVE }}>
        {/* Header: label + status chip */}
        <div className="absolute top-0 left-0 w-full p-3 bg-gradient-to-b from-black/20 to-transparent">
          <div className="flex items-baseline border-b border-border/10 pb-1.5 pr-8">
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-2.5 bg-gold"></div>
              <h1 className="text-[9px] font-bold uppercase tracking-widest text-text leading-none whitespace-nowrap overflow-hidden text-ellipsis font-mono">
                {fileLabel}
              </h1>
            </div>
          </div>
          {/* Status dot - positioned in top right corner */}
          <div
            className={cn(
              "absolute top-3 right-3 w-1.5 h-1.5 rounded-full",
              isLive
                ? "bg-success animate-pulse-slow"
                : isDev
                ? "bg-gold animate-pulse-slow"
                : "bg-text/40"
            )}
            style={
              isLive
                ? {
                    boxShadow:
                      "0 0 6px color-mix(in oklab, var(--success) 55%, transparent), 0 0 12px color-mix(in oklab, var(--success) 30%, transparent)",
                  }
                : isDev
                ? {
                    boxShadow:
                      "0 0 6px color-mix(in oklab, var(--gold) 55%, transparent), 0 0 12px color-mix(in oklab, var(--gold) 30%, transparent)",
                  }
                : undefined
            }
          />
        </div>

        {/* Footer: signal marks */}
        <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-end">
          <div className="flex gap-0.5">
            {getSignalMarks(file.id)}
          </div>
        </div>
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <>
      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">CONTENT VIEWPORT // NO_SHARD_SELECTED</div>
    </>
  );
}

/**
 * Hook to manage staggered reveal loading states for text animations.
 * Used with GlitchTypeText component (from components/ui/animated-text.tsx).
 * 
 * The GlitchTypeText component provides the type-in + scramble/glitch reveal effect
 * used on the USDT0 vault page. It respects prefers-reduced-motion and skips animation
 * for strings longer than 40 chars. This hook coordinates staggered reveals by managing
 * loading states that trigger animations in sequence.
 * 
 * When fileId changes, triggers a sequence of loading states with delays
 * to create staggered type-in + glitch reveal effect.
 * 
 * Usage: const loadingStates = useStaggeredReveal(fileId, count, baseDelay);
 * 
 * To extend: Add more elements to FileScreen cases and use additional indices
 * from the loadingStates array. The hook supports up to 'count' simultaneous reveals.
 */
function useStaggeredReveal(fileId: string | null, count: number, baseDelay: number = 150) {
  const [loadingStates, setLoadingStates] = useState<boolean[]>(Array(count).fill(true));
  const fileIdRef = useRef<string | null>(null);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  
  useEffect(() => {
    if (fileIdRef.current !== fileId) {
      fileIdRef.current = fileId;
      // Clear any pending timeouts
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
      
      // Reset all to loading
      setLoadingStates(Array(count).fill(true));
      
      // Stagger the reveals
      for (let i = 0; i < count; i++) {
        const timeout = setTimeout(() => {
          setLoadingStates((prev) => {
            const next = [...prev];
            next[i] = false;
            return next;
          });
        }, i * baseDelay);
        timeoutRefs.current.push(timeout);
      }
    }
    
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, [fileId, count, baseDelay]);
  
  return loadingStates;
}

function FileScreen({ fileId }: { fileId: string }) {
  const file = getFileById(fileId);
  if (!file) return null;

  // Stagger reveals: use max count (9) for all cases, each case uses only what it needs
  // Elements: header, label, title, desc1, desc2, kpi1, kpi2, kpi3, kpi4
  const loadingStates = useStaggeredReveal(fileId, 9, 150);

  if (fileId === "strategy-usdt0") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={loadingStates[0]} value="CONTENT VIEWPORT // MORPHO_REALLOCATOR" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={loadingStates[1]} value="LIVE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={loadingStates[2]} value="MORPHO REALLOCATOR — USDT0" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-desc1`} loading={loadingStates[3]} value="Adaptive allocator that rebalances across Morpho markets based on yield, utilization, and exit safety." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-desc2`} loading={loadingStates[4]} value="Optimizes net APY while enforcing risk and concentration limits." mode="text" />
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-t border-border bg-bg-base">
          <GridKpi
            label="TVL"
            value={<GlitchTypeText key={`${fileId}-kpi1`} loading={loadingStates[5]} value="—" mode="text" />}
            accent="default"
            className="border-r border-b border-border"
          />
          <GridKpi
            label="Net APY"
            value={<GlitchTypeText key={`${fileId}-kpi2`} loading={loadingStates[6]} value="—" mode="text" />}
            accent="gold"
            cornerIndicator="gold"
            className="border-r border-b border-border"
          />
          <GridKpi
            label="Utilization"
            value={<GlitchTypeText key={`${fileId}-kpi3`} loading={loadingStates[7]} value="—" mode="text" />}
            accent="default"
            className="border-r border-b border-border"
          />
          <GridKpi
            label="Risk Factor"
            value={<GlitchTypeText key={`${fileId}-kpi4`} loading={loadingStates[8]} value="—" mode="text" />}
            accent="default"
            className="border-r border-b border-border"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border/30">
          <Link href="/vaults/usdt0">
            <Button variant="gold" size="md" className="w-full sm:w-auto">
              Deposit USDT0
            </Button>
          </Link>
          <Link href="/vaults/usdt0">
            <Button variant="outline" size="md" className="w-full sm:w-auto">
              View vault analytics
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (fileId === "strategy-dex-arb") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={loadingStates[0]} value="CONTENT VIEWPORT // DEX_ARBITRAGE" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={loadingStates[1]} value="PRIVATE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={loadingStates[2]} value="DEX ARBITRAGE" mode="text" />
          </h2>
          <ul className="space-y-1 text-sm font-mono text-text/80 list-disc list-inside">
            <li>Cross-pool execution engine</li>
            <li>Atomic routing and execution policies</li>
            <li>Not deployed / not accessible</li>
          </ul>
        </div>

        <div className="pt-1 border-t border-border/30">
          <button
            onClick={() => setHash("access-contact")}
            className="inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:pointer-events-none disabled:opacity-50 border border-border text-text bg-transparent hover:bg-panel/50 active:bg-panel/70 h-10 px-4 text-sm"
          >
            Request access
          </button>
        </div>
      </div>
    );
  }

  if (fileId === "strategy-liq-protect") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={loadingStates[0]} value="CONTENT VIEWPORT // LIQUIDATION_PROTECT" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={loadingStates[1]} value="PRIVATE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={loadingStates[2]} value="LIQUIDATION PROTECTION" mode="text" />
          </h2>
          <ul className="space-y-1 text-sm font-mono text-text/80 list-disc list-inside">
            <li>Margin-aware defense layer</li>
            <li>Risk regime monitoring</li>
            <li>Not deployed / not accessible</li>
          </ul>
        </div>

        <div className="pt-1 border-t border-border/30">
          <button
            onClick={() => setHash("access-contact")}
            className="inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:pointer-events-none disabled:opacity-50 border border-border text-text bg-transparent hover:bg-panel/50 active:bg-panel/70 h-10 px-4 text-sm"
          >
            Request access
          </button>
        </div>
      </div>
    );
  }

  if (fileId === "system-myrmidons") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={loadingStates[0]} value="CONTENT VIEWPORT // WHAT_IS_MYRMIDONS" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={loadingStates[1]} value="SYSTEM FILE" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={loadingStates[2]} value="WHAT IS MYRMIDONS" mode="text" />
          </h2>
          <ul className="space-y-1 text-sm font-mono text-text/80 list-disc list-inside">
            <li>Algorithmic strategies executed onchain</li>
            <li>Policy-driven allocation and trading logic</li>
            <li>Non-custodial vault integrations (Morpho)</li>
            <li>Some strategies public, others private/internal</li>
          </ul>
        </div>
      </div>
    );
  }

  if (fileId === "system-how-it-works") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={loadingStates[0]} value="CONTENT VIEWPORT // HOW_IT_WORKS" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={loadingStates[1]} value="SYSTEM FILE" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={loadingStates[2]} value="HOW IT WORKS" mode="text" />
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="space-y-2">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">OBSERVE</div>
              <ul className="space-y-1 text-xs font-mono text-text/70 list-disc list-inside">
                <li>APY</li>
                <li>Utilization</li>
                <li>Exit liquidity</li>
                <li>Risk thresholds</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">DECIDE</div>
              <ul className="space-y-1 text-xs font-mono text-text/70 list-disc list-inside">
                <li>Regime detection</li>
                <li>Constraints</li>
                <li>Concentration caps</li>
                <li>Safety filters</li>
              </ul>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">EXECUTE</div>
              <ul className="space-y-1 text-xs font-mono text-text/70 list-disc list-inside">
                <li>Onchain loop</li>
                <li>Thresholds</li>
                <li>Health checks</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (fileId === "access-contact") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={loadingStates[0]} value="CONTENT VIEWPORT // CONTACT_REQUEST_ACCESS" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={loadingStates[1]} value="ACCESS" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={loadingStates[2]} value="CONTACT / REQUEST ACCESS" mode="text" />
          </h2>
          <p className="text-sm font-mono text-text/80">
            <GlitchTypeText key={`${fileId}-desc`} loading={loadingStates[3]} value="For private strategies or custom deployments, contact Myrmidons." mode="text" />
          </p>
          <div className="space-y-2 pt-1 border-t border-border/30">
            <div className="text-xs font-mono text-text/70">X / Twitter: —</div>
            <div className="text-xs font-mono text-text/70">Email: —</div>
            <div className="text-xs font-mono text-text/70">Telegram: —</div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function Home() {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [blinkingShardId, setBlinkingShardId] = useState<string | null>(null);

  useEffect(() => {
    const initialFileId = parseHash();
    setSelectedFileId(initialFileId);

    const handleHashChange = () => {
      const fileId = parseHash();
      setSelectedFileId(fileId);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handleFileClick = (fileId: string) => {
    setSelectedFileId(fileId);
    setHash(fileId);
    // Trigger double-blink feedback
    setBlinkingShardId(fileId);
    setTimeout(() => setBlinkingShardId(null), 1000); // Clear after animation completes
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shard-double-glow {
          0% { 
            filter: none;
          }
          12.5% { 
            filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent))
                    drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent))
                    drop-shadow(0 0 20px color-mix(in oklab, var(--border) 60%, transparent))
                    drop-shadow(0 0 30px color-mix(in oklab, var(--border) 40%, transparent));
          }
          25% { 
            filter: none;
          }
          37.5% { 
            filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent))
                    drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent))
                    drop-shadow(0 0 20px color-mix(in oklab, var(--border) 60%, transparent))
                    drop-shadow(0 0 30px color-mix(in oklab, var(--border) 40%, transparent));
          }
          50% { 
            filter: none;
          }
          50.01%, 100% { 
            filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent))
                    drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent))
                    drop-shadow(0 0 20px color-mix(in oklab, var(--border) 60%, transparent))
                    drop-shadow(0 0 30px color-mix(in oklab, var(--border) 40%, transparent));
          }
        }
        .shard-blink.shard-selected svg {
          animation: shard-double-glow 1000ms ease-in-out forwards;
        }
        .shard-blink:not(.shard-selected) svg {
          animation: shard-double-glow 1000ms ease-in-out;
        }
        .shard-selected:not(.shard-blink) svg {
          filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent))
                  drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent))
                  drop-shadow(0 0 20px color-mix(in oklab, var(--border) 60%, transparent))
                  drop-shadow(0 0 30px color-mix(in oklab, var(--border) 40%, transparent));
        }
        @media (prefers-reduced-motion: reduce) {
          .shard-blink svg {
            animation: none;
          }
          .shard-selected:not(.shard-blink) svg {
            filter: none;
          }
        }
      `}} />
      <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-12 border-l border-t border-border bg-bg-base">
          {/* Left Panel: SYSTEM INDEX */}
          <GridPanel title="SYSTEM INDEX" className="col-span-12 lg:col-span-4 border-r border-b border-border">
            <div className="p-4 space-y-6">
              {fileGroups.map((group) => {
                const numFiles = group.files.length;
                
                // Dynamic spread calculation: more files = more spread
                // Base offsets per file, scaled by group size
                // Target: spread from bottom-left to top-right across the container
                const baseHorizontalSpread = 45; // base px per file
                const baseVerticalSpread = 40; // base px per file
                
                // Scale factor: larger groups get proportionally more spread
                // Minimum 1.0x, increases with more files
                const scaleFactor = 1 + (numFiles - 1) * 0.15;
                
                const DX = baseHorizontalSpread * scaleFactor; // px - move right
                const DY = -baseVerticalSpread * scaleFactor; // px - move up
                
                // Calculate stack stage height
                const HEADER_CLEARANCE = 18; // px (buffer under header)
                const maxUp = (numFiles - 1) * Math.abs(DY); // maximum upward translation
                const CARD_H = parseInt(SHARD_HEIGHT, 10); // shard height in px (from SHARD_HEIGHT)
                const stageMinHeight = CARD_H + maxUp + HEADER_CLEARANCE;
                
                return (
                  <div key={group.name} className="space-y-0">
                    {/* Header rail (non-overlapped) */}
                    <div className="relative z-20 py-2">
                      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono pb-1 border-b border-border/30">
                        {group.name}
                      </div>
                    </div>
                    
                    {/* Stack stage (where shards live) */}
                    <div className="relative" style={{ minHeight: stageMinHeight, paddingTop: HEADER_CLEARANCE }}>
                      {group.files.map((file, index) => {
                        const isSelected = selectedFileId === file.id;
                        
                        // Bottom-left shard is foremost (reverse z-index)
                        const zIndex = (numFiles - index) * 10;
                        
                        // Start from bottom: first shard (index 0) at bottom, each subsequent shard moves up and right
                        const totalOffsetY = index * Math.abs(DY);
                        const offsetX = index * DX;
                        
                        const isBlinking = blinkingShardId === file.id;
                        return (
                          <div
                            key={file.id}
                            className={cn("absolute", isBlinking && "shard-blink", isSelected && "shard-selected")}
                            style={{
                              bottom: 0,
                              left: 0,
                              transform: `translate(${offsetX}px, -${totalOffsetY}px)`,
                              width: "50%",
                              zIndex: zIndex,
                            }}
                          >
                            <ShardEntry
                              file={file}
                              isSelected={isSelected}
                              onClick={() => handleFileClick(file.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </GridPanel>

          {/* Right Panel: CONTENT VIEWPORT */}
          <GridPanel title="CONTENT VIEWPORT" className="col-span-12 lg:col-span-8 border-r border-b border-border">
            <div className="p-4">
              {selectedFileId ? (
                <FileScreen fileId={selectedFileId} />
              ) : (
                <EmptyState />
              )}
            </div>
          </GridPanel>
        </div>
      </div>
    </div>
    </>
  );
}
