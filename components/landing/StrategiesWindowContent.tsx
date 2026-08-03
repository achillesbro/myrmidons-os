"use client";

import { GridPanel } from "@/components/ui/grid-panel";
import { ShardSvg, getSignalMarks, SHARD_HEIGHT, SHARD_HEIGHT_STACKED, BRACKET_CLIP_PATH, CELL_CLIP_PATH, CELL_CLIP_PATH_RELATIVE } from "@/components/ui/shard-svg";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { StatusIndicator } from "@/components/ui/status-indicator";
import {
  USDT0_VAULT_ADDRESS,
  USDT0_VAULT_CHAIN_ID,
  HEGEMON_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_ADDRESS,
} from "@/lib/constants/vaults";
import { useVaultMetadata, useVaultAllocations, useVaultApy, useVaultMarkets } from "@/lib/morpho/queries";
import { pickKpis, pickAllocations } from "@/lib/morpho/view";
import { computeMarketDecisions } from "@/lib/strategy/adaptiveCurve";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  paneGroups,
  labelsForId,
  type PaneFileItem,
  type PaneFileGroup,
} from "@/lib/landing/filesystem";
import { Button } from "@/components/ui/button";
import { GridKpi } from "@/components/ui/grid-kpi";
import { LastReallocKpiCard } from "@/lib/logs/last-realloc-context";

// The index tree comes from the landing page's virtual filesystem — the
// single source of truth for pane indexes AND CLI navigation. Add entries in
// lib/landing/filesystem.ts, not here.
type FileItem = PaneFileItem;

const fileGroups: PaneFileGroup[] = paneGroups("strategies");

const allFileIds = new Set(fileGroups.flatMap((group) => group.files.map((file) => file.id)));

function parseHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  const match = hash.match(/file=(.+)/);
    if (match) {
    const fileId = decodeURIComponent(match[1]);
    // Backward compatibility: migrate old hash to new id
    if (fileId === "strategy-dex-arb" || fileId === "strategy-exec-slot") {
      return "strategy-usdt0";
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

// Tile labels come from the shared filesystem — the CLI name IS the label.
const getFileLabels = labelsForId;

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
  const isOffline = file.status === "OFFLINE";

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
        className="absolute inset-0 pointer-events-none opacity-20 crt-local-scanlines crt-scanlines-animate"
        style={{ clipPath: BRACKET_CLIP_PATH }}
      />
      
      {/* Scanline overlay for cell */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20 crt-local-scanlines crt-scanlines-animate"
        style={{ clipPath: CELL_CLIP_PATH }}
      />

      <ShardSvg fileId={file.id} isSelected={isSelected} />

      {/* Rolling band on top so it’s visible */}
      <div className="crt-roll-band opacity-[0.35] relative z-10" />

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
                : isOffline
                ? "bg-danger"
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
                : isOffline
                ? {
                    boxShadow:
                      "0 0 6px color-mix(in oklab, var(--danger) 55%, transparent), 0 0 12px color-mix(in oklab, var(--danger) 30%, transparent)",
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
          TIP: Start with MYRMIDONS_USDT0 // VAULT_V2.
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

  // Fetch vault data for Morpho reallocators (hooks must be called unconditionally)
  // Both V2 vaults are run by the same HEGEMON_V2 bot; tiles differ only in
  // vault address / route / asset label.
  const v2Meta =
    fileId === "strategy-usdt0-v2"
      ? { vaultAddress: HEGEMON_V2_VAULT_ADDRESS, path: "/vaults/usdt0-v2", asset: "USDT0" }
      : fileId === "strategy-usdc-v2"
      ? { vaultAddress: USDC_V2_VAULT_ADDRESS, path: "/vaults/usdc-v2", asset: "USDC" }
      : null;
  const isV2Strategy = v2Meta != null;
  const shouldFetchMorphoData = fileId === "strategy-usdt0" || isV2Strategy;
  const vaultAddress = !shouldFetchMorphoData
    ? ""
    : v2Meta
    ? v2Meta.vaultAddress
    : USDT0_VAULT_ADDRESS;
  const metadataQuery = useVaultMetadata(vaultAddress, USDT0_VAULT_CHAIN_ID, isV2Strategy);
  const apyQuery = useVaultApy(vaultAddress, USDT0_VAULT_CHAIN_ID, isV2Strategy);
  const allocationsQuery = useVaultAllocations(vaultAddress, USDT0_VAULT_CHAIN_ID, isV2Strategy);
  const marketsQuery = useVaultMarkets(vaultAddress, USDT0_VAULT_CHAIN_ID, isV2Strategy);

  const file = getFileById(fileId);
  
  if (!file) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-dim font-mono text-sm">CONTENT_UNAVAILABLE</div>
      </div>
    );
  }

  if (fileId === "strategy-usdt0" || isV2Strategy) {
    const isV2 = isV2Strategy;
    const vaultPath = v2Meta?.path ?? "/vaults/usdt0";
    const assetLabel = v2Meta?.asset ?? "USDT0";
    const kpis = pickKpis(
      metadataQuery.data ?? null,
      apyQuery.data ?? null,
      allocationsQuery.data ?? null
    );
    const allocations = pickAllocations(
      (allocationsQuery.data ?? null) as Parameters<typeof pickAllocations>[0]
    );
    const activeMarketCount = allocations.filter((a) => a.market !== "USD₮0").length;

    const marketDecisions = marketsQuery.data?.markets
      ? computeMarketDecisions(marketsQuery.data.markets)
      : [];
    const weightedUtilization = (() => {
      if (marketDecisions.length === 0) return null;
      let totalWeight = 0;
      let weightedSum = 0;
      const utils: number[] = [];
      marketDecisions.forEach((decision) => {
        if (decision.u !== null) utils.push(decision.u);
        if (decision.u !== null && decision.currentAllocationPct !== null) {
          const weight = decision.currentAllocationPct / 100;
          weightedSum += decision.u * weight;
          totalWeight += weight;
        }
      });
      if (totalWeight > 0) return weightedSum / totalWeight;
      if (utils.length > 0) return utils.reduce((a, b) => a + b, 0) / utils.length;
      return null;
    })();

    const isDataLoading =
      metadataQuery.isLoading || apyQuery.isLoading || allocationsQuery.isLoading || marketsQuery.isLoading;

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
              <GlitchTypeText key={`${fileId}-header`} loading={!revealEnabled || loadingStates[0]} value={isV2 ? `CONTENT_VIEWPORT // MYRMIDONS_${assetLabel}` : "CONTENT_VIEWPORT // HEGEMON"} mode="text" />
            </div>
            <StatusIndicator status={isV2 ? "dev" : "offline"} />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value={isV2 ? "STRATEGY IN DEVELOPMENT" : "OFFLINE — DEPRECATED"} mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value={isV2 ? `MYRMIDONS_${assetLabel} — MORPHO_VAULT_V2` : "HEGEMON — MORPHO_REALLOCATOR"} mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-desc1`} loading={!revealEnabled || loadingStates[3]} value={isV2 ? "Reallocated by HEGEMON_V2 — the next-generation allocator program on Morpho Vault V2: IRM-aware scoring, liquidity-adapter rotation, delta-based atomic reallocations." : "This V1 vault is being deprecated: the keeper is offline and no further reallocations will occur."} mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-desc2`} loading={!revealEnabled || loadingStates[4]} value={isV2 ? "Currently in test phase with a seed deposit. Deposits are open but unaudited — size accordingly." : "Existing depositors can still withdraw. New capital should use HEGEMON_V2."} mode="text" />
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
            label="Utilisation"
            value={
              <GlitchTypeText
                key={`${fileId}-kpi3`}
                loading={!revealEnabled || loadingStates[7] || isDataLoading}
                value={
                  weightedUtilization !== null
                    ? `${(weightedUtilization * 100).toFixed(2)}%`
                    : (kpis.utilizationPct ?? "—")
                }
                mode="text"
              />
            }
            subValue={
              activeMarketCount > 0 ? (
                <span className="text-text-dim font-mono text-[10px]">
                  <GlitchTypeText
                    loading={false}
                    value={weightedUtilization !== null ? "WEIGHTED BY ALLOCATION ACROSS " : "AVERAGE ACROSS "}
                    mode="text"
                  />
                  <span className="text-gold">
                    <GlitchTypeText loading={false} value={activeMarketCount} mode="number" />
                  </span>
                  <GlitchTypeText loading={false} value=" MARKETS" mode="text" />
                </span>
              ) : undefined
            }
            accent="default"
            className="border-r border-b border-border"
          />
          {isV2 ? (
            <GridKpi
              label="Phase"
              value={
                <GlitchTypeText
                  key={`${fileId}-kpi4`}
                  loading={!revealEnabled || loadingStates[8]}
                  value="TEST"
                  mode="text"
                />
              }
              accent="default"
              className="border-r border-b border-border"
            />
          ) : (
            <LastReallocKpiCard
              className="border-r border-b border-border"
              loading={!revealEnabled || loadingStates[8] || isDataLoading}
            />
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border/30">
          <Link href={vaultPath}>
            <Button variant="gold" size="md" className="w-full sm:w-auto">
              DEPOSIT {assetLabel}
            </Button>
          </Link>
          <Link href={`${vaultPath}#strategy`}>
            <Button variant="outline" size="md" className="w-full sm:w-auto">
              VIEW VAULT STRATEGY
            </Button>
          </Link>
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
            <StatusIndicator status="offline" />
          </div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key={`${fileId}-label`} loading={!revealEnabled || loadingStates[1]} value="PRIVATE STRATEGY" mode="text" />
          </div>
          <h2 className="text-lg font-semibold uppercase tracking-wide">
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="EREBUS — LIQUIDATION_ENGINE" mode="text" />
          </h2>
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[3]} value="Liquidation execution engine for lending protocols — currently offline for maintenance." mode="text" />
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
          <a href="mailto:contact@myrmidons-strategies.com">
            <Button variant="outline" size="md" className="w-full sm:w-auto">
              CONTACT
            </Button>
          </a>
        </div>
      </div>
    );
  }
  return null;
}

export interface StrategiesWindowContentProps {
  /** Echo a tile click into the terminal log as its `open <name>` command. */
  onCliEcho?: (fileId: string) => void;
}

export default function StrategiesWindowContent({ onCliEcho }: StrategiesWindowContentProps = {}) {
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
    // Echo the click into the terminal as its CLI command (clicks and typed
    // commands are the same navigation system; the log records both).
    if (fileId !== selectedFileId) onCliEcho?.(fileId);
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
                  
                  {/* Stack stage: vertical stack, top = HEGEMON, then EREBUS */}
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
