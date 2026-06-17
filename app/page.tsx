"use client";

import { GridKpi } from "@/components/ui/grid-kpi";
import { Button } from "@/components/ui/button";
import { GlitchTypeText, BlinkCaret } from "@/components/ui/animated-text";
import { PhosphorAfterimage } from "@/components/terminal/PhosphorAfterimage";
import { ActiveLineGlow } from "@/components/terminal/ActiveLineGlow";
import { MatrixRain } from "@/components/terminal/MatrixRain";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID } from "@/lib/constants/vaults";
import { useVaultMetadata, useVaultAllocations, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis, type KpiData } from "@/lib/morpho/view";
import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useLayoutEffect, useState, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import StrategiesWindowContent from "@/components/landing/StrategiesWindowContent";
import ToolsWindowContent from "@/components/tools/ToolsWindowContent";
import { FolderSvg, FOLDER_CLIP_PATH } from "@/components/ui/folder-svg";
import { useAccount, useBlockNumber, usePublicClient, useWalletClient, useChainId, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits, parseUnits, maxUint256, type Address } from "viem";
import { useHypePrice } from "@/lib/use-hype-price";
import { useIsMobile } from "@/lib/use-is-mobile";
import {
  getVaultAssetAddress,
  readBalances,
  readAssetMeta,
  readVaultDecimals,
  readAllowance,
  approveExact,
  deposit,
  withdraw,
  convertSharesToAssets,
} from "@/lib/web3/vault";
import { formatAmount, parseAmount } from "@/lib/web3/format";
import {
  getBalances,
  formatBalanceAmount,
  rawAmountToHuman,
  balanceToNumber,
  formatBalanceTable,
  balanceEntriesColumnFirst,
} from "@/lib/liquidswap/balances";
import {
  parseSwapCommand,
  parseWrapCommand,
  parseUnwrapCommand,
  resolveTokensForCli,
  routeTokenInAddress,
  shouldUnwrapHypeOut,
} from "@/lib/liquidswap/cli-swap";
import { fetchRoute, RouteError as LiquidSwapRouteError, type RouteQuote } from "@/lib/liquidswap/route";
import {
  getSwapIntent,
  buildExecutionPlan,
  executePlan,
  type SwapIntent,
} from "@/lib/liquidswap/plan";
import { NATIVE_HYPE_OUT_ADDRESS } from "@/lib/liquidswap/tokens";
import { ERC20_ABI } from "@/lib/web3/abis/erc20";
import {
  getTokenPricesUsd,
  addressForPricing,
  formatUsd,
} from "@/lib/pricing/dexscreener";
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
        title: "Morpho Reallocator - USDT0",
        status: "ACTIVE",
        access: "Public",
      },
      {
        id: "strategy-liq-protect",
        title: "Liquidation Execution",
        status: "ACTIVE",
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
  help: ["strategies", "tools", "HEGEMON", "EREBUS", "help", "MYRMIDONS", "socials", "clear", "status", "whoami", "history", "Tab", "Quick Reference", "Getting started", "Strategies", "Vault", "System", "Navigation"],
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
  ls: ["SYSTEM/", "STRATEGIES/", "TOOLS/", "HEGEMON", "EREBUS", "SWAP"],
  dir: ["SYSTEM/", "STRATEGIES/", "TOOLS/", "HEGEMON", "EREBUS", "SWAP"],
  status: ["HyperEVM", "OK", "Strategies"],
  version: ["MYRMIDONS", "v0.1"],
  ver: ["MYRMIDONS", "v0.1"],
  strategies: ["STRATEGIES/"],
  tools: ["TOOLS/", "SWAP", "ROUTE_READY", "NO_ROUTE", "QUOTING", "PAIR", "OUT", "MIN"],
  swap: ["TOOLS/", "SWAP", "ROUTE_READY", "NO_ROUTE", "QUOTING", "PAIR", "OUT", "MIN"],
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
  pwd: ["SYSTEM/", "STRATEGIES/", "TOOLS/", "HEGEMON", "EREBUS", "SWAP"],
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
  "uptime --since-genesis": ["uptime", "genesis"],
  achilles: ["ACHILLES", "Heel", "deterministic", "DM"],
  trojan: ["TROJAN", "payload"],
  sudo: ["Permission denied"],
  "rm -rf /": ["Action blocked", "INTEGRITY"],
  "ping myrmidons": ["PING", "OK", "Latency"],
  "echo $status": ["ONLINE"],
  "echo $fate": ["UNDETERMINED"],
  matrix: ["MATRIX"],
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
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="HEGEMON - MORPHO_REALLOCATOR" mode="text" />
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
            <GlitchTypeText key={`${fileId}-title`} loading={!revealEnabled || loadingStates[2]} value="EREBUS - LIQUIDATION_ENGINE" mode="text" />
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
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [hyperEvmBlock, setHyperEvmBlock] = useState<string | null>(null);
  const [isStrategiesBlinking, setIsStrategiesBlinking] = useState<boolean>(false);
  const [isToolsBlinking, setIsToolsBlinking] = useState<boolean>(false);
  const [useSplit, setUseSplit] = useState<boolean>(true);
  const isMobile = useIsMobile();
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
  const [matrixFlash, setMatrixFlash] = useState<boolean>(false);
  const [matrixMode, setMatrixMode] = useState<boolean>(false);
  const matrixRainTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerMatrixMode = useCallback(() => {
    if (matrixRainTimeoutRef.current) clearTimeout(matrixRainTimeoutRef.current);
    setMatrixMode(true);
    matrixRainTimeoutRef.current = setTimeout(() => {
      setMatrixMode(false);
      matrixRainTimeoutRef.current = null;
    }, 2000);
  }, []);
  const inputRef = useRef<HTMLInputElement>(null);
  const mirrorRef = useRef<HTMLSpanElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const prevEntriesLenRef = useRef(terminalEntries.length);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        if (document.activeElement === inputRef.current) return;
        return;
      }
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
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

  // Scroll log to bottom when entries change and as staggered reveal adds lines (so we keep following new output)
  useEffect(() => {
    if (!logRef.current) return;
    const el = logRef.current;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
  }, [terminalEntries.length, revealingLineIndex]);

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

  const appendTerminalLine = useCallback((text: string) => {
    setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
  }, []);

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
          { kind: "out", text: "HELP - strategies" },
          { kind: "out", text: "  open strategies/" },
          { kind: "out", text: "  open hegemon / open erebus" },
          { kind: "out", text: "  hegemon / erebus" },
          { kind: "out", text: "  back, pwd" },
        ];
      }
      if (topic === "vault") {
        return [
          { kind: "out", text: "HELP - vault" },
          { kind: "out", text: "  balance" },
          { kind: "out", text: "  deposit <amount>" },
          { kind: "out", text: "  withdraw <amount>" },
          { kind: "out", text: "  apr, tvl, vault stats" },
        ];
      }
      if (topic === "system") {
        return [
          { kind: "out", text: "HELP - system" },
          { kind: "out", text: "  status" },
          { kind: "out", text: "  network, block, gas" },
          { kind: "out", text: "  ping, rpc, uptime, time" },
          { kind: "out", text: "  version" },
        ];
      }
      if (topic === "identity") {
        return [
          { kind: "out", text: "HELP - identity" },
          { kind: "out", text: "  whoami" },
          { kind: "out", text: "  connect, disconnect" },
          { kind: "out", text: "  permissions" },
        ];
      }
      if (topic === "lore") {
        return [
          { kind: "out", text: "HELP - lore" },
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
        { kind: "out", text: "Opening STRATEGIES/ → HEGEMON (MORPHO_REALLOCATOR)..." },
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
        { kind: "out", text: "Opening STRATEGIES/ → HEGEMON (MORPHO_REALLOCATOR)..." },
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
        return [{ kind: "out", text: "STRATEGIES/" }];
      }
      return [{ kind: "out", text: "SYSTEM/" }];
    }

    if (cmd === "ls" || cmd === "dir") {
      return [
        { kind: "out", text: "SYSTEM/" },
        { kind: "out", text: "STRATEGIES/" },
        { kind: "out", text: "  HEGEMON" },
        { kind: "out", text: "  EREBUS" },
        { kind: "out", text: "TOOLS/" },
        { kind: "out", text: "  SWAP" },
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
        { kind: "out", text: "HyperEVM - Gas price" },
        { kind: "out", text: `  ${gwei} gwei (simple tx: ${usd})` },
      ];
    }

    if (cmd === "hype" || cmd === "hype price") {
      const price = opts.hypePriceUsd;
      if (price === null) return [{ kind: "out", text: "HYPE price: (fetching…)" }];
      return [
        { kind: "out", text: "HyperEVM - Native token (HYPE)" },
        { kind: "out", text: `  $${price.toFixed(2)} USD` },
      ];
    }

    if (cmd === "block") {
      const block = opts.blockNumber;
      const blockStr = block !== undefined ? block.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "—";
      return [
        { kind: "out", text: "HyperEVM - Latest block" },
        { kind: "out", text: `  ${blockStr}` },
      ];
    }

    if (cmd === "network" || cmd === "chain") {
      return [
        { kind: "out", text: "HyperEVM - Network" },
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
    // deposit <amount> / withdraw <amount> — handled async in handleCommandSubmit (direct vault tx)

    if (cmd === "deposit") {
      return [{ kind: "out", text: "Usage: deposit <amount|max|half> - e.g. deposit 20, deposit max" }];
    }
    if (cmd === "withdraw") {
      return [{ kind: "out", text: "Usage: withdraw <amount|max|half> - e.g. withdraw 100, withdraw max" }];
    }

    if (cmd === "apr" || cmd === "apy") {
      if (opts.vaultKpisLoading) return [{ kind: "out", text: "Fetching APR…" }];
      const pct = opts.vaultKpis?.netApyPct ?? "—";
      return [
        { kind: "out", text: "HEGEMON (USDT0) - Net APY" },
        { kind: "out", text: `  ${pct}` },
      ];
    }

    if (cmd === "tvl") {
      if (opts.vaultKpisLoading) return [{ kind: "out", text: "Fetching TVL…" }];
      const tvl = opts.vaultKpis?.tvlUsd ?? "—";
      return [
        { kind: "out", text: "HEGEMON (USDT0) - Total value locked" },
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
        { kind: "out", text: "HEGEMON (USDT0) - Vault stats" },
        { kind: "out", text: `  Net APY: ${apy}` },
        { kind: "out", text: `  TVL: ${tvl}` },
        { kind: "out", text: `  Avg utilization: ${util}` },
      ];
    }

    if (cmd === "help") {
      const pad = (s: string, w = 18) => s.padEnd(w);
      return [
        { kind: "out", text: "MYRMIDONS  Quick Reference" },
        { kind: "out", text: "" },
        { kind: "out", text: "  Getting started" },
        { kind: "out", text: `    ${pad("strategies")}Open the strategies panel` },
        { kind: "out", text: `    ${pad("tools / swap")}Open the tools panel` },
        { kind: "out", text: `    ${pad("help <topic>")}Dig deeper (strategies | vault | system)` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Strategies" },
        { kind: "out", text: `    ${pad("hegemon")}Open HEGEMON strategy` },
        { kind: "out", text: `    ${pad("erebus")}Open EREBUS strategy` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Vault" },
        { kind: "out", text: `    ${pad("balance")}Token + vault balances` },
        { kind: "out", text: `    ${pad("deposit <amt>")}Deposit into HEGEMON` },
        { kind: "out", text: `    ${pad("withdraw <amt>")}Withdraw from HEGEMON` },
        { kind: "out", text: "" },
        { kind: "out", text: "  System" },
        { kind: "out", text: `    ${pad("status")}System status` },
        { kind: "out", text: `    ${pad("gas / block")}Network info` },
        { kind: "out", text: `    ${pad("whoami")}Operator identity` },
        { kind: "out", text: `    ${pad("socials")}Links (X, Telegram, email)` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Navigation" },
        { kind: "out", text: `    ${pad("clear")}Clear log` },
        { kind: "out", text: `    ${pad("history")}Command history` },
        { kind: "out", text: `    ${pad("Tab")}Autocomplete` },
        { kind: "out", text: "" },
        { kind: "out", text: 'Type "help vault", "help strategies", or "help system" for full details.' },
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
        { kind: "out", text: "v0.1 - Initial operator console + strategies panel" },
        { kind: "out", text: "v0.1.1 - Live chain status commands" },
        { kind: "out", text: "v0.1.2 - Terminal UX + new command set" },
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
        { kind: "out", text: "  OBSERVE - Yield, utilization, exit liquidity, risk limits." },
        { kind: "out", text: "  DECIDE  - Regime detection, constraints, concentration caps, safety filters." },
        { kind: "out", text: "  EXECUTE - Automated onchain execution with thresholds and health checks." },
        { kind: "out", text: "" },
        { kind: "out", text: "Public strategies allow one-click deposits and exits. Private or developing strategies require explicit access." },
        { kind: "out", text: "Strategy logic and parameters are documented on each strategy's page." },
      ];
    }

    if (cmd === "socials" || cmd === "contact") {
      return [{ kind: "links", items: SOCIALS_LINKS }];
    }

    if (cmd === "uptime --since-genesis") {
      return [
        { kind: "out", text: "SYSTEM UPTIME" },
        { kind: "out", text: "Genesis block: 1" },
        { kind: "out", text: "Status: still running." },
      ];
    }

    if (cmd === "achilles") {
      const tgLink = SOCIALS_LINKS.find((l) => l.href.includes("t.me"));
      return [
        { kind: "out", text: "ACHILLES" },
        { kind: "out", text: "Armor: optional" },
        { kind: "out", text: "Heel: monitored" },
        { kind: "out", text: "Outcome: deterministic" },
        { kind: "out", text: "DM:" },
        ...(tgLink ? [{ kind: "links" as const, items: [tgLink] }] : []),
      ];
    }

    if (cmd === "trojan") {
      return [
        { kind: "out", text: "TROJAN VECTOR" },
        { kind: "out", text: "No payload detected." },
      ];
    }

    if (cmd === "sudo") {
      return [
        { kind: "out", text: "Permission denied." },
        { kind: "out", text: "This incident will not be reported." },
      ];
    }

    if (/^rm\s+-rf\s+\/$/.test(cmd)) {
      return [
        { kind: "out", text: "Action blocked." },
        { kind: "out", text: "SYSTEM INTEGRITY PRESERVED." },
      ];
    }

    if (cmd === "ping myrmidons") {
      return [
        { kind: "out", text: "PING MYRMIDONS" },
        { kind: "out", text: "Response: OK" },
        { kind: "out", text: "Latency: acceptable" },
      ];
    }

    if (cmd === "echo $status") {
      return [{ kind: "out", text: "ONLINE" }];
    }

    if (cmd === "echo $fate") {
      return [{ kind: "out", text: "UNDETERMINED" }];
    }

    if (cmd === "matrix") {
      return [
        { kind: "out", text: "Wake up, Neo..." },
        { kind: "out", text: "The Matrix has you..." },
        { kind: "out", text: "Follow the white rabbit." },
      ];
    }

    if (cmd === "bf6" || cmd === "bf6?") {
      return [{ kind: "out", text: "go" }];
    }

    return [{ kind: "out", text: "Command not found. Type 'help' for available commands." }];
  };

  const handleCommandSubmit = (override?: string) => {
    const raw = (override ?? commandInput).trim();
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
      const force = cmd === "balance refresh";
      const publicClientRef = publicClient;
      const chainIdRef = chainId;
      getBalances(address)
        .then(async ({ balances, fromCache }) => {
          const lines: TerminalOut[] = [];
          lines.push({ kind: "out", text: "BALANCE // EVM_TOKENS" });
          if (balances.length === 0) {
            lines.push({ kind: "out", text: "" });
          } else {
            const addressesForPricing = balances.map((b) => addressForPricing(b.address));
            let prices: Record<string, number | null> = {};
            try {
              prices = await getTokenPricesUsd(addressesForPricing);
            } catch {
              // continue without USD
            }
            const withUsd = balances.map((b) => {
              const amountStr = formatBalanceAmount(b.balanceRaw, b.decimals);
              const amountNum = balanceToNumber(b.balanceRaw, b.decimals);
              const priceUsd = prices[addressForPricing(b.address)] ?? null;
              const usdValue =
                priceUsd != null && Number.isFinite(amountNum) ? amountNum * priceUsd : null;
              return { balance: b, amountStr, usdValue };
            });
            withUsd.sort((a, b) => {
              const aVal = a.usdValue;
              const bVal = b.usdValue;
              if (aVal == null && bVal == null) return 0;
              if (aVal == null) return 1;
              if (bVal == null) return -1;
              return bVal - aVal;
            });
            const dustThreshold = 1;
            const aboveDust = withUsd.filter(
              (x) => x.usdValue == null || x.usdValue >= dustThreshold
            );
            const maxBalanceEntries = 14;
            const capped = aboveDust.slice(0, maxBalanceEntries);
            const tableEntries = capped.map(({ balance, amountStr, usdValue }) => ({
              symbol: balance.symbol,
              formattedAmount: amountStr,
              usdFormatted: usdValue != null ? formatUsd(usdValue) : null,
            }));
            const columns = 2;
            const columnFirst = balanceEntriesColumnFirst(tableEntries, columns);
            for (const text of formatBalanceTable(columnFirst, columns)) {
              lines.push({ kind: "out", text });
            }
            lines.push({ kind: "out", text: "" });
          }
          lines.push({ kind: "out", text: "BALANCE // VAULT" });
          let vaultDataForLine: { vaultShareBalance: bigint; vaultDecimals: number } | null = null;
          if (publicClientRef && chainIdRef === USDT0_VAULT_CHAIN_ID) {
            try {
              const assetAddress = await getVaultAssetAddress(
                USDT0_VAULT_ADDRESS as Address,
                publicClientRef
              );
              const [balances, vaultDecimals] = await Promise.all([
                readBalances({
                  account: address as Address,
                  assetAddress,
                  vaultAddress: USDT0_VAULT_ADDRESS as Address,
                  publicClient: publicClientRef,
                }),
                readVaultDecimals(USDT0_VAULT_ADDRESS as Address, publicClientRef),
              ]);
              vaultDataForLine = {
                vaultShareBalance: balances.vaultShareBalance,
                vaultDecimals,
              };
              const assetMeta = await readAssetMeta(assetAddress, publicClientRef);
              setVaultBalanceData({
                assetBalance: balances.assetBalance,
                vaultShareBalance: balances.vaultShareBalance,
                assetSymbol: assetMeta.symbol,
                assetDecimals: assetMeta.decimals,
                vaultDecimals,
              });
            } catch {
              // leave vaultDataForLine null, show UNAVAILABLE
            }
          }
          if (vaultDataForLine) {
            lines.push({
              kind: "out",
              text: `MYRMIDONS_USD₮0  ${formatAmount(vaultDataForLine.vaultShareBalance, vaultDataForLine.vaultDecimals)}`,
            });
          } else {
            const fallback = vaultBalanceData;
            if (fallback) {
              lines.push({
                kind: "out",
                text: `MYRMIDONS_USD₮0  ${formatAmount(fallback.vaultShareBalance, fallback.vaultDecimals)}`,
              });
            } else {
              lines.push({ kind: "out", text: "MYRMIDONS_USD₮0  UNAVAILABLE" });
            }
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

    // deposit <amount> — direct deposit USDT0 into HEGEMON vault (amount: number, max, or half)
    const depositMatch = raw.trim().toLowerCase().match(/^deposit\s+(.+)$/);
    if (depositMatch) {
      const amountStr = depositMatch[1].trim();
      const isMaxOrHalf = amountStr === "max" || amountStr === "half";
      const isValidNumeric = amountStr && /^\d+(\.\d*)?$/.test(amountStr);
      if (!amountStr || (!isValidNumeric && !isMaxOrHalf)) {
        setCommandHistory((prev) => [...prev, raw].slice(-20));
        setCommandHistoryIndex(-1);
        setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
        setCommandInput("");
        setSelectionStart(0);
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "VAULT // ERROR  INVALID_AMOUNT" }]);
        return;
      }
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!address || !walletClient?.account || !publicClient) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "VAULT // ERROR  WALLET_REQUIRED" }]);
        return;
      }
      if (chainId !== USDT0_VAULT_CHAIN_ID) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "VAULT // ERROR  WRONG_NETWORK" }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          const vaultAddress = USDT0_VAULT_ADDRESS as Address;
          const assetAddress = await getVaultAssetAddress(vaultAddress, publicClient);
          const assetMeta = await readAssetMeta(assetAddress, publicClient);
          const balances = await readBalances({
            account: address as Address,
            assetAddress,
            vaultAddress,
            publicClient,
          });
          let parsedAssets: bigint;
          if (amountStr === "max") {
            parsedAssets = balances.assetBalance;
          } else if (amountStr === "half") {
            parsedAssets = balances.assetBalance / 2n;
          } else {
            try {
              parsedAssets = parseAmount(amountStr, assetMeta.decimals);
            } catch {
              append("VAULT // ERROR  INVALID_AMOUNT");
              return;
            }
          }
          if (parsedAssets === 0n) {
            append("VAULT // ERROR  INSUFFICIENT_BALANCE");
            return;
          }
          if (parsedAssets > balances.assetBalance) {
            append("VAULT // ERROR  INSUFFICIENT_BALANCE");
            return;
          }
          const allowance = await readAllowance({
            owner: address as Address,
            assetAddress,
            spender: vaultAddress,
            publicClient,
          });
          if (parsedAssets > allowance) {
            append("VAULT // APPROVAL_REQUIRED");
            const approveHash = await approveExact({
              assetAddress,
              spender: vaultAddress,
              amount: parsedAssets,
              walletClient: walletClient!,
              publicClient,
            });
            const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
            if (approveReceipt.status === "reverted") {
              append("VAULT // ERROR  APPROVAL_REVERTED");
              return;
            }
            append("VAULT // APPROVED");
          }
          const depositHash = await deposit({
            vaultAddress,
            assets: parsedAssets,
            receiver: address as Address,
            walletClient: walletClient!,
          });
          append("VAULT // DEPOSIT_SUBMITTED");
          const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
          if (depositReceipt.status === "reverted") {
            append(`VAULT // ERROR  DEPOSIT_REVERTED  ${depositHash}`);
            return;
          }
          append(`VAULT // DEPOSIT_CONFIRMED  ${depositHash}`);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: address! } }));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/reject|denied|user denied/i.test(msg)) append("VAULT // ERROR  SIGN_REJECTED");
          else append("VAULT // ERROR  UNKNOWN");
        }
      })();
      return;
    }

    // withdraw <amount> — direct withdraw vault shares (HEGEMON) (amount: number, max, or half)
    const withdrawMatch = raw.trim().toLowerCase().match(/^withdraw\s+(.+)$/);
    if (withdrawMatch) {
      const amountStr = withdrawMatch[1].trim();
      const isMaxOrHalf = amountStr === "max" || amountStr === "half";
      const isValidNumeric = amountStr && /^\d+(\.\d*)?$/.test(amountStr);
      if (!amountStr || (!isValidNumeric && !isMaxOrHalf)) {
        setCommandHistory((prev) => [...prev, raw].slice(-20));
        setCommandHistoryIndex(-1);
        setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
        setCommandInput("");
        setSelectionStart(0);
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "VAULT // ERROR  INVALID_AMOUNT" }]);
        return;
      }
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!address || !walletClient?.account || !publicClient) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "VAULT // ERROR  WALLET_REQUIRED" }]);
        return;
      }
      if (chainId !== USDT0_VAULT_CHAIN_ID) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "VAULT // ERROR  WRONG_NETWORK" }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          const vaultAddress = USDT0_VAULT_ADDRESS as Address;
          const assetAddress = await getVaultAssetAddress(vaultAddress, publicClient);
          const [vaultDecimals, balances] = await Promise.all([
            readVaultDecimals(vaultAddress, publicClient),
            readBalances({
              account: address as Address,
              assetAddress,
              vaultAddress,
              publicClient,
            }),
          ]);
          let parsedShares: bigint;
          if (amountStr === "max") {
            parsedShares = balances.vaultShareBalance;
          } else if (amountStr === "half") {
            parsedShares = balances.vaultShareBalance / 2n;
          } else {
            try {
              parsedShares = parseAmount(amountStr, vaultDecimals);
            } catch {
              append("VAULT // ERROR  INVALID_AMOUNT");
              return;
            }
          }
          if (parsedShares === 0n) {
            append("VAULT // ERROR  INSUFFICIENT_BALANCE");
            return;
          }
          if (parsedShares > balances.vaultShareBalance) {
            append("VAULT // ERROR  INSUFFICIENT_BALANCE");
            return;
          }
          const assetsAmount = await convertSharesToAssets({
            vaultAddress,
            shares: parsedShares,
            publicClient,
          });
          const withdrawHash = await withdraw({
            vaultAddress,
            assets: assetsAmount,
            receiver: address as Address,
            owner: address as Address,
            walletClient: walletClient!,
          });
          append("VAULT // WITHDRAW_SUBMITTED");
          const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
          if (withdrawReceipt.status === "reverted") {
            append(`VAULT // ERROR  WITHDRAW_REVERTED  ${withdrawHash}`);
            return;
          }
          append(`VAULT // WITHDRAW_CONFIRMED  ${withdrawHash}`);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: address! } }));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/reject|denied|user denied/i.test(msg)) append("VAULT // ERROR  SIGN_REJECTED");
          else append("VAULT // ERROR  UNKNOWN");
        }
      })();
      return;
    }

    // wrap <amount> HYPE — wrap only (no LiquidSwap)
    if (raw.trim().toLowerCase().startsWith("wrap ")) {
      const wrapParsed = parseWrapCommand(raw);
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!wrapParsed.ok) {
        const errText =
          wrapParsed.error === "INVALID_AMOUNT" && "value" in wrapParsed && wrapParsed.value != null
            ? `SWAP // ERROR  INVALID_AMOUNT ${wrapParsed.value}`
            : wrapParsed.error === "INVALID_COMMAND"
              ? "SWAP // ERROR  INVALID_COMMAND"
              : "SWAP // ERROR  INVALID_SYNTAX";
        setTerminalEntries((prev) => [...prev, { kind: "out", text: errText }]);
        return;
      }
      if (!address || !walletClient?.account || !publicClient) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "SWAP // ERROR  WALLET_REQUIRED" }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          if (wrapParsed.quoteOnly) {
            append("SWAP // WRAP_ONLY");
            append("RATE: 1:1");
            return;
          }
          const amountRaw = parseUnits(wrapParsed.amount, 18);
          const plan = buildExecutionPlan("WRAP_ONLY", amountRaw);
          const result = await executePlan(plan, {
            walletClient: walletClient!,
            publicClient,
            account: walletClient!.account!.address,
            onLog: append,
          });
          if (result.success) {
            append("SWAP // BALANCES_REFRESHED");
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: address! } }));
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/reject|denied|user denied/i.test(msg)) append("SWAP // ERROR  SIGN_REJECTED");
          else append("SWAP // ERROR  UNKNOWN");
        }
      })();
      return;
    }

    // unwrap <amount> WHYPE — unwrap only (no LiquidSwap)
    if (raw.trim().toLowerCase().startsWith("unwrap ")) {
      const unwrapParsed = parseUnwrapCommand(raw);
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!unwrapParsed.ok) {
        const errText =
          unwrapParsed.error === "INVALID_AMOUNT" && "value" in unwrapParsed && unwrapParsed.value != null
            ? `SWAP // ERROR  INVALID_AMOUNT ${unwrapParsed.value}`
            : unwrapParsed.error === "INVALID_COMMAND"
              ? "SWAP // ERROR  INVALID_COMMAND"
              : "SWAP // ERROR  INVALID_SYNTAX";
        setTerminalEntries((prev) => [...prev, { kind: "out", text: errText }]);
        return;
      }
      if (!address || !walletClient?.account || !publicClient) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "SWAP // ERROR  WALLET_REQUIRED" }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          if (unwrapParsed.quoteOnly) {
            append("SWAP // UNWRAP_ONLY");
            append("RATE: 1:1");
            return;
          }
          const amountRaw = parseUnits(unwrapParsed.amount, 18);
          const plan = buildExecutionPlan("UNWRAP_ONLY", amountRaw);
          const result = await executePlan(plan, {
            walletClient: walletClient!,
            publicClient,
            account: walletClient!.account!.address,
            onLog: append,
          });
          if (result.success) {
            append("SWAP // BALANCES_REFRESHED");
            if (typeof window !== "undefined") {
              window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: address! } }));
            }
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/reject|denied|user denied/i.test(msg)) append("SWAP // ERROR  SIGN_REJECTED");
          else append("SWAP // ERROR  UNKNOWN");
        }
      })();
      return;
    }

    // swap / swap quote CLI — async LiquidSwap quote or execution
    if (cmd.startsWith("swap ") && cmd !== "swap") {
      const parsed = parseSwapCommand(raw);
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!parsed.ok) {
        const errText =
          parsed.error === "INVALID_AMOUNT" && "value" in parsed && parsed.value != null
            ? `SWAP // ERROR  INVALID_AMOUNT ${parsed.value}`
            : "SWAP // ERROR  INVALID_SYNTAX";
        setTerminalEntries((prev) => [...prev, { kind: "out", text: errText }]);
        return;
      }
      const needWallet = !parsed.quoteOnly || parsed.amount === "half" || parsed.amount === "max";
      if (needWallet && !address) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: "SWAP // ERROR  WALLET_REQUIRED" }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          const resolved = await resolveTokensForCli(parsed.inToken, parsed.outToken);
          if ("error" in resolved) {
            if (resolved.error === "NO_OP") {
              append("SWAP // ERROR  NO_OP");
            } else {
              append(`SWAP // ERROR  UNKNOWN_TOKEN  ${resolved.input}`);
            }
            return;
          }
          const { tokenIn, tokenOut } = resolved;
          const intent: SwapIntent = getSwapIntent(tokenIn.address, tokenOut.address);
          const slippagePercent = 0.5;
          const tokenInAddrForRoute = routeTokenInAddress(tokenIn);
          const tokenOutAddrForRoute = tokenOut.address;
          const unwrapWHYPE = shouldUnwrapHypeOut(tokenOut);

          const balanceFindKey = (b: { address: string }) =>
            tokenIn.address.toLowerCase() === NATIVE_HYPE_OUT_ADDRESS.toLowerCase()
              ? b.address === "NATIVE_HYPE"
              : b.address.toLowerCase() === tokenIn.address.toLowerCase();

          let amountHuman: string;
          if (parsed.amount === "half" || parsed.amount === "max") {
            const { balances: balList } = await getBalances(address!);
            const inBalance = balList.find(balanceFindKey);
            if (!inBalance || !inBalance.balanceRaw || inBalance.balanceRaw === "0") {
              append("SWAP // ERROR  INSUFFICIENT_BALANCE");
              return;
            }
            const balanceRawBig = BigInt(inBalance.balanceRaw);
            const amountRaw =
              parsed.amount === "half" ? balanceRawBig / 2n : balanceRawBig;
            amountHuman = rawAmountToHuman(String(amountRaw), tokenIn.decimals);
            if (amountHuman === "0" || parseFloat(amountHuman) === 0) {
              append("SWAP // ERROR  AMOUNT_TOO_SMALL");
              return;
            }
          } else {
            amountHuman = parsed.amount;
          }

          if (parsed.quoteOnly) {
            if (intent === "WRAP_ONLY") {
              append("SWAP // WRAP_ONLY");
              append("RATE: 1:1");
              return;
            }
            if (intent === "UNWRAP_ONLY") {
              append("SWAP // UNWRAP_ONLY");
              append("RATE: 1:1");
              return;
            }
            append("SWAP // QUOTING...");
            let route: RouteQuote;
            try {
              route = await fetchRoute(
                tokenInAddrForRoute,
                tokenOutAddrForRoute,
                amountHuman,
                slippagePercent,
                { unwrapWHYPE }
              );
            } catch (err) {
              append("SWAP // ERROR  ROUTE_FAILED");
              return;
            }
            if (!route.success || !route.execution?.details) {
              const msg = typeof route.message === "string" ? route.message : "No route";
              append(`SWAP // NO_ROUTE  ${msg}`);
              return;
            }
            const outDecQuote = route.tokens?.tokenOut?.decimals ?? 18;
            const outFormattedQuote = formatBalanceAmount(route.execution.details.amountOut ?? "0", outDecQuote);
            const minFormattedQuote = formatBalanceAmount(route.execution.details.minAmountOut, outDecQuote);
            append("SWAP // QUOTE");
            append(`PAIR: ${tokenIn.symbol} -> ${tokenOut.symbol}  IN: ${amountHuman}`);
            append(`OUT: ${outFormattedQuote}`);
            append(`MIN: ${minFormattedQuote}`);
            return;
          }

          // Execution: build plan and execute
          let route: RouteQuote | undefined;
          if (intent === "WRAP_THEN_SWAP" || intent === "SWAP_THEN_UNWRAP" || intent === "SWAP_ONLY") {
            append("SWAP // QUOTING...");
            try {
              route = await fetchRoute(
                tokenInAddrForRoute,
                tokenOutAddrForRoute,
                amountHuman,
                slippagePercent,
                { unwrapWHYPE }
              );
            } catch (err) {
              append("SWAP // ERROR  ROUTE_FAILED");
              return;
            }
            if (!route.success || !route.execution?.details) {
              append("SWAP // ERROR  NO_ROUTE");
              return;
            }
            const outDec = route.tokens?.tokenOut?.decimals ?? 18;
            const outFormatted = formatBalanceAmount(route.execution.details.amountOut ?? "0", outDec);
            const minFormatted = formatBalanceAmount(route.execution.details.minAmountOut, outDec);
            append(`SWAP // ROUTE_READY  PAIR: ${tokenIn.symbol} -> ${tokenOut.symbol}  IN: ${amountHuman}  OUT: ${outFormatted}  MIN: ${minFormatted}`);
          }

          const amountRaw = parseUnits(amountHuman, tokenIn.decimals);
          const plan = buildExecutionPlan(intent, amountRaw, route);
          if (plan.length === 0) {
            if (intent === "NO_OP") {
              append("SWAP // ERROR  NO_OP");
            } else {
              append("SWAP // ERROR  INVALID_EXECUTION_PLAN");
            }
            return;
          }

          if (!walletClient?.account || !publicClient) {
            append("SWAP // ERROR  WALLET_REQUIRED");
            return;
          }

          const approveIfNeeded = async (params: {
            tokenAddress: Address;
            spender: Address;
            amountRaw: bigint;
          }) => {
            const allowance = await readAllowance({
              owner: address! as Address,
              assetAddress: params.tokenAddress,
              spender: params.spender,
              publicClient,
            });
            if (allowance >= params.amountRaw) return;
            append("SWAP // APPROVING...");
            const hash = await walletClient.writeContract({
              account: walletClient.account,
              address: params.tokenAddress,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [params.spender, maxUint256],
            });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status === "reverted") {
              throw new Error("APPROVE_REVERTED");
            }
            append("SWAP // APPROVED");
          };

          try {
            const result = await executePlan(plan, {
              walletClient,
              publicClient,
              account: walletClient.account.address,
              onLog: append,
              approveIfNeeded,
            });
            if (result.success) {
              append("SWAP // BALANCES_REFRESHED");
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("balances-refreshed", { detail: { wallet: address! } })
                );
              }
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/reject|denied|user denied/i.test(msg)) append("SWAP // ERROR  SIGN_REJECTED");
            else if (msg === "APPROVE_REVERTED") append("SWAP // ERROR  APPROVE_REVERTED");
            else append("SWAP // ERROR  UNKNOWN");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (err instanceof LiquidSwapRouteError) append("SWAP // ERROR  ROUTE_FAILED");
          else if (/reject|denied|user denied/i.test(msg)) append("SWAP // ERROR  SIGN_REJECTED");
          else append("SWAP // ERROR  UNKNOWN");
        }
      })();
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
    if (cmd === "matrix") {
      setMatrixFlash(true);
      setTimeout(() => setMatrixFlash(false), 2000);
      triggerMatrixMode();
    }
    if (cmd === "connect" && !address && openConnectModal) openConnectModal();
    if (cmd === "disconnect" && address && disconnect) disconnect();
  };

  const BOOT_HEADER = [
    "███╗░░░███╗██╗░░░██╗██████╗░███╗░░░███╗██╗██████╗░░█████╗░███╗░░██╗░██████╗",
    "████╗░████║╚██╗░██╔╝██╔══██╗████╗░████║██║██╔══██╗██╔══██╗████╗░██║██╔════╝",
    "██╔████╔██║░╚████╔╝░██████╔╝██╔████╔██║██║██║░░██║██║░░██║██╔██╗██║╚█████╗░",
    "██║╚██╔╝██║░░╚██╔╝░░██╔══██╗██║╚██╔╝██║██║██║░░██║██║░░██║██║╚████║░╚═══██╗",
    "██║░╚═╝░██║░░░██║░░░██║░░██║██║░╚═╝░██║██║██████╔╝╚█████╔╝██║░╚███║██████╔╝",
    "╚═╝░░░░░╚═╝░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░░░░╚═╝╚═╝╚═════╝░░╚════╝░╚═╝░░╚══╝╚═════╝░",
    "",
    "MYRMIDONS OS v0.9.3",
    "",
    "Copyright (c) 2026 Myrmidons Strategies",
    "",
    "initializing runtime environment...",
  ];

  const BOOT_STEPS = [
    "allocating memory blocks ........ OK",
    "binding operator context ........ OK",
    "resolving chain endpoint ........ HYPEREVM",
    "synchronizing block height ......",
    "mounting /STRATEGIES ............ READY",
    "mounting /TOOLS ................. READY",
    "verifying integrity ............. PASSED",
    "entering interactive shell...",
  ];

  // Fetch HyperEVM block height on mount (non-blocking, 600ms abort)
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600);

    (async () => {
      try {
        const res = await fetch("https://rpc.hyperliquid.xyz/evm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }),
          signal: controller.signal,
        });
        const json = await res.json();
        const hex = json?.result;
        if (typeof hex !== "string") return;
        const n = Number.parseInt(hex, 16);
        if (!Number.isFinite(n)) return;
        setHyperEvmBlock(n.toLocaleString("en-US"));
      } catch { /* boot must not depend on this */ } finally {
        clearTimeout(timeout);
      }
    })();

    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);

  // Rewrite block height line in-place when data arrives
  useEffect(() => {
    if (!showBootOverlay || !hyperEvmBlock) return;
    setBootLines(prev => {
      const idx = prev.findIndex(l => l.startsWith("synchronizing block height ......"));
      if (idx === -1) return prev;
      const copy = [...prev];
      copy[idx] = `synchronizing block height ...... ${hyperEvmBlock} OK`;
      return copy;
    });
  }, [hyperEvmBlock, showBootOverlay]);

  // Landing boot effect - shows on every page load/hard refresh
  useEffect(() => {
    if (!showBootOverlay) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const HEADER_INTERVAL = 30;
    const STEP_INTERVAL = 70;

    BOOT_HEADER.forEach((line, i) => {
      timers.push(setTimeout(() => {
        setBootLines(prev => [...prev, line]);
      }, i * HEADER_INTERVAL));
    });

    const stepsStart = (BOOT_HEADER.length - 1) * HEADER_INTERVAL + HEADER_INTERVAL + 80;
    BOOT_STEPS.forEach((line, i) => {
      timers.push(setTimeout(() => {
        setBootLines(prev => [...prev, line]);
      }, stepsStart + i * STEP_INTERVAL));
    });

    const totalDuration = stepsStart + BOOT_STEPS.length * STEP_INTERVAL + 140;
    timers.push(setTimeout(() => setShowBootOverlay(false), totalDuration));

    return () => timers.forEach(clearTimeout);
  }, [showBootOverlay]);

  // Start glitch text reveal after boot overlay ends
  useEffect(() => {
    if (!showBootOverlay) {
      const t = setTimeout(() => setLandingReveal(true), 80);
      return () => clearTimeout(t);
    }
  }, [showBootOverlay]);

  return (
    <>
      {matrixMode && <MatrixRain columns={28} />}
      {showBootOverlay && (
        <div className="fixed inset-0 z-[100] bg-bg-base pointer-events-none flex items-start justify-start overflow-hidden">
          <div className="p-4 sm:p-6 font-mono whitespace-pre leading-snug">
            {/* ASCII wordmark is illegible + overflows on phones — show a clean brand title on mobile */}
            {isMobile ? (
              <div className="font-brand text-3xl font-bold tracking-wide text-white mb-3 glow-gold">
                MYRMIDONS
              </div>
            ) : (
              <div className="text-white" style={{ fontSize: "0.54rem", lineHeight: 2.2 }}>{bootLines.slice(0, 7).join("\n")}</div>
            )}
            <div className="text-xs text-text-dim">
              {bootLines.slice(7).map((line, i) => {
                const suffixes: [RegExp, string][] = [
                  [/\d[\d,]+ OK$/, "text-success glow-green"],
                  [/\bOK$/, "text-success glow-green"],
                  [/\bPASSED$/, "text-success glow-green"],
                  [/\bREADY$/, "text-success glow-green"],
                  [/\bHYPEREVM$/, "text-gold glow-gold"],
                ];
                for (const [re, cls] of suffixes) {
                  const m = line.match(re);
                  if (m) {
                    const idx = m.index!;
                    return (
                      <div key={i}>
                        {line.slice(0, idx)}
                        <span className={cls}>{line.slice(idx)}</span>
                      </div>
                    );
                  }
                }
                return <div key={i}>{line || "\u00A0"}</div>;
              })}
              <BlinkCaret />
            </div>
          </div>
        </div>
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
        <div ref={logRef} className={cn("flex-1 overflow-y-auto p-4 font-mono text-xs min-h-0", matrixFlash && "terminal-matrix-flash")}>
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
                const cmdKey = getCmdKey(i);
                const swapTerms = HIGHLIGHT_TERMS["swap"];
                const terms =
                  HIGHLIGHT_TERMS[cmdKey] ??
                  (/^rm\s+-rf\s+\/$/.test(cmdKey) ? HIGHLIGHT_TERMS["rm -rf /"] : undefined) ??
                  (e.text.startsWith("VAULT // ") ? ["VAULT"] : undefined) ??
                  (cmdKey.startsWith("swap ") ? swapTerms : undefined) ??
                  (cmdKey.startsWith("wrap ") ? swapTerms : undefined) ??
                  (cmdKey.startsWith("unwrap ") ? swapTerms : undefined) ??
                  (cmdKey.startsWith("deposit ") ? ["VAULT"] : undefined) ??
                  (cmdKey.startsWith("withdraw ") ? ["VAULT"] : undefined) ??
                  (e.text.includes("help") ? ["help"] : []);
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
                // SWAP / TX result lines: status-based coloring; tx hashes link to explorer
                const TX_HASH_REGEX = /(0x[a-fA-F0-9]{64})/g;
                const linkifyTxHashes = (text: string) => {
                  const parts = text.split(TX_HASH_REGEX);
                  if (parts.length === 1) return text;
                  return (
                    <>
                      {parts.map((part, i) =>
                        part.match(/^0x[a-fA-F0-9]{64}$/) ? (
                          <a
                            key={i}
                            href={`https://hyperevmscan.io/tx/${part}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gold font-mono text-xs underline transition-colors"
                          >
                            {part}
                          </a>
                        ) : (
                          part
                        )
                      )}
                    </>
                  );
                };
                const swapPrefix = "SWAP // ";
                const vaultPrefix = "VAULT // ";
                const isTxConfirmed = e.text.startsWith("SWAP // TX_CONFIRMED");
                const isTxReverted = e.text.startsWith("SWAP // TX_REVERTED");
                const isSwapLine = e.text.startsWith(swapPrefix);
                const isVaultLine = e.text.startsWith(vaultPrefix);
                let swapContent: ReactNode = null;
                let vaultContent: ReactNode = null;
                if (isTxConfirmed) {
                  swapContent = (
                    <span className="font-mono text-xs text-success glow-green whitespace-pre">
                      {linkifyTxHashes(e.text)}
                    </span>
                  );
                } else if (isTxReverted) {
                  swapContent = (
                    <span className="font-mono text-xs text-danger glow-red whitespace-pre">
                      {linkifyTxHashes(e.text)}
                    </span>
                  );
                } else if (isVaultLine) {
                  const afterPrefix = e.text.slice(vaultPrefix.length);
                  const spaceIdx = afterPrefix.indexOf(" ");
                  const firstWord = spaceIdx >= 0 ? afterPrefix.slice(0, spaceIdx) : afterPrefix;
                  const rest = spaceIdx >= 0 ? afterPrefix.slice(spaceIdx) : "";
                  const firstWordClass =
                    firstWord === "ERROR" || firstWord.startsWith("ERROR") || firstWord.includes("REVERTED") || firstWord.includes("REJECTED")
                      ? "text-danger glow-red"
                      : firstWord.includes("CONFIRMED") || firstWord === "APPROVED"
                        ? "text-success glow-green"
                        : "text-text-dim";
                  vaultContent = (
                    <span className="font-mono text-xs whitespace-pre">
                      {renderSegments(vaultPrefix)}
                      <span className={firstWordClass}>{firstWord}</span>
                      {rest ? <span className="text-text-dim">{linkifyTxHashes(rest)}</span> : null}
                    </span>
                  );
                } else if (e.text.match(TX_HASH_REGEX)) {
                  swapContent = (
                    <span className="font-mono text-xs text-text-dim whitespace-pre">
                      {linkifyTxHashes(e.text)}
                    </span>
                  );
                } else if (isSwapLine) {
                  const afterPrefix = e.text.slice(swapPrefix.length);
                  const spaceIdx = afterPrefix.indexOf(" ");
                  const firstWord = spaceIdx >= 0 ? afterPrefix.slice(0, spaceIdx) : afterPrefix;
                  const rest = spaceIdx >= 0 ? afterPrefix.slice(spaceIdx) : "";
                  const firstWordClass =
                    firstWord === "ERROR" || firstWord.startsWith("ERROR")
                      ? "text-danger glow-red"
                      : firstWord === "ROUTE_READY"
                        ? "text-success"
                        : "text-text-dim";
                  swapContent = (
                    <span className="font-mono text-xs whitespace-pre">
                      {renderSegments(swapPrefix)}
                      <span className={firstWordClass}>{firstWord}</span>
                      {rest ? <span className="text-text-dim">{rest}</span> : null}
                    </span>
                  );
                }
                return wrapWithGlow(
                  <div className="flex gap-2 text-text-dim pl-4">
                    <span className="text-border shrink-0 select-none">&gt;</span>
                    {isEmpty ? (
                      <span className="min-h-[1em]" aria-hidden />
                    ) : swapContent ? (
                      swapContent
                    ) : vaultContent ? (
                      vaultContent
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

        {/* Mobile-only command chips + history nav (replaces Tab autocomplete / arrow keys on touch) */}
        {isMobile && (
          <div className="shrink-0 border-t border-border/30 bg-bg-base flex items-stretch gap-1 px-2 py-1.5">
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                aria-label="Previous command"
                onClick={() => {
                  if (commandHistory.length === 0) return;
                  if (commandHistoryIndex === 0) return;
                  const nextIndex = commandHistoryIndex === -1 ? commandHistory.length - 1 : commandHistoryIndex - 1;
                  setCommandHistoryIndex(nextIndex);
                  setCommandInput(commandHistory[nextIndex]);
                  setSelectionStart(commandHistory[nextIndex].length);
                  inputRef.current?.focus();
                }}
                className="border border-border text-text-dim px-2.5 py-1 text-[11px] font-bold active:bg-border/30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label="Next command"
                onClick={() => {
                  if (commandHistoryIndex < 0) return;
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
                  inputRef.current?.focus();
                }}
                className="border border-border text-text-dim px-2.5 py-1 text-[11px] font-bold active:bg-border/30"
              >
                ▼
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto [-webkit-overflow-scrolling:touch] no-scrollbar">
              {["help", "strategies", "tools", "hegemon", "erebus", "status", "balance", "vault stats"].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => handleCommandSubmit(c)}
                  className="shrink-0 border border-border text-gold/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap active:bg-gold/10"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

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
                } else if (e.key === "Tab") {
                  e.preventDefault();
                  const prefix = commandInput.toLowerCase();
                  if (!prefix) return;
                  const match =
                    SUGGEST_POOL.find((c) => c.startsWith(prefix)) ??
                    SUGGEST_POOL.find((c) => c.endsWith(prefix + "/") || c.endsWith(" " + prefix));
                  if (match) {
                    setCommandInput(match);
                    setSelectionStart(match.length);
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
                  <ToolsWindowContent onLog={appendTerminalLine} />
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
              <ToolsWindowContent onLog={appendTerminalLine} />
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
