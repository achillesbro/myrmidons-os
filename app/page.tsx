"use client";

import { GridKpi } from "@/components/ui/grid-kpi";
import { Button } from "@/components/ui/button";
import { GlitchTypeText, BlinkCaret } from "@/components/ui/animated-text";
import { PhosphorAfterimage } from "@/components/terminal/PhosphorAfterimage";
import { ActiveLineGlow } from "@/components/terminal/ActiveLineGlow";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID } from "@/lib/constants/vaults";
import { useVaultMetadata, useVaultAllocations, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis, type KpiData } from "@/lib/morpho/view";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useLayoutEffect, useState, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import StrategiesWindowContent from "@/components/landing/StrategiesWindowContent";
import ToolsWindowContent from "@/components/tools/ToolsWindowContent";
import { FolderSvg, FOLDER_CLIP_PATH } from "@/components/ui/folder-svg";
import { useAccount, useBlockNumber, usePublicClient, useChainId, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits } from "viem";
import { useHypePrice } from "@/lib/use-hype-price";
import {
  getVaultAssetAddress,
  readBalances,
  readAssetMeta,
  readVaultDecimals,
} from "@/lib/web3/vault";
import { formatAmount } from "@/lib/web3/format";
import { getBalances, formatBalanceAmount, formatBalanceTable } from "@/lib/liquidswap/balances";
import { LastReallocKpiCard } from "@/lib/logs/last-realloc-context";

/** Terminal entry: output line, user input echo, or link block */
type TerminalOut = { kind: "out"; text: string };
type TerminalIn = { kind: "in"; text: string };
type TerminalLinks = { kind: "links"; items: { label: string; href: string }[] };
type TerminalEntry = TerminalOut | TerminalIn | TerminalLinks;

const INTRO_ENTRIES: TerminalOut[] = [
  { kind: "out", text: "MYRMIDONS // SYSTEM" },
  { kind: "out", text: "Operator environment initialized." },
  { kind: "out", text: "Awaiting user input..." },
  { kind: "out", text: "Type 'help', 'strategies' or 'tools' to continue." },
];

const SOCIALS_LINKS = [
  { href: "https://x.com/myrmidons_strat", label: "X / Twitter: @myrmidons_strat" },
  { href: "https://t.me/ZeroXAchilles", label: "Telegram: @ZeroXAchilles" },
  { href: "mailto:contact@myrmidons-strategies.com", label: "Email: contact@myrmidons-strategies.com" },
];

const SUGGEST_POOL = [
  "open strategies/",
  "status",
  "vault stats",
  "balance",
  "gas",
  "block",
  "whoami",
  "contact",
  "help",
  "manifest",
  "hegemon",
  "erebus",
  "tools",
  "swap",
  "back",
  "pwd",
  "ping",
  "time",
];

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

function getFileById(fileId: string): FileItem | null {
  for (const group of fileGroups) {
    const file = group.files.find((f) => f.id === fileId);
    if (file) return file;
  }
  return null;
}

/** Terms to highlight with text-gold per command (key = normalized command). */
const HIGHLIGHT_TERMS: Record<string, string[]> = {
  help: ["strategies", "tools", "STRATEGIES/", "HEGEMON", "EREBUS", "help", "MYRMIDONS", "socials", "clear", "ls", "status", "whoami", "version", "exit", "contact", "hint"],
  "help strategies": ["strategies", "STRATEGIES/", "hegemon", "erebus", "back", "pwd"],
  "help vault": ["balance", "deposit", "withdraw", "apr", "tvl", "vault stats"],
  "help system": ["status", "network", "block", "gas", "ping", "rpc", "uptime", "time", "version"],
  "help identity": ["whoami", "connect", "disconnect", "permissions"],
  "help lore": ["manifest", "doctrine", "mission", "changelog"],
  "open strategies/": ["STRATEGIES/"],
  hegemon: ["STRATEGIES/", "HEGEMON"],
  morpho: ["STRATEGIES/", "HEGEMON"],
  vault: ["STRATEGIES/", "HEGEMON"],
  erebus: ["STRATEGIES/", "EREBUS"],
  liquidation: ["STRATEGIES/", "EREBUS"],
  "what is myrmidons": ["MYRMIDONS", "OBSERVE", "DECIDE", "EXECUTE", "Public", "CONTACT", "executes"],
  myrmidons: ["MYRMIDONS", "OBSERVE", "DECIDE", "EXECUTE", "Public", "CONTACT", "executes"],
  ls: ["SYSTEM/", "STRATEGIES/", "TOOLS/"],
  dir: ["SYSTEM/", "STRATEGIES/", "TOOLS/"],
  status: ["HyperEVM", "OK", "Strategies"],
  version: ["MYRMIDONS", "v0.1"],
  ver: ["MYRMIDONS", "v0.1"],
  strategies: ["STRATEGIES/"],
  tools: ["TOOLS/", "SWAP"],
  swap: ["TOOLS/", "SWAP"],
  exit: ["STRATEGIES/", "TOOLS/"],
  contact: ["X", "Telegram", "Email"],
  apr: ["HEGEMON", "USDT0", "Net APY"],
  apy: ["HEGEMON", "USDT0", "Net APY"],
  tvl: ["HEGEMON", "USDT0", "Total value locked"],
  "vault stats": ["HEGEMON", "USDT0", "Net APY", "TVL", "utilization"],
  vaultstats: ["HEGEMON", "USDT0", "Net APY", "TVL", "utilization"],
  "hegemon stats": ["HEGEMON", "USDT0", "Net APY", "TVL", "utilization"],
  gas: ["HyperEVM", "gwei"],
  hype: ["HyperEVM", "HYPE", "USD"],
  "hype price": ["HyperEVM", "HYPE", "USD"],
  block: ["HyperEVM", "block"],
  network: ["HyperEVM", "Chain ID", "HYPE"],
  chain: ["HyperEVM", "Chain ID", "HYPE"],
  balance: ["BALANCE", "EVM_TOKENS", "VAULT", "MYRMIDONS_USD₮0"],
  "balance refresh": ["BALANCE", "EVM_TOKENS", "UPDATED"],
  "vault balance": ["BALANCE", "EVM_TOKENS", "VAULT", "MYRMIDONS_USD₮0"],
  balances: ["BALANCE", "EVM_TOKENS", "VAULT", "MYRMIDONS_USD₮0"],
  commands: ["open strategies/", "hegemon", "erebus", "status", "vault stats", "balance", "gas", "block", "whoami", "contact", "help", "manifest"],
  "?": ["open strategies/", "hegemon", "erebus", "status", "vault stats", "balance", "gas", "block", "whoami", "contact", "help", "manifest"],
  suggest: ["SUGGESTED", "COMMANDS"],
  history: ["COMMAND", "HISTORY"],
  "open hegemon": ["STRATEGIES/", "HEGEMON"],
  "open erebus": ["STRATEGIES/", "EREBUS"],
  back: ["SYSTEM/"],
  pwd: ["SYSTEM/", "STRATEGIES/", "TOOLS/", "HEGEMON", "EREBUS", "ATLAS", "SWAP"],
  ping: ["HyperEVM", "RPC", "OK", "DEGRADED"],
  rpc: ["RPC", "ENDPOINT", "Provider", "URL"],
  uptime: ["Session", "uptime"],
  time: ["Local", "UTC"],
  connect: ["Wallet", "connector"],
  disconnect: ["Disconnected", "Anonymous"],
  permissions: ["ACCESS", "POSTURE", "Public UI", "locked"],
  manifest: ["MYRMIDONS", "MANIFEST", "OBSERVE", "DECIDE", "EXECUTE", "HyperEVM"],
  doctrine: ["MYRMIDONS", "MANIFEST", "OBSERVE", "DECIDE", "EXECUTE", "HyperEVM"],
  mission: ["MISSION", "on-chain", "Automate", "risk gates"],
  changelog: ["CHANGELOG"],
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type HighlightSegment = { type: "plain"; text: string } | { type: "gold"; text: string };

function splitWithHighlights(line: string, terms: string[]): HighlightSegment[] {
  if (terms.length === 0) return [{ type: "plain", text: line }];
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  const re = new RegExp(sorted.map(escapeRegex).join("|"), "gi");
  const parts: HighlightSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) parts.push({ type: "plain", text: line.slice(lastIndex, match.index) });
    parts.push({ type: "gold", text: match[0] });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < line.length) parts.push({ type: "plain", text: line.slice(lastIndex) });
  return parts.length ? parts : [{ type: "plain", text: line }];
}

// No-op setHash for FileScreen (used in landing page context, hash navigation handled in StrategiesWindowContent)
function setHash(fileId: string | null) {
  // No-op in landing page context
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
  // Stagger reveals: use max count (25) for all cases, each case uses only what it needs
  // Elements: header, label, title, desc1, desc2, kpi1, kpi2, kpi3, kpi4, list items, section headers...
  // Note: separator lines are not animated, they're static border-top elements
  const loadingStates = useStaggeredReveal(fileId, 25, 150, revealEnabled);

  // Fetch vault data for Morpho reallocator (hooks must be called unconditionally)
  // Pass empty string when not needed - queries are disabled via enabled: !!address
  const shouldFetchMorphoData = fileId === "strategy-usdt0";
  const vaultAddress = shouldFetchMorphoData ? USDT0_VAULT_ADDRESS : "";
  const metadataQuery = useVaultMetadata(vaultAddress, USDT0_VAULT_CHAIN_ID);
  const apyQuery = useVaultApy(vaultAddress, USDT0_VAULT_CHAIN_ID);
  const allocationsQuery = useVaultAllocations(vaultAddress, USDT0_VAULT_CHAIN_ID);

  const file = getFileById(fileId);
  
  // Debug log
  console.log("[FileScreen] Rendering with fileId:", fileId, "file:", file);
  
  if (!file) {
    console.warn("[FileScreen] No file found for fileId:", fileId);
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-dim font-mono text-sm">CONTENT_UNAVAILABLE</div>
      </div>
    );
  }

  if (fileId === "strategy-usdt0") {
    // Extract KPIs
    const kpis = pickKpis(
      metadataQuery.data ?? null,
      apyQuery.data ?? null,
      allocationsQuery.data ?? null
    );

    // Determine if data is still loading
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
          <LastReallocKpiCard
            className="border-r border-b border-border"
            loading={!revealEnabled || loadingStates[8] || isDataLoading}
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
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[0]} value="MYRMIDONS ALGORITHMIC STRATEGIES is a collection of onchain trading and allocation algorithms." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p2`} loading={!revealEnabled || loadingStates[1]} value="Each strategy executes policy-driven logic, not discretionary decisions." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p3`} loading={!revealEnabled || loadingStates[2]} value="Public strategies run on non-custodial infrastructure (e.g. ERC-4626 vaults). Users can enter and exit autonomously." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p4`} loading={!revealEnabled || loadingStates[3]} value="Some strategies are private or internal. Access conditions are always explicitly stated." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p5`} loading={!revealEnabled || loadingStates[4]} value="Two strategies are currently live. Others are in active development." mode="text" />
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
          <div className="space-y-1 text-sm font-mono text-text/80">
            <p>
              <GlitchTypeText key={`${fileId}-intro`} loading={!revealEnabled || loadingStates[0]} value="All strategies follow the same execution loop." mode="text" />
            </p>
          </div>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">
                <GlitchTypeText key={`${fileId}-observe-header`} loading={!revealEnabled || loadingStates[1]} value="OBSERVE" mode="text" />
              </div>
              <p className="text-sm font-mono text-text/80">
                <GlitchTypeText key={`${fileId}-observe-desc`} loading={!revealEnabled || loadingStates[2]} value="Yield, utilization, exit liquidity, risk limits." mode="text" />
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">
                <GlitchTypeText key={`${fileId}-decide-header`} loading={!revealEnabled || loadingStates[3]} value="DECIDE" mode="text" />
              </div>
              <p className="text-sm font-mono text-text/80">
                <GlitchTypeText key={`${fileId}-decide-desc`} loading={!revealEnabled || loadingStates[4]} value="Regime detection, constraints, concentration caps, safety filters." mode="text" />
              </p>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-mono font-semibold uppercase tracking-wide text-text/70">
                <GlitchTypeText key={`${fileId}-execute-header`} loading={!revealEnabled || loadingStates[5]} value="EXECUTE" mode="text" />
              </div>
              <p className="text-sm font-mono text-text/80">
                <GlitchTypeText key={`${fileId}-execute-desc`} loading={!revealEnabled || loadingStates[6]} value="Automated onchain execution with thresholds and health checks." mode="text" />
              </p>
            </div>
          </div>
          <div className="space-y-1 text-sm font-mono text-text/80 pt-2">
            <p>
              <GlitchTypeText key={`${fileId}-p1`} loading={!revealEnabled || loadingStates[7]} value="Public strategies allow one-click deposits and exits via the underlying infrastructure. Private or developing strategies require explicit access." mode="text" />
            </p>
            <p>
              <GlitchTypeText key={`${fileId}-p2`} loading={!revealEnabled || loadingStates[8]} value="Strategy logic and parameters are documented on each strategy's page. Additional access can be requested via CONTACT / REQUEST ACCESS." mode="text" />
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

const SPLIT_MIN_VIEWPORT = 1280; // below this: strategies pane renders as overlay sheet

export default function Home() {
  const [strategiesOpen, setStrategiesOpen] = useState<boolean>(false);
  const [strategiesPaneExiting, setStrategiesPaneExiting] = useState<boolean>(false);
  const [strategiesPaneEntered, setStrategiesPaneEntered] = useState<boolean>(false);
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [toolsPaneExiting, setToolsPaneExiting] = useState<boolean>(false);
  const [toolsPaneEntered, setToolsPaneEntered] = useState<boolean>(false);
  const [showBootOverlay, setShowBootOverlay] = useState<boolean>(true);
  const [isStrategiesBlinking, setIsStrategiesBlinking] = useState<boolean>(false);
  const [isToolsBlinking, setIsToolsBlinking] = useState<boolean>(false);
  const [useSplit, setUseSplit] = useState<boolean>(true);
  const [landingReveal, setLandingReveal] = useState<boolean>(false);
  const [commandInput, setCommandInput] = useState<string>("");
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [caretLeft, setCaretLeft] = useState<number>(0);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>(INTRO_ENTRIES);
  const [revealingEntryIndex, setRevealingEntryIndex] = useState<number>(-1);
  const [revealingLineIndex, setRevealingLineIndex] = useState<number>(-1);
  const [lastAppendedId, setLastAppendedId] = useState<number>(-1);
  const [cursorPulse, setCursorPulse] = useState<number>(0);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [commandHistoryIndex, setCommandHistoryIndex] = useState<number>(-1);
  const [sessionStartTime, setSessionStartTime] = useState<number>(() => (typeof window !== "undefined" ? Date.now() : 0));
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const prevEntriesLenRef = useRef(terminalEntries.length);
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { openConnectModal } = useConnectModal();
  const { disconnect } = useDisconnect();
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const { priceUsd: hypePriceUsd } = useHypePrice();
  const [gasPriceWei, setGasPriceWei] = useState<bigint | null>(null);
  const [vaultBalanceData, setVaultBalanceData] = useState<{
    assetBalance: bigint;
    vaultShareBalance: bigint;
    assetSymbol: string;
    assetDecimals: number;
    vaultDecimals: number;
  } | null>(null);

  useLayoutEffect(() => {
    const check = () => setUseSplit(typeof window !== "undefined" && window.innerWidth >= SPLIT_MIN_VIEWPORT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // STRATEGIES pane fade-in: after mount, transition opacity 0 -> 1
  useEffect(() => {
    if (strategiesOpen) {
      setStrategiesPaneEntered(false);
      const t = requestAnimationFrame(() => setStrategiesPaneEntered(true));
      return () => cancelAnimationFrame(t);
    } else {
      setStrategiesPaneEntered(false);
    }
  }, [strategiesOpen]);

  // STRATEGIES pane fade-out: after exit starts, wait 1000ms then unmount
  useEffect(() => {
    if (!strategiesPaneExiting) return;
    const t = setTimeout(() => {
      setStrategiesOpen(false);
      setStrategiesPaneExiting(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [strategiesPaneExiting]);

  // TOOLS pane fade-in
  useEffect(() => {
    if (toolsOpen) {
      setToolsPaneEntered(false);
      const t = requestAnimationFrame(() => setToolsPaneEntered(true));
      return () => cancelAnimationFrame(t);
    } else {
      setToolsPaneEntered(false);
    }
  }, [toolsOpen]);

  // TOOLS pane fade-out: after exit starts, wait 1000ms then unmount
  useEffect(() => {
    if (!toolsPaneExiting) return;
    const t = setTimeout(() => {
      setToolsOpen(false);
      setToolsPaneExiting(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [toolsPaneExiting]);

  useEffect(() => {
    if (!publicClient) return;
    const fetchGas = async () => {
      try {
        const price = await publicClient.getGasPrice();
        setGasPriceWei(price);
      } catch {
        setGasPriceWei(null);
      }
    };
    fetchGas();
    const t = setInterval(fetchGas, 5000);
    return () => clearInterval(t);
  }, [publicClient]);

  // Fetch vault balances when connected to HyperEVM
  useEffect(() => {
    if (!publicClient || !address || chainId !== USDT0_VAULT_CHAIN_ID) {
      setVaultBalanceData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const assetAddress = await getVaultAssetAddress(
          USDT0_VAULT_ADDRESS as `0x${string}`,
          publicClient
        );
        const [balances, assetMeta, vaultDecimals] = await Promise.all([
          readBalances({
            account: address,
            assetAddress,
            vaultAddress: USDT0_VAULT_ADDRESS as `0x${string}`,
            publicClient,
          }),
          readAssetMeta(assetAddress, publicClient),
          readVaultDecimals(USDT0_VAULT_ADDRESS as `0x${string}`, publicClient),
        ]);
        if (!cancelled) {
          setVaultBalanceData({
            assetBalance: balances.assetBalance,
            vaultShareBalance: balances.vaultShareBalance,
            assetSymbol: assetMeta.symbol,
            assetDecimals: assetMeta.decimals,
            vaultDecimals,
          });
        }
      } catch {
        if (!cancelled) setVaultBalanceData(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address, chainId]);

  const vaultMetadata = useVaultMetadata(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const vaultApy = useVaultApy(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const vaultAllocations = useVaultAllocations(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const vaultKpis: KpiData | null =
    vaultMetadata.data != null || vaultApy.data != null
      ? pickKpis(vaultMetadata.data ?? null, vaultApy.data ?? null, vaultAllocations.data ?? null)
      : null;
  const vaultKpisLoading = vaultMetadata.isLoading || vaultApy.isLoading;

  const TERMINAL_INPUT_PADDING_LEFT_PX = 8;

  useLayoutEffect(() => {
    const textWidth = mirrorRef.current?.offsetWidth ?? 0;
    const padding = commandInput.length > 0 ? TERMINAL_INPUT_PADDING_LEFT_PX : 0;
    setCaretLeft(padding + textWidth);
  }, [commandInput, selectionStart]);

  // Reveal last batch output line-by-line — only after boot overlay ends so type-in is visible
  useEffect(() => {
    if (showBootOverlay) {
      setRevealingLineIndex(-1);
      return;
    }
    const lastInIdx = terminalEntries.map((e, i) => (e.kind === "in" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    const outputCount = terminalEntries.slice(lastInIdx + 1).filter((e) => e.kind === "out" || e.kind === "links").reduce((acc, e) => acc + (e.kind === "links" ? e.items.length : 1), 0);
    if (outputCount === 0) {
      setRevealingEntryIndex(-1);
      setRevealingLineIndex(-1);
      return;
    }
    setRevealingEntryIndex(lastInIdx);
    setRevealingLineIndex(-1);
    let lineIndex = -1;
    const interval = setInterval(() => {
      lineIndex += 1;
      setRevealingLineIndex(lineIndex);
      if (lineIndex >= outputCount - 1) clearInterval(interval);
    }, 70);
    return () => clearInterval(interval);
  }, [terminalEntries.length, showBootOverlay]);

  // Scroll log to bottom when entries change
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [terminalEntries.length]);

  // Phosphor afterimage: mark last appended line index when new output is added
  useEffect(() => {
    const len = terminalEntries.length;
    if (len > prevEntriesLenRef.current) {
      setLastAppendedId(len - 1);
      prevEntriesLenRef.current = len;
    }
  }, [terminalEntries.length]);

  const openStrategies = (fileId?: string) => {
    setToolsOpen(false);
    setIsStrategiesBlinking(true);
    setStrategiesOpen(true);
    setTimeout(() => setIsStrategiesBlinking(false), 1000);
    if (fileId && typeof window !== "undefined") {
      setTimeout(() => {
        window.location.hash = `file=${encodeURIComponent(fileId)}`;
      }, 150);
    }
  };

  const openTools = (toolId?: string) => {
    setStrategiesOpen(false);
    if (typeof window !== "undefined") {
      window.location.hash = toolId ? `tool=${encodeURIComponent(toolId)}` : "tool=swap";
    }
    setIsToolsBlinking(true);
    setToolsOpen(true);
    setTimeout(() => setIsToolsBlinking(false), 1000);
  };

  type RunCommandOpts = {
    strategiesOpen: boolean;
    toolsOpen: boolean;
    address: string | undefined;
    vaultKpis: KpiData | null;
    vaultKpisLoading: boolean;
    gasPriceWei: bigint | null;
    blockNumber: bigint | undefined;
    hypePriceUsd: number | null;
    vaultBalanceData: {
      assetBalance: bigint;
      vaultShareBalance: bigint;
      assetSymbol: string;
      assetDecimals: number;
      vaultDecimals: number;
    } | null;
    selectedStrategyId?: string;
    selectedToolId?: string;
    commandHistory: string[];
    sessionStartTime: number;
    chainId: number;
  };
  const runCommand = (raw: string, opts: RunCommandOpts): (TerminalOut | TerminalLinks)[] => {
    const cmd = raw.trim().toLowerCase();
    if (cmd === "") return [];

    if (cmd === "clear") return [];

    if (cmd === "hwo" || cmd === "hypio") {
      const reply = ["hypio", "HWO"][Math.floor(Math.random() * 2)];
      return [{ kind: "out", text: reply }];
    }

    if (cmd.startsWith("help ")) {
      const topic = cmd.slice(5).trim();
      if (topic === "strategies") {
        return [
          { kind: "out", text: "HELP — strategies" },
          { kind: "out", text: "  open strategies/" },
          { kind: "out", text: "  open hegemon / open erebus" },
          { kind: "out", text: "  hegemon / erebus" },
          { kind: "out", text: "  back, pwd" },
        ];
      }
      if (topic === "vault") {
        return [
          { kind: "out", text: "HELP — vault" },
          { kind: "out", text: "  balance" },
          { kind: "out", text: "  deposit <amount>" },
          { kind: "out", text: "  withdraw <amount>" },
          { kind: "out", text: "  apr, tvl, vault stats" },
        ];
      }
      if (topic === "system") {
        return [
          { kind: "out", text: "HELP — system" },
          { kind: "out", text: "  status" },
          { kind: "out", text: "  network, block, gas" },
          { kind: "out", text: "  ping, rpc, uptime, time" },
          { kind: "out", text: "  version" },
        ];
      }
      if (topic === "identity") {
        return [
          { kind: "out", text: "HELP — identity" },
          { kind: "out", text: "  whoami" },
          { kind: "out", text: "  connect, disconnect" },
          { kind: "out", text: "  permissions" },
        ];
      }
      if (topic === "lore") {
        return [
          { kind: "out", text: "HELP — lore" },
          { kind: "out", text: "  manifest, doctrine" },
          { kind: "out", text: "  mission" },
          { kind: "out", text: "  changelog" },
        ];
      }
      return [{ kind: "out", text: "Unknown help topic. Try: help strategies | help vault | help system | help identity | help lore" }];
    }

    if (cmd === "exit") {
      if (opts.toolsOpen) return [{ kind: "out", text: "Closing TOOLS/..." }];
      if (opts.strategiesOpen) return [{ kind: "out", text: "Closing STRATEGIES/..." }];
      return [{ kind: "out", text: "No active session to exit." }];
    }

    if (cmd === "open hegemon") {
      openStrategies("strategy-usdt0");
      return [
        { kind: "out", text: "Opening STRATEGIES/ → HEGEMON (VAULT_REALLOCATOR)..." },
        { kind: "out", text: "STRATEGIES/ mounted." },
      ];
    }
    if (cmd === "open erebus") {
      openStrategies("strategy-liq-protect");
      return [
        { kind: "out", text: "Opening STRATEGIES/ → EREBUS (LIQUIDATION_ENGINE)..." },
        { kind: "out", text: "STRATEGIES/ mounted." },
      ];
    }
    if (cmd === "open strategies/" || cmd === "open strategies" || cmd === "strategies") {
      openStrategies();
      return [{ kind: "out", text: "Opening STRATEGIES/..." }, { kind: "out", text: "STRATEGIES/ mounted." }];
    }

    if (cmd === "tools") {
      openTools("swap");
      return [{ kind: "out", text: "Opening TOOLS/..." }, { kind: "out", text: "TOOLS/ mounted." }];
    }
    if (cmd === "swap") {
      openTools("swap");
      return [{ kind: "out", text: "Opening TOOLS/..." }, { kind: "out", text: "TOOLS/ mounted." }];
    }
    if (cmd.startsWith("swap ")) {
      return [
        { kind: "out", text: "SWAP // NOT_IMPLEMENTED" },
        { kind: "out", text: "Use 'swap' to open the tool UI (in dev)." },
      ];
    }

    if (cmd === "hegemon" || cmd === "morpho" || cmd === "vault") {
      openStrategies("strategy-usdt0");
      return [
        { kind: "out", text: "Opening STRATEGIES/ → HEGEMON (VAULT_REALLOCATOR)..." },
        { kind: "out", text: "STRATEGIES/ mounted." },
      ];
    }

    if (cmd === "erebus" || cmd === "liquidation") {
      openStrategies("strategy-liq-protect");
      return [
        { kind: "out", text: "Opening STRATEGIES/ → EREBUS (LIQUIDATION_ENGINE)..." },
        { kind: "out", text: "STRATEGIES/ mounted." },
      ];
    }

    if (cmd === "back") {
      if (opts.toolsOpen) return [{ kind: "out", text: "Returning to SYSTEM/..." }];
      if (opts.strategiesOpen) return [{ kind: "out", text: "Returning to SYSTEM/..." }];
      return [{ kind: "out", text: "Already at SYSTEM/." }];
    }

    if (cmd === "pwd") {
      if (opts.toolsOpen) {
        const toolId = opts.selectedToolId;
        if (toolId === "swap") return [{ kind: "out", text: "TOOLS/SWAP" }];
        return [{ kind: "out", text: "TOOLS/" }];
      }
      if (opts.strategiesOpen) {
        const id = opts.selectedStrategyId;
        if (id === "strategy-usdt0") return [{ kind: "out", text: "STRATEGIES/HEGEMON" }];
        if (id === "strategy-liq-protect") return [{ kind: "out", text: "STRATEGIES/EREBUS" }];
        if (id === "strategy-exec-slot") return [{ kind: "out", text: "STRATEGIES/ATLAS" }];
        return [{ kind: "out", text: "STRATEGIES/" }];
      }
      return [{ kind: "out", text: "SYSTEM/" }];
    }

    if (cmd === "ls" || cmd === "dir") {
      return [
        { kind: "out", text: "SYSTEM/" },
        { kind: "out", text: "STRATEGIES/" },
        { kind: "out", text: "TOOLS/" },
      ];
    }

    if (cmd === "status") {
      return [
        { kind: "out", text: "SYSTEM STATUS" },
        { kind: "out", text: "  Network: HyperEVM" },
        { kind: "out", text: "  Index: OK" },
        { kind: "out", text: "  Strategies: 2 detected" },
      ];
    }

    if (cmd === "whoami") {
      if (opts.address) return [{ kind: "out", text: `Operator: ${opts.address}` }];
      return [{ kind: "out", text: "Anonymous operator." }];
    }

    if (cmd === "version" || cmd === "ver") {
      return [{ kind: "out", text: "MYRMIDONS SYSTEM v0.1" }];
    }

    if (cmd === "hint") {
      return [{ kind: "out", text: "Try: open strategies/  (or type 'help' for commands)" }];
    }

    if (cmd === "commands" || cmd === "?") {
      return [
        { kind: "out", text: "open strategies/" },
        { kind: "out", text: "hegemon" },
        { kind: "out", text: "erebus" },
        { kind: "out", text: "status" },
        { kind: "out", text: "vault stats" },
        { kind: "out", text: "balance" },
        { kind: "out", text: "gas" },
        { kind: "out", text: "block" },
        { kind: "out", text: "whoami" },
        { kind: "out", text: "contact" },
        { kind: "out", text: "help" },
        { kind: "out", text: "manifest" },
      ];
    }

    if (cmd === "suggest") {
      const pool = [...SUGGEST_POOL];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const three = pool.slice(0, 3);
      return [
        { kind: "out", text: "SUGGESTED COMMANDS" },
        { kind: "out", text: `1) ${three[0]}` },
        { kind: "out", text: `2) ${three[1]}` },
        { kind: "out", text: `3) ${three[2]}` },
      ];
    }

    if (cmd === "history") {
      const hist = opts.commandHistory;
      if (hist.length === 0) return [{ kind: "out", text: "No command history." }];
      return [
        { kind: "out", text: "COMMAND HISTORY" },
        ...hist.map((h, i) => ({ kind: "out" as const, text: `${i + 1}) ${h}` })),
      ];
    }

    // HyperEVM / gas / HYPE
    const formatGwei = (wei: bigint | null): string => {
      if (wei === null) return "—";
      const s = formatUnits(wei, 9);
      const [a, b] = s.split(".");
      if (!b) return s;
      const decimals = b.slice(0, 6).padEnd(3, "0");
      const trimmed = decimals.replace(/0+$/, "") || "000";
      const finalDecimals = trimmed.length >= 3 ? trimmed : trimmed.padEnd(3, "0");
      return `${a}.${finalDecimals}`;
    };
    const GAS_SIMPLE = 21_000n;
    const gasUsd =
      opts.gasPriceWei !== null && opts.hypePriceUsd !== null && opts.hypePriceUsd > 0
        ? Number((opts.gasPriceWei * GAS_SIMPLE) / 10n ** 18n) * opts.hypePriceUsd
        : null;

    if (cmd === "gas") {
      const gwei = formatGwei(opts.gasPriceWei);
      const usd =
        gasUsd !== null ? (gasUsd < 0.01 ? "<$0.01" : `≈$${gasUsd.toFixed(2)}`) : "—";
      return [
        { kind: "out", text: "HyperEVM — Gas price" },
        { kind: "out", text: `  ${gwei} gwei (simple tx: ${usd})` },
      ];
    }

    if (cmd === "hype" || cmd === "hype price") {
      const price = opts.hypePriceUsd;
      if (price === null) return [{ kind: "out", text: "HYPE price: — (fetching…)" }];
      return [
        { kind: "out", text: "HyperEVM — Native token (HYPE)" },
        { kind: "out", text: `  $${price.toFixed(2)} USD` },
      ];
    }

    if (cmd === "block") {
      const block = opts.blockNumber;
      const blockStr = block !== undefined ? block.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "—";
      return [
        { kind: "out", text: "HyperEVM — Latest block" },
        { kind: "out", text: `  ${blockStr}` },
      ];
    }

    if (cmd === "network" || cmd === "chain") {
      return [
        { kind: "out", text: "HyperEVM — Network" },
        { kind: "out", text: "  Chain ID: 999" },
        { kind: "out", text: "  Native token: HYPE" },
      ];
    }

    if (cmd === "rpc") {
      const name = opts.chainId === 999 ? "HyperEVM" : "—";
      const url = opts.chainId === 999 ? "https://rpc.hyperliquid.xyz" : "—";
      return [
        { kind: "out", text: "RPC ENDPOINT" },
        { kind: "out", text: `Provider: ${name}` },
        { kind: "out", text: `URL: ${url}` },
      ];
    }

    if (cmd === "uptime") {
      const elapsed = Math.floor((Date.now() - opts.sessionStartTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      return [{ kind: "out", text: `Session uptime: ${m}m ${s.toString().padStart(2, "0")}s` }];
    }

    if (cmd === "time") {
      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      const localY = now.getFullYear();
      const localM = pad(now.getMonth() + 1);
      const localD = pad(now.getDate());
      const localH = pad(now.getHours());
      const localMin = pad(now.getMinutes());
      const localStr = `${localY}-${localM}-${localD} ${localH}:${localMin}`;
      const utc = new Date(now.toISOString());
      const utcH = pad(utc.getUTCHours());
      const utcMin = pad(utc.getUTCMinutes());
      const utcStr = `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())} ${utcH}:${utcMin}`;
      return [
        { kind: "out", text: `Local: ${localStr}` },
        { kind: "out", text: `UTC:   ${utcStr}` },
      ];
    }

    // balance / balance refresh — handled async in handleCommandSubmit (LiquidSwap + vault share)

    // deposit <amount> — open vault page to deposit that many USDT0 (assets)
    const depositMatch = raw.trim().toLowerCase().match(/^deposit\s+(.+)$/);
    if (depositMatch) {
      const amountStr = depositMatch[1].trim();
      if (amountStr && /^\d+(\.\d*)?$/.test(amountStr)) {
        if (typeof window !== "undefined") {
          window.location.href = `/vaults/usdt0?deposit=${encodeURIComponent(amountStr)}`;
        }
        return [
          { kind: "out", text: "Opening vault to deposit USDT0…" },
          { kind: "out", text: `  Amount: ${amountStr} USDT0` },
          { kind: "out", text: "  Complete the deposit on the vault page." },
        ];
      }
    }

    // withdraw <amount> — open vault page to withdraw that many vault shares
    const withdrawMatch = raw.trim().toLowerCase().match(/^withdraw\s+(.+)$/);
    if (withdrawMatch) {
      const amountStr = withdrawMatch[1].trim();
      if (amountStr && /^\d+(\.\d*)?$/.test(amountStr)) {
        if (typeof window !== "undefined") {
          window.location.href = `/vaults/usdt0?withdraw=${encodeURIComponent(amountStr)}`;
        }
        return [
          { kind: "out", text: "Opening vault to withdraw shares…" },
          { kind: "out", text: `  Shares: ${amountStr}` },
          { kind: "out", text: "  Complete the withdrawal on the vault page." },
        ];
      }
      return [{ kind: "out", text: "Usage: withdraw <amount> — e.g. withdraw 100 (vault shares)" }];
    }
    if (cmd === "deposit") {
      return [{ kind: "out", text: "Usage: deposit <amount> — e.g. deposit 20 (USDT0)" }];
    }
    if (cmd === "withdraw") {
      return [{ kind: "out", text: "Usage: withdraw <amount> — e.g. withdraw 100 (vault shares)" }];
    }

    if (cmd === "apr" || cmd === "apy") {
      if (opts.vaultKpisLoading) return [{ kind: "out", text: "Fetching APR…" }];
      const pct = opts.vaultKpis?.netApyPct ?? "—";
      return [
        { kind: "out", text: "HEGEMON (USDT0) — Net APY" },
        { kind: "out", text: `  ${pct}` },
      ];
    }

    if (cmd === "tvl") {
      if (opts.vaultKpisLoading) return [{ kind: "out", text: "Fetching TVL…" }];
      const tvl = opts.vaultKpis?.tvlUsd ?? "—";
      return [
        { kind: "out", text: "HEGEMON (USDT0) — Total value locked" },
        { kind: "out", text: `  ${tvl}` },
      ];
    }

    if (cmd === "vault stats" || cmd === "vaultstats" || cmd === "hegemon stats") {
      if (opts.vaultKpisLoading) return [{ kind: "out", text: "Fetching vault stats…" }];
      const k = opts.vaultKpis;
      const apy = k?.netApyPct ?? "—";
      const tvl = k?.tvlUsd ?? "—";
      const util = k?.utilizationPct ?? "—";
      return [
        { kind: "out", text: "HEGEMON (USDT0) — Vault stats" },
        { kind: "out", text: `  Net APY: ${apy}` },
        { kind: "out", text: `  TVL: ${tvl}` },
        { kind: "out", text: `  Avg utilization: ${util}` },
      ];
    }

    if (cmd === "help") {
      return [
        { kind: "out", text: "Available commands:" },
        { kind: "out", text: "  strategies       — Open the strategies panel" },
        { kind: "out", text: "  tools / swap     — Open the tools panel (SWAP)" },
        { kind: "out", text: "  HEGEMON / morpho / vault — Open STRATEGIES/ with HEGEMON selected" },
        { kind: "out", text: "  EREBUS / liquidation — Open STRATEGIES/ with EREBUS selected" },
        { kind: "out", text: "  help              — Show this help" },
        { kind: "out", text: "  help <topic>      — help strategies | vault | system | identity | lore" },
        { kind: "out", text: "  commands / ?      — Short command list" },
        { kind: "out", text: "  suggest           — Random command suggestions" },
        { kind: "out", text: "  history           — Session command history" },
        { kind: "out", text: "  what is MYRMIDONS — About MYRMIDONS" },
        { kind: "out", text: "  socials / contact  — X, Telegram, email (links)" },
        { kind: "out", text: "  clear             — Clear command log (keep intro)" },
        { kind: "out", text: "  ls / dir          — List SYSTEM/, STRATEGIES/, TOOLS/" },
        { kind: "out", text: "  status            — System status" },
        { kind: "out", text: "  whoami            — Operator identity" },
        { kind: "out", text: "  version / ver     — Version" },
        { kind: "out", text: "  exit              — Close STRATEGIES/ window" },
        { kind: "out", text: "  back              — Return to SYSTEM/" },
        { kind: "out", text: "  pwd               — Current path" },
        { kind: "out", text: "  hint              — Quick hint" },
        { kind: "out", text: "  gas               — HyperEVM gas price (gwei + USD)" },
        { kind: "out", text: "  hype / hype price — HYPE (native token) price in USD" },
        { kind: "out", text: "  block             — Latest HyperEVM block number" },
        { kind: "out", text: "  network / chain   — HyperEVM network info" },
        { kind: "out", text: "  ping              — RPC health check" },
        { kind: "out", text: "  rpc               — RPC endpoint info" },
        { kind: "out", text: "  uptime            — Session uptime" },
        { kind: "out", text: "  time              — Local and UTC time" },
        { kind: "out", text: "  connect           — Open wallet connector" },
        { kind: "out", text: "  disconnect        — Disconnect wallet" },
        { kind: "out", text: "  permissions       — Access posture" },
        { kind: "out", text: "  manifest / doctrine — MYRMIDONS manifest" },
        { kind: "out", text: "  mission           — Mission statement" },
        { kind: "out", text: "  changelog         — Version history" },
        { kind: "out", text: "  balance           — LiquidSwap token balances + HEGEMON vault shares" },
        { kind: "out", text: "  deposit <amount>  — Open vault to deposit USDT0" },
        { kind: "out", text: "  withdraw <amount> — Open vault to withdraw shares" },
        { kind: "out", text: "  apr / apy         — HEGEMON USDT0 net APY" },
        { kind: "out", text: "  tvl               — HEGEMON USDT0 TVL" },
        { kind: "out", text: "  vault stats       — HEGEMON vault summary (APY, TVL, util)" },
      ];
    }

    if (cmd === "connect") {
      if (opts.address) return [{ kind: "out", text: "Wallet already connected." }];
      return [{ kind: "out", text: "Opening wallet connector..." }];
    }

    if (cmd === "disconnect") {
      if (!opts.address) return [{ kind: "out", text: "No wallet session." }];
      return [{ kind: "out", text: "Disconnected. Operator: Anonymous." }];
    }

    if (cmd === "permissions") {
      return [
        { kind: "out", text: "ACCESS POSTURE" },
        { kind: "out", text: "Mode: Public UI" },
        { kind: "out", text: "Private operator: locked" },
      ];
    }

    if (cmd === "manifest" || cmd === "doctrine") {
      return [
        { kind: "out", text: "MYRMIDONS MANIFEST" },
        { kind: "out", text: "OBSERVE → DECIDE → EXECUTE" },
        { kind: "out", text: "Public + private strategies." },
        { kind: "out", text: "Risk-gated automation on HyperEVM." },
        { kind: "out", text: "Operator-first tooling. Minimal surface area." },
      ];
    }

    if (cmd === "mission") {
      return [
        { kind: "out", text: "MISSION" },
        { kind: "out", text: "Build hardened execution systems for on-chain markets." },
        { kind: "out", text: "Automate allocation and liquidation with strict risk gates." },
        { kind: "out", text: "Expose only what operators need: signals, actions, proofs." },
      ];
    }

    if (cmd === "changelog") {
      return [
        { kind: "out", text: "CHANGELOG" },
        { kind: "out", text: "v0.1 — Initial operator console + strategies panel" },
        { kind: "out", text: "v0.1.1 — Live chain status commands" },
        { kind: "out", text: "v0.1.2 — Terminal UX + new command set" },
      ];
    }

    if (cmd === "what is myrmidons" || cmd === "myrmidons") {
      return [
        { kind: "out", text: "MYRMIDONS is a collection of onchain trading and allocation algorithms." },
        { kind: "out", text: "Each strategy executes policy-driven logic, not discretionary decisions." },
        { kind: "out", text: "Public strategies run on non-custodial infrastructure (e.g. ERC-4626 vaults). Users can enter and exit autonomously." },
        { kind: "out", text: "Some strategies are private or internal. Access conditions are always explicitly stated." },
        { kind: "out", text: "Two strategies are currently live. Others are in active development." },
        { kind: "out", text: "" },
        { kind: "out", text: "Execution loop: OBSERVE → DECIDE → EXECUTE" },
        { kind: "out", text: "  OBSERVE — Yield, utilization, exit liquidity, risk limits." },
        { kind: "out", text: "  DECIDE  — Regime detection, constraints, concentration caps, safety filters." },
        { kind: "out", text: "  EXECUTE — Automated onchain execution with thresholds and health checks." },
        { kind: "out", text: "" },
        { kind: "out", text: "Public strategies allow one-click deposits and exits. Private or developing strategies require explicit access." },
        { kind: "out", text: "Strategy logic and parameters are documented on each strategy's page." },
      ];
    }

    if (cmd === "socials" || cmd === "contact") {
      return [{ kind: "links", items: SOCIALS_LINKS }];
    }

    if (cmd === "bf6" || cmd === "bf6?") {
      return [{ kind: "out", text: "go" }];
    }

    return [{ kind: "out", text: "Command not found. Type 'help' for available commands." }];
  };

  const handleCommandSubmit = () => {
    const raw = commandInput.trim();
    if (raw === "") return;
    const cmd = raw.toLowerCase();
    if (cmd === "clear") {
      setTerminalEntries(INTRO_ENTRIES);
      setCommandHistory([]);
      setSessionStartTime(Date.now());
      setCommandInput("");
      setSelectionStart(0);
      return;
    }
    if ((cmd === "exit" || cmd === "back") && (strategiesOpen || toolsOpen)) {
      if (strategiesOpen) {
        setStrategiesOpen(false);
        if (typeof window !== "undefined") window.location.hash = "";
      }
      if (toolsOpen) {
        setToolsOpen(false);
        if (typeof window !== "undefined") window.location.hash = "";
      }
    }

    // balance / balance refresh — async LiquidSwap + HEGEMON vault share (30s cache)
    if (cmd === "balance" || cmd === "balance refresh" || cmd === "vault balance" || cmd === "balances") {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!address) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "BALANCE // WALLET_REQUIRED" }]);
        return;
      }
      const vaultData = vaultBalanceData;
      const force = cmd === "balance refresh";
      getBalances(address, { force })
        .then(({ balances, fromCache }) => {
          const lines: TerminalOut[] = [];
          lines.push({ kind: "out", text: "BALANCE // EVM_TOKENS" });
          const tableEntries = balances.map((b) => ({
            symbol: b.symbol,
            formattedAmount: formatBalanceAmount(b.balanceRaw, b.decimals),
          }));
          for (const text of formatBalanceTable(tableEntries, 3)) {
            lines.push({ kind: "out", text });
          }
          lines.push({ kind: "out", text: "" });
          lines.push({ kind: "out", text: "BALANCE // VAULT" });
          if (vaultData) {
            lines.push({
              kind: "out",
              text: `MYRMIDONS_USD₮0  ${formatAmount(vaultData.vaultShareBalance, vaultData.vaultDecimals)}`,
            });
          } else {
            lines.push({ kind: "out", text: "MYRMIDONS_USD₮0  UNAVAILABLE" });
          }
          if (force && !fromCache) {
            lines.push({ kind: "out", text: "BALANCE // UPDATED" });
          }
          setTerminalEntries((prev) => [...prev, ...lines]);
        })
        .catch((err) => {
          setTerminalEntries((prev) => [
            ...prev,
            { kind: "out", text: `BALANCE // ERROR  ${err instanceof Error ? err.message : String(err)}` },
          ]);
        });
      return;
    }

    if (cmd === "ping") {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }, { kind: "out", text: "HyperEVM RPC: …" }]);
      setCommandInput("");
      setSelectionStart(0);
      if (publicClient) {
        const start = performance.now();
        publicClient
          .getGasPrice()
          .then(() => {
            const ms = Math.round(performance.now() - start);
            setTerminalEntries((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.kind === "out" && last.text === "HyperEVM RPC: …")
                next[next.length - 1] = { kind: "out", text: `HyperEVM RPC: OK (${ms} ms)` };
              return next;
            });
          })
          .catch(() => {
            setTerminalEntries((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.kind === "out" && last.text === "HyperEVM RPC: …")
                next[next.length - 1] = { kind: "out", text: "HyperEVM RPC: DEGRADED" };
              return next;
            });
          });
      } else {
        setTimeout(() => {
          setTerminalEntries((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.kind === "out" && last.text === "HyperEVM RPC: …")
              next[next.length - 1] = { kind: "out", text: "HyperEVM RPC: DEGRADED" };
            return next;
          });
        }, 0);
      }
      return;
    }
    setCommandHistory((prev) => [...prev, raw].slice(-20));
    setCommandHistoryIndex(-1);
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const fileMatch = hash.match(/file=([^&]+)/);
    const toolMatch = hash.match(/tool=([^&]+)/);
    const selectedStrategyId = fileMatch ? decodeURIComponent(fileMatch[1]) : undefined;
    const selectedToolId = toolMatch ? decodeURIComponent(toolMatch[1]) : undefined;
    const output = runCommand(raw, {
      strategiesOpen,
      toolsOpen,
      address,
      vaultKpis,
      vaultKpisLoading,
      gasPriceWei,
      blockNumber,
      hypePriceUsd,
      vaultBalanceData,
      selectedStrategyId,
      selectedToolId,
      commandHistory,
      sessionStartTime,
      chainId,
    });
    setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }, ...output]);
    setCommandInput("");
    setSelectionStart(0);
    if (cmd === "connect" && !address && openConnectModal) openConnectModal();
    if (cmd === "disconnect" && address && disconnect) disconnect();
  };

  // Landing boot effect - shows on every page load/hard refresh
  useEffect(() => {
    const duration = 600 + Math.random() * 300; // 600-900ms
    const timer = setTimeout(() => {
      setShowBootOverlay(false);
    }, duration);
    return () => clearTimeout(timer);
  }, []);

  // Start glitch text reveal after boot overlay ends
  useEffect(() => {
    if (!showBootOverlay) {
      const t = setTimeout(() => setLandingReveal(true), 80);
      return () => clearTimeout(t);
    }
  }, [showBootOverlay]);

  return (
    <>
      {/* Boot overlay - fixed position to cover entire viewport */}
      {showBootOverlay && (
        <>
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes bootLine {
              0% {
                opacity: 0;
                transform: translateX(-100%);
              }
              50% {
                opacity: 1;
              }
              100% {
                opacity: 0;
                transform: translateX(100%);
              }
            }
          `}} />
          <div className="fixed inset-0 z-[100] bg-bg-base flex items-center justify-center pointer-events-none">
            <div className="w-full h-full relative overflow-hidden">
              {/* Terminal-style lines */}
              {Array.from({ length: 40 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 h-px bg-border"
                  style={{
                    top: `${(i * 100) / 40}%`,
                    opacity: 0.4,
                    animation: `bootLine 750ms ease-out ${i * 10}ms 1 forwards`,
                  }}
                />
              ))}
            </div>
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
      )}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes strategies-double-glow {
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
        @keyframes strategies-double-blink {
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
        .strategies-blink.strategies-selected {
          animation: strategies-double-blink 1000ms ease-in-out forwards;
        }
        .strategies-blink.strategies-selected > button svg {
          animation: strategies-double-glow 1000ms ease-in-out forwards;
        }
        .strategies-blink:not(.strategies-selected) {
          animation: strategies-double-blink 1000ms ease-in-out;
        }
        .strategies-blink:not(.strategies-selected) > button svg {
          animation: strategies-double-glow 1000ms ease-in-out;
        }
        .strategies-selected:not(.strategies-blink) > button svg {
          filter: drop-shadow(0 0 6px color-mix(in oklab, var(--text) 100%, transparent))
                  drop-shadow(0 0 12px color-mix(in oklab, var(--text) 80%, transparent))
                  drop-shadow(0 0 20px color-mix(in oklab, var(--border) 60%, transparent))
                  drop-shadow(0 0 30px color-mix(in oklab, var(--border) 40%, transparent));
        }
        @media (prefers-reduced-motion: reduce) {
          .strategies-blink {
            animation: none;
            opacity: 1;
          }
          .strategies-blink > button svg {
            animation: none;
          }
          .strategies-selected:not(.strategies-blink) > button svg {
            filter: none;
          }
        }
      `}} />
      <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base relative">
        <div className="flex flex-1 min-w-0 overflow-hidden">
          {/* Main terminal: log + input */}
          <div className="flex flex-1 min-w-0 flex-col overflow-hidden min-h-0">
        {/* Terminal log: scrollable, full width */}
        <div ref={logRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs min-h-0">
          {(() => {
            const lastInIdx = terminalEntries.map((e, i) => (e.kind === "in" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
            const getOutputLineStart = (entryIdx: number) => {
              if (entryIdx <= lastInIdx) return -1;
              let count = 0;
              for (let j = lastInIdx + 1; j < entryIdx; j++) {
                const x = terminalEntries[j];
                if (x.kind === "out") count += 1;
                if (x.kind === "links") count += x.items.length;
              }
              return count;
            };
            const getCmdKey = (idx: number) => {
              for (let i = idx; i >= 0; i--) {
                if (terminalEntries[i].kind === "in") return (terminalEntries[i] as TerminalIn).text.trim().toLowerCase();
              }
              return "";
            };
            return terminalEntries.map((e, i) => {
              const phosphorTrigger = i === lastAppendedId ? lastAppendedId : 0;
              const glowTrigger = i === lastAppendedId ? lastAppendedId : 0;
              const wrapWithGlow = (node: ReactNode) => (
                <ActiveLineGlow key={i} trigger={glowTrigger}>
                  <PhosphorAfterimage trigger={phosphorTrigger} ghostClassName="opacity-70">
                    {node}
                  </PhosphorAfterimage>
                </ActiveLineGlow>
              );
              if (e.kind === "in") {
                return wrapWithGlow(
                  <div className="flex gap-2 text-text-dim mt-1">
                    <span className="text-text-dim/60 shrink-0 select-none w-2" aria-hidden />
                    <span className="text-white">{e.text}</span>
                  </div>
                );
              }
              if (e.kind === "out") {
                const outLineStart = getOutputLineStart(i);
                const isInLastBatch = i > lastInIdx;
                const isRevealed = !isInLastBatch || (outLineStart >= 0 && outLineStart <= revealingLineIndex);
                if (!isRevealed) return null;
                const isEmpty = e.text === "";
                // Greeting line: gold clickable "strategies" that opens STRATEGIES/ pane
                if (e.text === "Type 'help', 'strategies' or 'tools' to continue.") {
                  return wrapWithGlow(
                    <div className="flex gap-2 text-text-dim pl-4">
                      <span className="text-border shrink-0 select-none">&gt;</span>
                      <span className="text-text-dim font-mono text-xs">
                        Type &apos;
                        <button
                          type="button"
                          onClick={() => {
                            const hash = typeof window !== "undefined" ? window.location.hash : "";
                            const fileMatch = hash.match(/file=([^&]+)/);
                            const toolMatch = hash.match(/tool=([^&]+)/);
                            const selectedStrategyId = fileMatch ? decodeURIComponent(fileMatch[1]) : undefined;
                            const selectedToolId = toolMatch ? decodeURIComponent(toolMatch[1]) : undefined;
                            const output = runCommand("help", {
                              strategiesOpen,
                              toolsOpen,
                              address,
                              vaultKpis,
                              vaultKpisLoading,
                              gasPriceWei,
                              blockNumber,
                              hypePriceUsd,
                              vaultBalanceData,
                              selectedStrategyId,
                              selectedToolId,
                              commandHistory,
                              sessionStartTime,
                              chainId,
                            });
                            setTerminalEntries((prev) => [...prev, { kind: "in", text: "help" }, ...output]);
                          }}
                          className="text-gold hover:underline cursor-pointer font-mono text-xs bg-transparent border-none p-0 align-baseline focus:outline-none focus:ring-0"
                        >
                          help
                        </button>
                        &apos;, &apos;
                        <button
                          type="button"
                          onClick={() => {
                            setTerminalEntries((prev) => [
                              ...prev,
                              { kind: "in", text: "strategies" },
                              { kind: "out", text: "Opening STRATEGIES/..." },
                              { kind: "out", text: "STRATEGIES/ mounted." },
                            ]);
                            openStrategies();
                          }}
                          className="text-gold hover:underline cursor-pointer font-mono text-xs bg-transparent border-none p-0 align-baseline focus:outline-none focus:ring-0"
                        >
                          strategies
                        </button>
                        &apos; or &apos;
                        <button
                          type="button"
                          onClick={() => {
                            setTerminalEntries((prev) => [
                              ...prev,
                              { kind: "in", text: "tools" },
                              { kind: "out", text: "Opening TOOLS/..." },
                              { kind: "out", text: "TOOLS/ mounted." },
                            ]);
                            openTools("swap");
                          }}
                          className="text-gold hover:underline cursor-pointer font-mono text-xs bg-transparent border-none p-0 align-baseline focus:outline-none focus:ring-0"
                        >
                          tools
                        </button>
                        &apos; to continue.
                      </span>
                    </div>
                  );
                }
                const dashIdx = e.text.indexOf(" — ");
                const isAlignedLine = !isEmpty && dashIdx >= 0;
                const leftPart = isAlignedLine ? e.text.slice(0, dashIdx).replace(/\s+$/, "") : "";
                const rightPart = isAlignedLine ? e.text.slice(dashIdx + 3).trim() : "";
                const cmdKey = getCmdKey(i);
                const terms = HIGHLIGHT_TERMS[cmdKey] ?? (e.text.includes("help") ? ["help"] : []);
                const renderSegments = (text: string) =>
                  splitWithHighlights(text, terms).map((seg, k) =>
                    seg.type === "gold" ? (
                      <span key={k} className="text-gold">
                        <GlitchTypeText loading={false} value={seg.text} mode="text" />
                      </span>
                    ) : (
                      <GlitchTypeText key={k} loading={false} value={seg.text} mode="text" />
                    )
                  );
                return wrapWithGlow(
                  <div className="flex gap-2 text-text-dim pl-4">
                    <span className="text-border shrink-0 select-none">&gt;</span>
                    {isEmpty ? (
                      <span className="min-h-[1em]" aria-hidden />
                    ) : isAlignedLine ? (
                      <span className="text-text-dim font-mono text-xs inline-flex flex-wrap items-baseline gap-x-0">
                        <span className="inline-block min-w-[28ch] shrink-0">{renderSegments(leftPart)}</span>
                        <span className="text-text-dim">{renderSegments(rightPart)}</span>
                      </span>
                    ) : (
                      <span className="text-text-dim font-mono text-xs whitespace-pre">{renderSegments(e.text)}</span>
                    )}
                  </div>
                );
              }
              if (e.kind === "links") {
                const base = getOutputLineStart(i);
                const isInLastBatch = i > lastInIdx;
                return wrapWithGlow(
                  <span className="contents">
                    {e.items.map((item, j) => {
                      const lineIdx = base + j;
                      const isRevealed = !isInLastBatch || lineIdx <= revealingLineIndex;
                      if (!isRevealed) return null;
                      return (
                        <div key={`${i}-${j}`} className="flex gap-2 text-text-dim pl-4">
                          <span className="text-border shrink-0 select-none">&gt;</span>
                          <a
                            href={item.href}
                            target={item.href.startsWith("http") ? "_blank" : undefined}
                            rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                            className="text-text-dim hover:text-gold transition-colors underline font-mono"
                          >
                            <GlitchTypeText loading={false} value={item.label} mode="text" />
                          </a>
                        </div>
                      );
                    })}
                  </span>
                );
              }
              return null;
            });
          })()}
        </div>

        {/* Pinned input row */}
        <div className="shrink-0 border-t border-border/30 p-4 pt-3 flex gap-2 items-center text-text-dim font-mono text-xs bg-bg-base">
          <span className="text-border shrink-0 select-none">&gt;</span>
          <div className="flex-1 min-w-0 relative flex items-center">
            <span
              ref={mirrorRef}
              aria-hidden
              className="absolute left-0 top-0 whitespace-pre font-mono text-xs text-white pointer-events-none invisible"
              style={{ padding: 0 }}
            >
              {commandInput.slice(0, selectionStart)}
            </span>
            <input
              ref={inputRef}
              type="text"
              value={commandInput}
              onChange={(e) => {
                setCommandInput(e.target.value);
                setSelectionStart(e.currentTarget.selectionStart ?? 0);
                setCursorPulse((p) => p + 1);
              }}
              onSelect={(e) => {
                setSelectionStart(e.currentTarget.selectionStart ?? 0);
                setCursorPulse((p) => p + 1);
              }}
              onClick={(e) => {
                setSelectionStart(e.currentTarget.selectionStart ?? 0);
                setCursorPulse((p) => p + 1);
              }}
              onKeyUp={(e) => {
                setSelectionStart(e.currentTarget.selectionStart ?? 0);
                setCursorPulse((p) => p + 1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleCommandSubmit();
                } else if (e.key === "ArrowUp" && commandHistory.length > 0 && (commandHistoryIndex === -1 || commandHistoryIndex > 0)) {
                  e.preventDefault();
                  const nextIndex = commandHistoryIndex === -1
                    ? commandHistory.length - 1
                    : commandHistoryIndex - 1;
                  setCommandHistoryIndex(nextIndex);
                  setCommandInput(commandHistory[nextIndex]);
                  setSelectionStart(commandHistory[nextIndex].length);
                } else if (e.key === "ArrowDown" && commandHistoryIndex >= 0) {
                  e.preventDefault();
                  const nextIndex = commandHistoryIndex + 1;
                  if (nextIndex >= commandHistory.length) {
                    setCommandHistoryIndex(-1);
                    setCommandInput("");
                    setSelectionStart(0);
                  } else {
                    setCommandHistoryIndex(nextIndex);
                    setCommandInput(commandHistory[nextIndex]);
                    setSelectionStart(commandHistory[nextIndex].length);
                  }
                }
              }}
              placeholder="type help, strategies or tools"
              className="w-full bg-transparent border-none outline-none text-white font-mono text-xs placeholder:text-text-dim/50 focus:ring-0 focus:outline-none pl-2 py-0 pr-0 caret-transparent"
              aria-label="Enter command"
            />
            <span
              className="absolute top-1/2 -translate-y-1/2 pointer-events-none text-border"
              style={{ left: caretLeft }}
            >
              <PhosphorAfterimage trigger={cursorPulse} ghostClassName="opacity-60">
                <BlinkCaret />
              </PhosphorAfterimage>
            </span>
          </div>
        </div>

          </div>
          {/* Docked STRATEGIES/ pane when split (desktop): divider + pane, fade in/out like CONTENT_VIEWPORT */}
          {(strategiesOpen || strategiesPaneExiting) && useSplit && (
            <>
              <div className="w-px shrink-0 bg-border self-stretch" aria-hidden />
              <div
                className="relative shrink-0 flex flex-col h-full w-1/2 min-w-0 transition-transform duration-1000"
                style={{
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                  transform: strategiesOpen && !strategiesPaneExiting && strategiesPaneEntered ? "translateX(0)" : "translateX(100%)",
                  pointerEvents: strategiesOpen && !strategiesPaneExiting && strategiesPaneEntered ? undefined : "none",
                }}
              >
                <FloatingWindow
                  open={strategiesOpen || strategiesPaneExiting}
                  docked
                  title="STRATEGIES/"
                  onClose={() => {
                    setTerminalEntries((prev) => [
                      ...prev,
                      { kind: "in", text: "exit" },
                      { kind: "out", text: "Closing STRATEGIES/..." },
                    ]);
                    setStrategiesPaneExiting(true);
                    if (typeof window !== "undefined") window.location.hash = "";
                  }}
                >
                  <StrategiesWindowContent />
                </FloatingWindow>
                {/* STRATEGIES/ folder button scoped inside pane (hidden, component kept) */}
                <div className="absolute top-3 right-3 z-10 pointer-events-none hidden">
                  <div
                    className={cn(
                      "inline-block pointer-events-auto transition-all duration-300 relative",
                      isStrategiesBlinking && "strategies-blink strategies-selected",
                      strategiesOpen && "strategies-selected",
                      "hover:-translate-y-2"
                    )}
                  >
                    <button
                      onClick={() => {
                        setIsStrategiesBlinking(true);
                        setStrategiesOpen(true);
                        setTimeout(() => setIsStrategiesBlinking(false), 1000);
                      }}
                      className="bg-panel/90 hover:bg-panel/80 transition-colors p-8 text-left focus:outline-none relative min-w-[200px]"
                    >
                      <div
                        className="absolute inset-0 bg-panel/10 border border-border/30"
                        style={{
                          clipPath: FOLDER_CLIP_PATH,
                          transform: "translate(8px, 8px)",
                        }}
                      />
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          clipPath: FOLDER_CLIP_PATH,
                          opacity: 0.07,
                          backgroundImage: `repeating-linear-gradient(
                            0deg,
                            rgba(255, 255, 255, 0.08) 0px,
                            rgba(255, 255, 255, 0.08) 5px,
                            transparent 5px,
                            transparent 10px
                          )`,
                          backgroundSize: "100% 10px",
                          mixBlendMode: "overlay",
                        }}
                      />
                      <FolderSvg isSelected={strategiesOpen || isStrategiesBlinking} />
                      <div className="font-mono font-bold text-white text-sm uppercase tracking-widest mb-2 relative z-10">
                        STRATEGIES/
                      </div>
                      <div className="text-xs text-text-dim font-mono relative z-10">
                        Open to view HEGEMON, EREBUS…
                      </div>
                    </button>
                    <div
                      className="absolute bottom-0 left-full w-[60px] h-px bg-border/30 pointer-events-none"
                      aria-hidden
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Docked TOOLS/ pane when split (desktop) */}
          {(toolsOpen || toolsPaneExiting) && useSplit && (
            <>
              <div className="w-px shrink-0 bg-border self-stretch" aria-hidden />
              <div
                className="relative shrink-0 flex flex-col h-full w-1/2 min-w-0 transition-transform duration-1000"
                style={{
                  transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
                  transform: toolsOpen && !toolsPaneExiting && toolsPaneEntered ? "translateX(0)" : "translateX(100%)",
                  pointerEvents: toolsOpen && !toolsPaneExiting && toolsPaneEntered ? undefined : "none",
                }}
              >
                <FloatingWindow
                  open={toolsOpen || toolsPaneExiting}
                  docked
                  title="TOOLS/"
                  onClose={() => {
                    setTerminalEntries((prev) => [
                      ...prev,
                      { kind: "in", text: "exit" },
                      { kind: "out", text: "Closing TOOLS/..." },
                    ]);
                    setToolsPaneExiting(true);
                    if (typeof window !== "undefined") window.location.hash = "";
                  }}
                >
                  <ToolsWindowContent />
                </FloatingWindow>
              </div>
            </>
          )}
        </div>

        {/* Overlay sheet when viewport too small for split; fade in/out like CONTENT_VIEWPORT */}
        {(strategiesOpen || strategiesPaneExiting) && !useSplit && (
          <div
            className="fixed inset-0 z-40 transition-transform duration-1000"
            style={{
              top: "3.5rem",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              transform: strategiesOpen && !strategiesPaneExiting && strategiesPaneEntered ? "translateX(0)" : "translateX(100%)",
              pointerEvents: strategiesOpen && !strategiesPaneExiting && strategiesPaneEntered ? "auto" : "none",
            }}
          >
            <FloatingWindow
              open={strategiesOpen || strategiesPaneExiting}
              overlaySheet
              title="STRATEGIES/"
              onClose={() => {
                setTerminalEntries((prev) => [
                  ...prev,
                  { kind: "in", text: "exit" },
                  { kind: "out", text: "Closing STRATEGIES/..." },
                ]);
                setStrategiesPaneExiting(true);
                if (typeof window !== "undefined") window.location.hash = "";
              }}
            >
              <StrategiesWindowContent />
            </FloatingWindow>
          </div>
        )}

        {/* TOOLS/ overlay sheet when viewport too small for split */}
        {(toolsOpen || toolsPaneExiting) && !useSplit && (
          <div
            className="fixed inset-0 z-40 transition-transform duration-1000"
            style={{
              top: "3.5rem",
              transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
              transform: toolsOpen && !toolsPaneExiting && toolsPaneEntered ? "translateX(0)" : "translateX(100%)",
              pointerEvents: toolsOpen && !toolsPaneExiting && toolsPaneEntered ? "auto" : "none",
            }}
          >
            <FloatingWindow
              open={toolsOpen || toolsPaneExiting}
              overlaySheet
              title="TOOLS/"
              onClose={() => {
                setTerminalEntries((prev) => [
                  ...prev,
                  { kind: "in", text: "exit" },
                  { kind: "out", text: "Closing TOOLS/..." },
                ]);
                setToolsPaneExiting(true);
                if (typeof window !== "undefined") window.location.hash = "";
              }}
            >
              <ToolsWindowContent />
            </FloatingWindow>
          </div>
        )}

        {/* STRATEGIES/ folder button (hidden, component kept) */}
        {!strategiesOpen && (
          <div className="absolute top-6 right-12 z-50 pointer-events-none hidden">
            <div
              className={cn(
                "inline-block pointer-events-auto transition-all duration-300 relative",
                isStrategiesBlinking && "strategies-blink strategies-selected",
                "hover:-translate-y-2"
              )}
            >
              <button
                onClick={() => {
                  setIsStrategiesBlinking(true);
                  setStrategiesOpen(true);
                  setTimeout(() => setIsStrategiesBlinking(false), 1000);
                }}
                className="bg-panel/90 hover:bg-panel/80 transition-colors p-8 text-left focus:outline-none relative min-w-[200px]"
              >
                <div
                  className="absolute inset-0 bg-panel/10 border border-border/30"
                  style={{
                    clipPath: FOLDER_CLIP_PATH,
                    transform: "translate(8px, 8px)",
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    clipPath: FOLDER_CLIP_PATH,
                    opacity: 0.07,
                    backgroundImage: `repeating-linear-gradient(
                      0deg,
                      rgba(255, 255, 255, 0.08) 0px,
                      rgba(255, 255, 255, 0.08) 5px,
                      transparent 5px,
                      transparent 10px
                    )`,
                    backgroundSize: "100% 10px",
                    mixBlendMode: "overlay",
                  }}
                />
                <FolderSvg isSelected={strategiesOpen || isStrategiesBlinking} />
                <div className="font-mono font-bold text-white text-sm uppercase tracking-widest mb-2 relative z-10">
                  STRATEGIES/
                </div>
                <div className="text-xs text-text-dim font-mono relative z-10">
                  Open to view HEGEMON, EREBUS…
                </div>
              </button>
              <div
                className="absolute bottom-0 left-full w-[60px] h-px bg-border/30 pointer-events-none"
                aria-hidden
              />
            </div>
          </div>
        )}

      </div>
    </>
  );
}
