"use client";

import { GridPanel } from "@/components/ui/grid-panel";
import { ShardSvg, getSignalMarks, SHARD_HEIGHT_STACKED, BRACKET_CLIP_PATH, CELL_CLIP_PATH, CELL_CLIP_PATH_RELATIVE } from "@/components/ui/shard-svg";
import { GlitchTypeText } from "@/components/ui/animated-text";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { toolsFileGroups, type FileItem } from "./fileGroups";
import { SwapTool } from "./swap/SwapTool";
import { MnemonPaneSummary } from "./mnemon/MnemonPaneSummary";

function parseHash(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.slice(1);
  const match = hash.match(/tool=(.+)/);
  if (match) {
    const toolId = decodeURIComponent(match[1]);
    return toolsFileGroups.some((g) => g.files.some((f) => f.id === toolId)) ? toolId : null;
  }
  return null;
}

function setHash(toolId: string | null) {
  if (typeof window === "undefined") return;
  if (toolId) {
    window.location.hash = `tool=${encodeURIComponent(toolId)}`;
  } else {
    window.location.hash = "";
  }
}

function getFileLabels(fileId: string): { primary: string; secondary?: string } {
  if (fileId === "swap") return { primary: "SWAP" };
  return { primary: fileId.toUpperCase() };
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
  const labels = getFileLabels(file.id);
  const isDev = file.status === "IN DEVELOPMENT";
  const isLive = file.status === "ACTIVE";

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative w-full text-left font-mono transition-all duration-300 cursor-pointer",
        "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
        isSelected ? "-translate-y-2 z-10" : "hover:-translate-y-2 hover:z-10"
      )}
      style={{ height: SHARD_HEIGHT_STACKED }}
    >
      <div className="absolute inset-0 bg-bg-base" style={{ clipPath: BRACKET_CLIP_PATH }} />
      <div className="absolute inset-0 bg-bg-base" style={{ clipPath: CELL_CLIP_PATH }} />
      <div className="absolute inset-0 pointer-events-none opacity-20 crt-local-scanlines crt-scanlines-animate" style={{ clipPath: BRACKET_CLIP_PATH }} />
      <div className="absolute inset-0 pointer-events-none opacity-20 crt-local-scanlines crt-scanlines-animate" style={{ clipPath: CELL_CLIP_PATH }} />
      <ShardSvg fileId={file.id} isSelected={isSelected} />
      <div className="crt-roll-band opacity-[0.35] relative z-10" />
      <div className="absolute top-0 bottom-0 left-[15.79%] right-0" style={{ clipPath: CELL_CLIP_PATH_RELATIVE }}>
        <div className="absolute top-0 left-0 w-full p-3 bg-gradient-to-b from-black/20 to-transparent">
          <div className="flex items-center gap-2 min-w-0 border-b border-border/10 pb-1.5 pr-8">
            <div className="w-0.5 h-2.5 bg-gold shrink-0" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-text font-mono leading-tight">{labels.primary}</span>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-end">
          <div className="flex gap-0.5">{getSignalMarks(file.id)}</div>
        </div>
        <div
          className={cn(
            "absolute top-3 right-3 w-1.5 h-1.5 rounded-full",
            isDev ? "bg-gold animate-pulse-slow" : isLive ? "bg-success" : "bg-text/40"
          )}
          style={isDev ? { boxShadow: "0 0 6px color-mix(in oklab, var(--gold) 55%, transparent), 0 0 12px color-mix(in oklab, var(--gold) 30%, transparent)" } : isLive ? { boxShadow: "0 0 6px color-mix(in oklab, var(--success) 55%, transparent), 0 0 12px color-mix(in oklab, var(--success) 30%, transparent)" } : undefined}
        />
      </div>
    </button>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8">
      <div className="space-y-3">
        <div className="text-lg font-bold uppercase tracking-widest text-text font-mono">NO_SHARD_SLOTTED</div>
        <div className="text-sm text-text-dim font-mono">Select a tool from SYSTEM_INDEX.</div>
        <div className="text-xs text-text-dim/60 font-mono pt-2">TIP: Start with SWAP.</div>
      </div>
    </div>
  );
}

function useStaggeredReveal(fileId: string | null, count: number, baseDelay: number = 150, enabled: boolean = true) {
  const [loadingStates, setLoadingStates] = useState<boolean[]>(Array(count).fill(true));
  const fileIdRef = useRef<string | null>(null);
  const timeoutRefs = useRef<NodeJS.Timeout[]>([]);

  useEffect(() => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    if (fileIdRef.current !== fileId) {
      fileIdRef.current = fileId;
      setLoadingStates(Array(count).fill(true));
    }
    if (enabled) {
      for (let i = 0; i < count; i++) {
        const t = setTimeout(() => {
          setLoadingStates((prev) => {
            const next = [...prev];
            next[i] = false;
            return next;
          });
        }, i * baseDelay);
        timeoutRefs.current.push(t);
      }
    } else {
      setLoadingStates(Array(count).fill(true));
    }
    return () => timeoutRefs.current.forEach(clearTimeout);
  }, [fileId, count, baseDelay, enabled]);
  return loadingStates;
}

function SwapScreen({
  revealEnabled,
  onLog,
}: {
  revealEnabled: boolean;
  onLog?: (line: string) => void;
}) {
  const loadingStates = useStaggeredReveal("swap", 4, 150, revealEnabled);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
            <GlitchTypeText key="swap-header" loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // SWAP" mode="text" />
          </div>
          <div className="inline-flex items-center gap-1.5 px-2 py-1 border border-success rounded bg-success/20">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-success" style={{ boxShadow: "0 0 6px color-mix(in oklab, var(--success) 55%, transparent), 0 0 12px color-mix(in oklab, var(--success) 30%, transparent)" }} />
            <span className="text-[9px] font-bold uppercase tracking-wider text-success">LIVE</span>
          </div>
        </div>
      </div>
      <SwapTool onLog={onLog} />
    </div>
  );
}

function MnemonScreen({ revealEnabled }: { revealEnabled: boolean }) {
  const loadingStates = useStaggeredReveal("mnemon", 2, 150, revealEnabled);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
          <GlitchTypeText key="mnemon-header" loading={!revealEnabled || loadingStates[0]} value="CONTENT_VIEWPORT // MNEMON" mode="text" />
        </div>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 border border-success rounded bg-success/20">
          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-success" style={{ boxShadow: "0 0 6px color-mix(in oklab, var(--success) 55%, transparent), 0 0 12px color-mix(in oklab, var(--success) 30%, transparent)" }} />
          <span className="text-[9px] font-bold uppercase tracking-wider text-success">LIVE</span>
        </div>
      </div>
      <MnemonPaneSummary />
      <Link
        href="/tools/mnemon"
        className="inline-flex items-center gap-2 px-3 py-2 border border-gold text-gold hover:bg-gold/10 font-mono text-[11px] uppercase tracking-widest transition-colors"
      >
        OPEN MNEMON <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

export interface ToolsWindowContentProps {
  onLog?: (line: string) => void;
}

export default function ToolsWindowContent({ onLog }: ToolsWindowContentProps) {
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [blinkingShardId, setBlinkingShardId] = useState<string | null>(null);
  const [contentReady, setContentReady] = useState<boolean>(false);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [showBootScreen, setShowBootScreen] = useState<boolean>(false);
  const prevSelectedFileIdRef = useRef<string | null>(null);

  useEffect(() => {
    setShowBootScreen(true);
    const t = setTimeout(() => setShowBootScreen(false), 1000);
    return () => clearTimeout(t);
  }, []);

  // Sync from hash on mount (e.g. parent set #tool=swap before opening pane) and on hashchange
  useEffect(() => {
    const syncFromHash = () => {
      const toolId = parseHash();
      setSelectedFileId(toolId);
      if (!toolId) {
        setIsOpen(false);
        setContentReady(false);
        prevSelectedFileIdRef.current = null;
      }
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (!selectedFileId) {
      setIsOpen(false);
      setContentReady(false);
      prevSelectedFileIdRef.current = null;
      return;
    }
    const isSwitching = prevSelectedFileIdRef.current !== selectedFileId && prevSelectedFileIdRef.current !== null;
    if (isSwitching) {
      setContentReady(false);
      const t = setTimeout(() => setContentReady(true), 150);
      prevSelectedFileIdRef.current = selectedFileId;
      return () => clearTimeout(t);
    }
    setIsOpen(false);
    setContentReady(false);
    const openT = setTimeout(() => setIsOpen(true), 10);
    const contentT = setTimeout(() => setContentReady(true), 150);
    prevSelectedFileIdRef.current = selectedFileId;
    return () => {
      clearTimeout(openT);
      clearTimeout(contentT);
    };
  }, [selectedFileId]);

  const handleFileClick = (fileId: string) => {
    setSelectedFileId(fileId);
    setHash(fileId);
    setBlinkingShardId(fileId);
    setTimeout(() => setBlinkingShardId(null), 1000);
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes shard-double-glow {
          0% { filter: none; }
          12.5% { filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent)) drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent)); }
          25% { filter: none; }
          37.5% { filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent)) drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent)); }
          50% { filter: none; }
          50.01%, 100% { filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent)) drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent)); }
        }
        @keyframes shard-double-blink {
          0%, 25%, 37.5%, 50%, 100% { opacity: 1; }
          12.5%, 37.5% { opacity: 0.7; }
        }
        .shard-blink.shard-selected { animation: shard-double-blink 1000ms ease-in-out forwards; }
        .shard-blink.shard-selected svg { animation: shard-double-glow 1000ms ease-in-out forwards; }
        .shard-blink:not(.shard-selected) { animation: shard-double-blink 1000ms ease-in-out; }
        .shard-blink:not(.shard-selected) svg { animation: shard-double-glow 1000ms ease-in-out; }
        .shard-selected:not(.shard-blink) svg { filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent)) drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent)); }
        @media (prefers-reduced-motion: reduce) { .shard-blink { animation: none; opacity: 1; } .shard-blink svg { animation: none; } .shard-selected:not(.shard-blink) svg { filter: none; } }
      `,
        }}
      />
      {showBootScreen ? (
        <>
          <style
            dangerouslySetInnerHTML={{
              __html: `
            @keyframes bootLine {
              0% { opacity: 0; transform: translateX(-100%); }
              100% { opacity: 0; transform: translateX(100%); }
            }
          `,
            }}
          />
          <div className="h-full w-full flex items-center justify-center bg-bg-base relative overflow-hidden">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-0 right-0 h-px bg-border"
                style={{
                  top: `${(i * 100) / 40}%`,
                  opacity: 0.5,
                  animation: `bootLine 1000ms ease-out forwards`,
                  animationDelay: `${i * 20}ms`,
                }}
              />
            ))}
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
                    filter: "brightness(2) drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--gold) 30%, transparent))",
                  }}
                />
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="h-full w-full flex overflow-hidden min-h-0">
          <GridPanel title="SYSTEM_INDEX" className="w-full lg:w-1/3 border-r border-b border-border flex flex-col overflow-hidden min-h-0" scrollable>
            <div className="p-4 space-y-6">
              {toolsFileGroups.map((group) => {
                const HEADER_CLEARANCE = 18;
                const STACKED_SHARD_H = 80;
                const SHARD_GAP = 12;
                const stageMinHeight = group.files.length * STACKED_SHARD_H + (group.files.length - 1) * SHARD_GAP + HEADER_CLEARANCE;
                return (
                  <div key={group.name} className="space-y-0">
                    <div className="relative z-20 py-2">
                      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono pb-1 border-b border-border/30">{group.name}</div>
                    </div>
                    <div className="flex flex-col w-full gap-3" style={{ minHeight: stageMinHeight, paddingTop: HEADER_CLEARANCE }}>
                      {group.files.map((file) => {
                        const isSelected = selectedFileId === file.id;
                        const isBlinking = blinkingShardId === file.id;
                        return (
                          <div
                            key={file.id}
                            className={cn("w-full shrink-0", isBlinking && "shard-blink", isSelected && "shard-selected")}
                            style={{ height: STACKED_SHARD_H }}
                          >
                            <ShardEntry file={file} isSelected={isSelected} onClick={() => handleFileClick(file.id)} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </GridPanel>
          <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden">
            {selectedFileId ? (
              <div
                className={cn("absolute inset-0 will-change-transform", isOpen ? "translate-x-0 opacity-100" : "-translate-x-6 opacity-0 pointer-events-none")}
                style={{ transition: "transform 2000ms cubic-bezier(0.16, 1, 0.3, 1), opacity 1000ms cubic-bezier(0.16, 1, 0.3, 1)" }}
              >
                <GridPanel title="CONTENT_VIEWPORT" className="h-full border-r border-b border-border min-h-0 min-w-0" scrollable>
                  <div className="p-4">
                    {contentReady && selectedFileId === "swap" ? (
                      <SwapScreen revealEnabled={contentReady} onLog={onLog} />
                    ) : contentReady && selectedFileId === "mnemon" ? (
                      <MnemonScreen revealEnabled={contentReady} />
                    ) : contentReady ? (
                      <div className="min-h-[12rem] flex items-center justify-center">
                        <div className="text-text-dim font-mono text-sm">CONTENT_UNAVAILABLE</div>
                      </div>
                    ) : (
                      <div className="min-h-[12rem] flex items-center justify-center">
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
