"use client";

import { GridPanel } from "@/components/ui/grid-panel";
import { ShardSvg, getSignalMarks, SHARD_HEIGHT, SHARD_HEIGHT_STACKED, BRACKET_CLIP_PATH, CELL_CLIP_PATH, CELL_CLIP_PATH_RELATIVE } from "@/components/ui/shard-svg";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID } from "@/lib/constants/vaults";
import { useVaultMetadata, useVaultAllocations, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis } from "@/lib/morpho/view";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { GridKpi } from "@/components/ui/grid-kpi";

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
        id: "strategy-liq-protect",
        title: "Liquidation Execution",
        status: "ACTIVE",
        access: "Private",
      },
      {
        id: "strategy-exec-slot",
        title: "Execution Strategy",
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
    let fileId = decodeURIComponent(match[1]);
    // Backward compatibility: migrate old hash to new id
    if (fileId === "strategy-dex-arb") {
      fileId = "strategy-exec-slot";
    }
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

function getFileLabels(fileId: string): { primary: string; secondary?: string } {
  const map: Record<string, { primary: string; secondary?: string }> = {
    "strategy-usdt0": { primary: "HEGEMON", secondary: "VAULT_REALLOCATOR" },
    "strategy-liq-protect": { primary: "EREBUS", secondary: "LIQUIDATION_ENGINE" },
    "strategy-exec-slot": { primary: "ATLAS", secondary: "EXECUTION_STRATEGY" },
    "system-myrmidons": { primary: "WHAT_IS_MYRMIDONS" },
    "system-how-it-works": { primary: "HOW_IT_WORKS" },
    "access-contact": { primary: "CONTACT_REQUEST_ACCESS" },
  };
  return map[fileId] ?? { primary: fileId.toUpperCase() };
}

function ShardEntry({
  file,
  isSelected,
  onClick,
  height = SHARD_HEIGHT,
}: {
  file: FileItem;
  isSelected: boolean;
  onClick: () => void;
  height?: string;
}) {
  const labels = getFileLabels(file.id);
  const isLive = file.status === "ACTIVE";
  const isDev = file.status === "IN DEVELOPMENT";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full text-left font-mono transition-all duration-300 cursor-pointer",
        "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
        isSelected ? "-translate-y-2 z-10" : "hover:-translate-y-2 hover:z-10"
      )}
      style={{
        height,
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
          <div className="flex items-center gap-2 min-w-0 border-b border-border/10 pb-1.5 pr-8">
            <div className="w-0.5 h-2.5 bg-gold shrink-0"></div>
            <span className="text-[9px] font-bold uppercase tracking-widest text-text font-mono leading-tight">{labels.primary}</span>
          </div>
          {labels.secondary && (
            <div className="pt-1.5 pr-8 min-w-0 overflow-hidden">
              <span className="text-[8px] font-bold uppercase tracking-widest text-text font-mono leading-tight whitespace-nowrap overflow-hidden text-ellipsis block">{labels.secondary}</span>
            </div>
          )}
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
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="space-y-3">
        <div className="text-lg font-bold uppercase tracking-widest text-text font-mono">
          NO_SHARD_SLOTTED
        </div>
        <div className="text-sm text-text-dim font-mono">
          Select a shard from SYSTEM_INDEX.
        </div>
        <div className="text-xs text-text-dim/60 font-mono pt-2">
          TIP: Start with HEGEMON // VAULT_REALLOCATOR.
        </div>
      </div>
    </div>
  );
}

function useStaggeredReveal(fileId: string | null, count: number, baseDelay: number = 150, enabled: boolean = true) {
  const [loadingStates, setLoadingStates] = useState<boolean[]>(Array(count).fill(true));
  const fileIdRef = useRef<string | null>(null);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);
  
  useEffect(() => {
    // Clear any pending timeouts when fileId changes or enabled changes
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    
    if (fileIdRef.current !== fileId) {
      fileIdRef.current = fileId;
      // Reset all to loading
      setLoadingStates(Array(count).fill(true));
    }
    
    // Only start timers if enabled
    if (enabled) {
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
    } else {
      // While disabled, keep all in loading state
      setLoadingStates(Array(count).fill(true));
    }
    
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      timeoutRefs.current = [];
    };
  }, [fileId, count, baseDelay, enabled]);
  
  return loadingStates;
}

function FileScreen({ fileId, revealEnabled }: { fileId: string; revealEnabled: boolean }) {
  // ALL HOOKS MUST BE CALLED UNCONDITIONALLY BEFORE ANY EARLY RETURNS
  const loadingStates = useStaggeredReveal(fileId, 25, 150, revealEnabled);

  // Fetch vault data for Morpho reallocator (hooks must be called unconditionally)
  const shouldFetchMorphoData = fileId === "strategy-usdt0";
  const vaultAddress = shouldFetchMorphoData ? USDT0_VAULT_ADDRESS : "";
  const metadataQuery = useVaultMetadata(vaultAddress, USDT0_VAULT_CHAIN_ID);
  const apyQuery = useVaultApy(vaultAddress, USDT0_VAULT_CHAIN_ID);
  const allocationsQuery = useVaultAllocations(vaultAddress, USDT0_VAULT_CHAIN_ID);

  const file = getFileById(fileId);
  
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-dim font-mono text-sm">CONTENT_UNAVAILABLE</div>
      </div>
    );
  }

  if (fileId === "strategy-usdt0") {
    const kpis = pickKpis(
      metadataQuery.data ?? null,
      apyQuery.data ?? null,
      allocationsQuery.data ?? null
    );

    const isDataLoading =
      metadataQuery.isLoading || apyQuery.isLoading || allocationsQuery.isLoading;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // HEGEMON" mode="text" />
            </div>
            <StatusIndicator status="live" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="LIVE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="HEGEMON — VAULT_REALLOCATOR" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-desc1`} loading={!revealEnabled || loadingStates[3]} value="Adaptive allocator that rebalances across Morpho markets based on yield, utilization, and exit safety." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-desc2`} loading={!revealEnabled || loadingStates[4]} value="Optimizes net APY while enforcing risk and concentration limits." mode="text" />
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 border-l border-t border-border bg-bg-base">
          <GridKpi
            label="TVL"
            value={
              <GlitchTypeText
                key={`${fileId}-kpi1`}
                loading={!revealEnabled || loadingStates[5] || isDataLoading}
                value={kpis.tvlUsd ?? "—"}
                mode="text"
              />
            }
            accent="default"
            className="border-r border-b border-border"
          />
          <GridKpi
            label="Net APY"
            value={
              <GlitchTypeText
                key={`${fileId}-kpi2`}
                loading={!revealEnabled || loadingStates[6] || isDataLoading}
                value={kpis.netApyPct ?? "—"}
                mode="text"
              />
            }
            accent="gold"
            cornerIndicator="gold"
            className="border-r border-b border-border"
          />
          <GridKpi
            label="Utilization"
            value={
              <GlitchTypeText
                key={`${fileId}-kpi3`}
                loading={!revealEnabled || loadingStates[7] || isDataLoading}
                value={kpis.utilizationPct ?? "—"}
                mode="text"
              />
            }
            accent="default"
            className="border-r border-b border-border"
          />
          <GridKpi
            label="Risk Factor"
            value={
              <GlitchTypeText
                key={`${fileId}-kpi4`}
                loading={!revealEnabled || loadingStates[8] || isDataLoading}
                value={kpis.riskScore ?? "—"}
                mode="text"
              />
            }
            accent="default"
            className="border-r border-b border-border"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border/30">
          <Link href="/vaults/usdt0">
            <Button variant="gold" size="md" className="w-full sm:w-auto">
              DEPOSIT USDT0
            </Button>
          </Link>
          <Link href="/vaults/usdt0#strategy">
            <Button variant="outline" size="md" className="w-full sm:w-auto">
              VIEW VAULT STRATEGY
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (fileId === "strategy-exec-slot") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // ATLAS" mode="text" />
            </div>
            <div className="inline-flex items-center gap-1.5 px-2 py-1 border border-gold rounded bg-gold/20 glow-border-gold">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-gold animate-pulse-slow" style={{ boxShadow: "0 0 6px color-mix(in oklab, var(--gold) 55%, transparent), 0 0 12px color-mix(in oklab, var(--gold) 30%, transparent)" }} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-gold">IN DEV</span>
            </div>
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="PRIVATE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="ATLAS — EXECUTION_STRATEGY" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[3]} value="Reserved strategy slot for future MYRMIDONS execution engines." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p2`} loading={!revealEnabled || loadingStates[4]} value="Used to develop, evaluate, and stage new strategies before live deployment." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p3`} loading={!revealEnabled || loadingStates[5]} value="Only strategies that meet defined risk, reliability, and performance thresholds are promoted to production." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p4`} loading={!revealEnabled || loadingStates[6]} value="Details remain private until activation." mode="text" />
            </p>
          </div>
        </div>

        <div className="pt-1 border-t border-border/30">
          <button
            onClick={() => setHash("access-contact")}
            className="inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border disabled:pointer-events-none disabled:opacity-50 border border-border text-text bg-transparent hover:bg-panel/50 active:bg-panel/70 h-10 px-4 text-sm"
          >
            CONTACT
          </button>
        </div>
      </div>
    );
  }

  if (fileId === "strategy-liq-protect") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // EREBUS" mode="text" />
            </div>
            <StatusIndicator status="live" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="PRIVATE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="EREBUS — LIQUIDATION_ENGINE" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[3]} value="Live liquidation execution engine for lending protocols." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p2`} loading={!revealEnabled || loadingStates[4]} value="Executes forced position unwinds atomically using flash liquidity sourcing and deterministic settlement." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p3`} loading={!revealEnabled || loadingStates[5]} value="Designed to run under strict guardrails (oracle sanity checks, slippage caps, revert-on-constraint failure) and emit structured execution logs." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p4`} loading={!revealEnabled || loadingStates[6]} value="Access is internal. For integrations or partnership discussions, request access." mode="text" />
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border/30">
          <Link href="/modules/liquidation">
            <Button variant="outline" size="md" className="w-full sm:w-auto">
              VIEW STRATEGY
            </Button>
          </Link>
          <Button variant="outline" size="md" className="w-full sm:w-auto" onClick={() => setHash("access-contact")}>
            CONTACT
          </Button>
        </div>
      </div>
    );
  }

  if (fileId === "system-myrmidons") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // WHAT_IS_MYRMIDONS" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="SYSTEM FILE" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="WHAT IS MYRMIDONS" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[3]} value="MYRMIDONS ALGORITHMIC STRATEGIES is a collection of onchain trading and allocation algorithms." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p2`} loading={!revealEnabled || loadingStates[4]} value="Each strategy executes policy-driven logic, not discretionary decisions." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p3`} loading={!revealEnabled || loadingStates[5]} value="Public strategies run on non-custodial infrastructure (e.g. ERC-4626 vaults). Users can enter and exit autonomously." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p4`} loading={!revealEnabled || loadingStates[6]} value="Some strategies are private or internal. Access conditions are always explicitly stated." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p5`} loading={!revealEnabled || loadingStates[7]} value="Two strategies are currently live. Others are in active development." mode="text" />
            </p>
          </div>
          <div className="pt-2 border-t border-text/30 w-full"></div>
        </div>
      </div>
    );
  }

  if (fileId === "system-how-it-works") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // HOW_IT_WORKS" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="SYSTEM FILE" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="HOW IT WORKS" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-intro`} loading={!revealEnabled || loadingStates[3]} value="All strategies follow the same execution loop." mode="text" />
            </p>
          </div>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">
                <GlitchTypeText key={`${fileId}-observe-header`} loading={!revealEnabled || loadingStates[4]} value="OBSERVE" mode="text" />
              </div>
              <p className="text-sm font-mono text-text/80">
                <GlitchTypeText key={`${fileId}-observe-desc`} loading={!revealEnabled || loadingStates[5]} value="Yield, utilization, exit liquidity, risk limits." mode="text" />
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">
                <GlitchTypeText key={`${fileId}-decide-header`} loading={!revealEnabled || loadingStates[6]} value="DECIDE" mode="text" />
              </div>
              <p className="text-sm font-mono text-text/80">
                <GlitchTypeText key={`${fileId}-decide-desc`} loading={!revealEnabled || loadingStates[7]} value="Regime detection, constraints, concentration caps, safety filters." mode="text" />
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">
                <GlitchTypeText key={`${fileId}-execute-header`} loading={!revealEnabled || loadingStates[8]} value="EXECUTE" mode="text" />
              </div>
              <p className="text-sm font-mono text-text/80">
                <GlitchTypeText key={`${fileId}-execute-desc`} loading={!revealEnabled || loadingStates[9]} value="Automated onchain execution with thresholds and health checks." mode="text" />
              </p>
            </div>
          </div>
          <div className="space-y-1 text-sm font-mono text-text/80 pt-2">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[10]} value="Public strategies allow one-click deposits and exits via the underlying infrastructure. Private or developing strategies require explicit access." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p2`} loading={!revealEnabled || loadingStates[11]} value="Strategy logic and parameters are documented on each strategy's page. Additional access can be requested via CONTACT / REQUEST ACCESS." mode="text" />
            </p>
          </div>
          <div className="pt-2 border-t border-text/30 w-full"></div>
        </div>
      </div>
    );
  }

  if (fileId === "access-contact") {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // CONTACT_REQUEST_ACCESS" mode="text" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="ACCESS" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="CONTACT / REQUEST ACCESS" mode="text" />
          </h2>
          <p className="text-sm font-mono text-text/80">
            <GlitchTypeText key={`${fileId}-desc`} loading={!revealEnabled || loadingStates[3]} value="For private strategies, custom deployments or simply more information, contact Myrmidons." mode="text" />
          </p>
          <div className="space-y-2 pt-1 border-t border-border/30">
            <div className="text-xs font-mono text-text/70">
              <a
                href="https://x.com/myrmidons_strat"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text transition-colors"
              >
                <GlitchTypeText key={`${fileId}-contact-1`} loading={!revealEnabled || loadingStates[4]} value="X / Twitter: @myrmidons_strat" mode="text" />
              </a>
            </div>
            <div className="text-xs font-mono text-text/70">
              <a
                href="mailto:contact@myrmidons-strategies.com"
                className="hover:text-text transition-colors"
              >
                <GlitchTypeText key={`${fileId}-contact-2`} loading={!revealEnabled || loadingStates[5]} value="Email: contact@myrmidons-strategies.com" mode="text" />
              </a>
            </div>
            <div className="text-xs font-mono text-text/70">
              <a
                href="https://t.me/ZeroXAchilles"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text transition-colors"
              >
                <GlitchTypeText key={`${fileId}-contact-3`} loading={!revealEnabled || loadingStates[6]} value="Telegram: @ZeroXAchilles" mode="text" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function StrategiesWindowContent() {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [blinkingShardId, setBlinkingShardId] = useState<string | null>(null);
  const [contentReady, setContentReady] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showBootScreen, setShowBootScreen] = useState<boolean>(false);
  const prevSelectedFileIdRef = useRef<string | null>(null);

  // Strategies boot effect - plays every time window opens
  // Duration matches window expansion (1000ms) so boot screen is visible during expansion
  useEffect(() => {
    setShowBootScreen(true);
    const timer = setTimeout(() => {
      setShowBootScreen(false);
    }, 1000); // Match window expansion duration
    return () => clearTimeout(timer);
  }, []);

  // Handle hash changes (but don't initialize from hash on mount - start fresh each time)
  useEffect(() => {
    const handleHashChange = () => {
      const fileId = parseHash();
      setSelectedFileId(fileId);
      if (!fileId) {
        setIsOpen(false);
        setContentReady(false);
        prevSelectedFileIdRef.current = null;
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Handle file selection changes and animation state
  useEffect(() => {
    if (!selectedFileId) {
      setIsOpen(false);
      setContentReady(false);
      prevSelectedFileIdRef.current = null;
      return;
    }

    const isSwitchingShards = prevSelectedFileIdRef.current !== selectedFileId && prevSelectedFileIdRef.current !== null;

    if (isSwitchingShards) {
      setContentReady(false);
      const timer = setTimeout(() => {
        setContentReady(true);
      }, 150);
      prevSelectedFileIdRef.current = selectedFileId;
      return () => clearTimeout(timer);
    } else {
      setIsOpen(false);
      setContentReady(false);
      const openTimer = setTimeout(() => {
        setIsOpen(true);
      }, 10);
      const contentTimer = setTimeout(() => {
        setContentReady(true);
      }, 150);
      prevSelectedFileIdRef.current = selectedFileId;
      return () => {
        clearTimeout(openTimer);
        clearTimeout(contentTimer);
      };
    }
  }, [selectedFileId]);

  const handleFileClick = (fileId: string) => {
    setSelectedFileId(fileId);
    setHash(fileId);
    setBlinkingShardId(fileId);
    setTimeout(() => setBlinkingShardId(null), 1000);
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
        @keyframes shard-double-blink {
          0% { 
            opacity: 1;
          }
          12.5% { 
            opacity: 0.7;
          }
          25% { 
            opacity: 1;
          }
          37.5% { 
            opacity: 0.7;
          }
          50% { 
            opacity: 1;
          }
          50.01%, 100% { 
            opacity: 1;
          }
        }
        .shard-blink.shard-selected {
          animation: shard-double-blink 1000ms ease-in-out forwards;
        }
        .shard-blink.shard-selected svg {
          animation: shard-double-glow 1000ms ease-in-out forwards;
        }
        .shard-blink:not(.shard-selected) {
          animation: shard-double-blink 1000ms ease-in-out;
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
          .shard-blink {
            animation: none;
            opacity: 1;
          }
          .shard-blink svg {
            animation: none;
          }
          .shard-selected:not(.shard-blink) svg {
            filter: none;
          }
        }
      `}} />
      {showBootScreen ? (
        <>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes bootLine {
              0% {
                opacity: 0;
                transform: translateX(-100%);
              }
              20% {
                opacity: 0.6;
              }
              50% {
                opacity: 0.8;
              }
              80% {
                opacity: 0.6;
              }
              100% {
                opacity: 0;
                transform: translateX(100%);
              }
            }
          `}} />
          <div className="h-full w-full flex items-center justify-center bg-bg-base relative overflow-hidden">
            {/* Terminal-style lines */}
            {Array.from({ length: 40 }).map((_, i) => {
              const duration = 1000;
              return (
                <div
                  key={i}
                  className="absolute left-0 right-0 h-px bg-border"
                  style={{
                    top: `${(i * 100) / 40}%`,
                    opacity: 0.5,
                    animation: `bootLine ${duration}ms ease-out forwards`,
                    animationDelay: `${i * 20}ms`,
                  }}
                />
              );
            })}
            {/* Logo in center with glow effect */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64 md:w-80 md:h-80">
                <Image
                  src="/myrmidons-logo-no-bg.png"
                  alt="MYRMIDONS Logo"
                  width={320}
                  height={320}
                  className="w-full h-full object-contain"
                  priority
                  style={{
                    filter: "brightness(2) drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--gold) 30%, transparent))"
                  }}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="h-full w-full flex overflow-hidden min-h-0">
          {/* Left Panel: SYSTEM_INDEX */}
          <GridPanel title="SYSTEM_INDEX" className="w-full lg:w-1/3 border-r border-b border-border flex flex-col overflow-hidden min-h-0" scrollable>
            <div className="p-4 space-y-6">
              {fileGroups.filter((group) => group.name === "STRATEGIES").map((group) => {
              const HEADER_CLEARANCE = 18;
              const STACKED_SHARD_H = 80;
              const SHARD_GAP = 12; // px between shards
              const stageMinHeight =
                group.files.length * STACKED_SHARD_H +
                (group.files.length - 1) * SHARD_GAP +
                HEADER_CLEARANCE;
              
              return (
                <div key={group.name} className="space-y-0">
                  {/* Header rail (non-overlapped) */}
                  <div className="relative z-20 py-2">
                    <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono pb-1 border-b border-border/30">
                      {group.name}
                    </div>
                  </div>
                  
                  {/* Stack stage: vertical stack, top = HEGEMON, then EREBUS, then ATLAS */}
                  <div
                    className="flex flex-col w-full gap-3"
                    style={{ minHeight: stageMinHeight, paddingTop: HEADER_CLEARANCE }}
                  >
                    {group.files.map((file) => {
                      const isSelected = selectedFileId === file.id;
                      const isBlinking = blinkingShardId === file.id;
                      return (
                        <div
                          key={file.id}
                          className={cn(
                            "w-full shrink-0",
                            isBlinking && "shard-blink",
                            isSelected && "shard-selected"
                          )}
                          style={{ height: STACKED_SHARD_H }}
                        >
                          <ShardEntry
                            file={file}
                            isSelected={isSelected}
                            onClick={() => handleFileClick(file.id)}
                            height={SHARD_HEIGHT_STACKED}
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

        {/* Right Panel: CONTENT_VIEWPORT */}
        <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
          {selectedFileId ? (
            <div
              className={cn(
                "absolute inset-0 will-change-transform",
                isOpen ? "translate-x-0 opacity-100" : "-translate-x-6 opacity-0 pointer-events-none"
              )}
              style={{
                transition: "transform 2000ms cubic-bezier(0.16, 1, 0.3, 1), opacity 1000ms cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <GridPanel title="CONTENT_VIEWPORT" className="h-full border-r border-b border-border overflow-hidden min-h-0 min-w-0">
                <div className="p-4">
                  {contentReady ? (
                    <FileScreen fileId={selectedFileId} revealEnabled={contentReady} />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-text-dim font-mono text-sm">LOADING...</div>
                    </div>
                  )}
                </div>
              </GridPanel>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>
      )}
    </>
  );
}
