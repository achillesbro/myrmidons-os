"use client";

import { GlitchTypeText, BlinkCaret } from "@/components/ui/animated-text";
import { PhosphorAfterimage } from "@/components/terminal/PhosphorAfterimage";
import { ActiveLineGlow } from "@/components/terminal/ActiveLineGlow";
import { MatrixRain } from "@/components/terminal/MatrixRain";
import {
  USDT0_VAULT_ADDRESS,
  USDT0_VAULT_CHAIN_ID,
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";
import { useVaultMetadata, useVaultAllocations, useVaultApy } from "@/lib/morpho/queries";
import { pickKpis, type KpiData } from "@/lib/morpho/view";
import { useMarketHealth } from "@/lib/mnemon/queries";
import { computeMarketStats, isRealMarket } from "@/lib/mnemon/aggregate";
import { fmtPct } from "@/lib/mnemon/format";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useState, useRef, type ReactNode } from "react";
import {
  FS_DIRS,
  resolveDir,
  resolveFile,
  fileByPaneId,
  statusTag,
  type FsDir,
  type FsFile,
} from "@/lib/landing/filesystem";
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

/** Terminal entry: output line, user input echo, or link block.
 *  `boot` marks a POST line (status-token coloring); `ascii` marks the
 *  MYRMIDONS wordmark (one entry, newline-separated). Both are otherwise
 *  ordinary output — same prompt prefix, same reveal, same effects.
 *  `delay` is the small gap (ms) before this line reveals (default 70).
 *  `workMs` + `pendingPrefix`: the line reveals as its label with a spinning
 *  caret at the value slot, "works" for workMs, then the value lands — the
 *  next line waits for it. That's where the boot stutter lives. */
type TerminalOut = {
  kind: "out";
  text: string;
  boot?: boolean;
  ascii?: boolean;
  delay?: number;
  workMs?: number;
  pendingPrefix?: string;
};
/** `prompt` snapshots the prompt at submit time so echoes stay historical. */
type TerminalIn = { kind: "in"; text: string; prompt?: { user: string; path: string } };
type TerminalLinks = { kind: "links"; items: { label: string; href: string }[] };
type TerminalEntry = TerminalOut | TerminalIn | TerminalLinks;

/** The clickable greeting line. Shared by INTRO_ENTRIES and the render-time
 *  match that swaps in the buttons, so the two can't drift apart. */
const CTA_LINE = "Type 'help', 'cd strategies' or 'cd tools' to continue.";

const SPINNER_FRAMES = ["|", "/", "-", "\\"];

/** Rotating caret shown while the boot reveal is between lines, so the long
 *  POST pauses read as the machine working — not the site lagging. */
function BootSpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), 110);
    return () => clearInterval(t);
  }, []);
  return <span className="text-text-dim font-mono text-xs">{SPINNER_FRAMES[frame]}</span>;
}

// The boot sequence already announces version, mounts and chain, so the
// greeting is just the prompt banner. `clear` resets to this (a real cls
// wiped the boot banner off screen too).
const INTRO_ENTRIES: TerminalOut[] = [
  // `boot` so the READY. gets the same green as the POST lines' READY
  { kind: "out", text: "READY.", delay: 400, boot: true },
  { kind: "out", text: CTA_LINE, delay: 200 },
];

/** Trailing status tokens in POST lines, and the class each one gets. */
const BOOT_SUFFIX_CLASSES: [RegExp, string][] = [
  [/\d[\d,]+ OK$/, "text-success glow-green"],
  [/\bOK$/, "text-success glow-green"],
  [/\bPASSED$/, "text-success glow-green"],
  [/\bREADY\.?$/, "text-success glow-green"],
  [/\bHYPEREVM$/, "text-gold glow-gold"],
  [/\bGWEI$/, "text-gold glow-gold"],
  [/\d[\d.,]*%$/, "text-gold glow-gold"],
];

/** Placeholder suffix on boot lines whose data is fetched live. Rendered as a
 *  rotating caret until the patch effect swaps in the real value. */
const BOOT_PENDING = "····";

/** Colorize a POST line's trailing status token. Each half glitch-types like
 *  any other terminal output, so boot lines reveal exactly like command output. */
function renderBootSegments(text: string): ReactNode {
  // Pending data: dot-leader label + inline spinner where the value will land
  if (text.endsWith(BOOT_PENDING)) {
    return (
      <>
        <GlitchTypeText loading={false} value={text.slice(0, -BOOT_PENDING.length)} mode="text" />
        <BootSpinner />
      </>
    );
  }
  for (const [re, cls] of BOOT_SUFFIX_CLASSES) {
    const m = text.match(re);
    if (m && m.index !== undefined) {
      return (
        <>
          {/* Skip the prefix when the token IS the whole line (e.g. "READY.") —
              GlitchTypeText renders a blinking caret for an empty value. */}
          {m.index > 0 && (
            <GlitchTypeText loading={false} value={text.slice(0, m.index)} mode="text" />
          )}
          <span className={cls}>
            <GlitchTypeText loading={false} value={text.slice(m.index)} mode="text" />
          </span>
        </>
      );
    }
  }
  return <GlitchTypeText loading={false} value={text} mode="text" />;
}

const SOCIALS_LINKS = [
  { href: "https://x.com/myrmidons_strat", label: "X / Twitter: @myrmidons_strat" },
  { href: "https://x.com/0xachilles", label: "X / Twitter: @0xachilles" },
  { href: "https://t.me/ZeroXAchilles", label: "Telegram: @ZeroXAchilles" },
];

const SUGGEST_POOL = [
  "cd strategies",
  "cd tools",
  "ls",
  "tree",
  "status",
  "vault stats",
  "balance",
  "gas",
  "block",
  "whoami",
  "contact",
  "help",
  "manifest",
  "open usdt0",
  "open usdc",
  "open mnemon",
  "run mnemon",
  "back",
  "pwd",
  "ping",
  "time",
];

/** Gold-highlight vocabulary for navigation output (ls/tree/cd/open/run…). */
const NAV_TERMS = [
  ...FS_DIRS.map((d) => `${d.name}/`),
  ...FS_DIRS.flatMap((d) => d.children.map((f) => f.name)),
  "[ACTIVE]",
  "[IN_DEV]",
  "[OFFLINE]",
  "[READ_ONLY]",
];

/** Terms to highlight with text-gold per command (key = normalized command). */
const HIGHLIGHT_TERMS: Record<string, string[]> = {
  help: ["cd strategies", "cd tools", "ls", "tree", "open usdt0", "open usdc", "open mnemon", "open", "run", "deposit-v2", "withdraw-v2", "balance", "swap", "socials", "contact", "status", "gas", "block", "whoami", "connect", "clear", "history", "Tab", "MYRMIDONS", "Quick Reference", "Navigate", "Invest", "Tools", "Reach us", "System", "help"],
  "help vault": ["open usdt0", "open usdc", "deposit-v2", "withdraw-v2", "balance", "deposit", "withdraw", "apr", "tvl", "vault stats"],
  "help strategies": ["cd strategies", "cd tools", "ls", "open", "run", "cd ..", "back", "pwd", "tree"],
  "help nav": ["cd strategies", "cd tools", "ls", "open", "run", "cd ..", "back", "pwd", "tree"],
  "help navigation": ["cd strategies", "cd tools", "ls", "open", "run", "cd ..", "back", "pwd", "tree"],
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
  ls: NAV_TERMS,
  dir: NAV_TERMS,
  tree: NAV_TERMS,
  status: ["HyperEVM", "OK", "Strategies"],
  version: ["MYRMIDONS", "v0.1"],
  ver: ["MYRMIDONS", "v0.1"],
  strategies: ["STRATEGIES/"],
  tools: ["TOOLS/", "SWAP", "MNEMON", "ROUTE_READY", "NO_ROUTE", "QUOTING", "PAIR", "OUT", "MIN"],
  swap: ["TOOLS/", "SWAP", "ROUTE_READY", "NO_ROUTE", "QUOTING", "PAIR", "OUT", "MIN"],
  mnemon: ["TOOLS/", "MNEMON", "MARKET_HEALTH", "INVESTABLE", "UTILIZATION", "HyperEVM", "Morpho"],
  exit: ["STRATEGIES/", "TOOLS/"],
  contact: ["X", "Telegram"],
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
  "open hegemon-v2": ["STRATEGIES/", "MYRMIDONS_USDT0"],
  "hegemon-v2": ["STRATEGIES/", "MYRMIDONS_USDT0"],
  v2: ["STRATEGIES/", "MYRMIDONS_USDT0"],
  "open usdc": ["STRATEGIES/", "MYRMIDONS_USDC"],
  usdc: ["STRATEGIES/", "MYRMIDONS_USDC"],
  "open erebus": ["STRATEGIES/", "EREBUS"],
  back: NAV_TERMS,
  pwd: NAV_TERMS,
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

const SPLIT_MIN_VIEWPORT = 1280; // below this: strategies pane renders as overlay sheet
const BOOT_BUILD_ID = "a1b9c3f"; // faux build hash shown in boot header (BIOS flavor)
const BOOT_CHECKSUM = "0x9f3ac7"; // faux signature checksum shown during boot

/** ASCII wordmark rows — one boot entry each, so the reveal staggers them
 *  and each row glitch-types like any other line. */
const BOOT_WORDMARK_ROWS = [
  "███╗░░░███╗██╗░░░██╗██████╗░███╗░░░███╗██╗██████╗░░█████╗░███╗░░██╗░██████╗",
  "████╗░████║╚██╗░██╔╝██╔══██╗████╗░████║██║██╔══██╗██╔══██╗████╗░██║██╔════╝",
  "██╔████╔██║░╚████╔╝░██████╔╝██╔████╔██║██║██║░░██║██║░░██║██╔██╗██║╚█████╗░",
  "██║╚██╔╝██║░░╚██╔╝░░██╔══██╗██║╚██╔╝██║██║██║░░██║██║░░██║██║╚████║░╚═══██╗",
  "██║░╚═╝░██║░░░██║░░░██║░░██║██║░╚═╝░██║██║██████╔╝╚█████╔╝██║░╚███║██████╔╝",
  "╚═╝░░░░░╚═╝░░░╚═╝░░░╚═╝░░╚═╝╚═╝░░░░░╚═╝╚═╝╚═════╝░░╚════╝░╚═╝░░╚══╝╚═════╝░",
];

/** Scramble charset for the wordmark rows: block glyphs, so the art looks
 *  like it materializes out of static rather than out of letters. */
const BOOT_WORDMARK_CHARSET = "█░╔╗╚╝║═";

// The boot sequence plays directly in the terminal log as ordinary output —
// same prompt prefix, same line-by-line glitch reveal — so there is no
// overlay-to-terminal handoff and no break in continuity.
// Worked lines print their label immediately, spin a caret at the value slot
// for `work` ms (the next line waits), then the value lands — like a real
// POST: the cursor sits on the check that's running, not between lines.
// `value: null` lines are live data, patched in place when the fetch lands.
type BootPostSpec =
  | { text: string; gap?: number }
  | { label: string; value: string | null; work: number; gap?: number };
const BOOT_POST_LINES: BootPostSpec[] = [
  { text: "", gap: 80 },
  { text: `MYRMIDONS OS v0.9.3  ·  build ${BOOT_BUILD_ID}`, gap: 120 },
  { text: "", gap: 60 },
  { text: "(c) 2026 Myrmidons Strategies", gap: 90 },
  { text: "", gap: 60 },
  { text: "POST // power-on self-test", gap: 250 },
  { label: "detecting processor ..... ", value: "CHAIN 999 // HYPEREVM", work: 300 },
  { label: "memory check ............ ", value: "640K OK", work: 550 },
  { label: "binding operator ........ ", value: "GUEST", work: 200 },
  { label: "synchronizing block ..... ", value: null, work: 500 },
  { label: "gas oracle .............. ", value: null, work: 380 },
  { label: "loading risk params ..... ", value: "U_CRIT=0.92 OK", work: 320 },
  { label: "scanning /STRATEGIES .... ", value: null, work: 420 },
  { label: "indexing MNEMON archive . ", value: null, work: 380 },
  { label: "mounting /STRATEGIES .... ", value: "READY", work: 300 },
  { label: "mounting /TOOLS ......... ", value: "READY", work: 120 },
  { label: "verifying signatures .... ", value: `${BOOT_CHECKSUM} PASSED`, work: 650 },
  { text: "entering interactive shell...", gap: 200 },
  // Blank beat: the break between POST output and the interactive prompt
  { text: "", gap: 300 },
];

/** What the terminal holds on page load: boot scrollback, then the prompt. */
const INITIAL_ENTRIES: TerminalOut[] = [
  // Power-on beat before the wordmark, then the rows sweep in fast
  ...BOOT_WORDMARK_ROWS.map((text, i) => ({ kind: "out" as const, text, ascii: true, delay: i === 0 ? 350 : 45 })),
  ...BOOT_POST_LINES.map((l) =>
    "label" in l
      ? {
          kind: "out" as const,
          text: l.label + (l.value ?? BOOT_PENDING),
          boot: true,
          delay: l.gap ?? 70,
          workMs: l.work,
          pendingPrefix: l.label,
        }
      : { kind: "out" as const, text: l.text, boot: true, delay: l.gap ?? 70 }
  ),
  ...INTRO_ENTRIES,
];

export default function Home() {
  const [strategiesOpen, setStrategiesOpen] = useState<boolean>(false);
  // CLI navigation: cwd names the mounted pane's directory (null = /). The
  // selected entry mirrors the #file=/#tool= hash — the existing bus between
  // this page and the panes — so tile clicks and CLI opens stay in sync.
  const [cwdName, setCwdName] = useState<"STRATEGIES" | "TOOLS" | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<FsFile | null>(null);
  const [strategiesPaneExiting, setStrategiesPaneExiting] = useState<boolean>(false);
  const [strategiesPaneEntered, setStrategiesPaneEntered] = useState<boolean>(false);
  const [toolsOpen, setToolsOpen] = useState<boolean>(false);
  const [toolsPaneExiting, setToolsPaneExiting] = useState<boolean>(false);
  const [toolsPaneEntered, setToolsPaneEntered] = useState<boolean>(false);
  const [hyperEvmBlock, setHyperEvmBlock] = useState<string | null>(null);
  const [hyperEvmGas, setHyperEvmGas] = useState<string | null>(null);
  const [isStrategiesBlinking, setIsStrategiesBlinking] = useState<boolean>(false);
  const [isToolsBlinking, setIsToolsBlinking] = useState<boolean>(false);
  const [useSplit, setUseSplit] = useState<boolean>(true);
  const isMobile = useIsMobile();
  const [commandInput, setCommandInput] = useState<string>("");
  const [selectionStart, setSelectionStart] = useState<number>(0);
  const [caretLeft, setCaretLeft] = useState<number>(0);
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>(INITIAL_ENTRIES);
  const [revealingEntryIndex, setRevealingEntryIndex] = useState<number>(-1);
  const [revealingLineIndex, setRevealingLineIndex] = useState<number>(-1);
  // Last line whose "work" has finished (boot lines show label + spinning
  // caret between reveal and settle; other lines settle on reveal).
  const [settledLineIndex, setSettledLineIndex] = useState<number>(-1);
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
  const router = useRouter();
  const { address } = useAccount();

  // Prompt pieces — rendered live at the input row and snapshotted into every
  // command echo, so the log shows where each command was issued from.
  const promptUser = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "GUEST";
  const promptPath = cwdName ? `/${cwdName}${selectedEntry ? `/${selectedEntry.name}` : ""}` : "/";
  const promptRef = useRef({ user: promptUser, path: promptPath });
  promptRef.current = { user: promptUser, path: promptPath };
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

  // Reveal last batch output line-by-line. On page load there is no "in" entry
  // yet, so the whole boot sequence + prompt banner types in as one batch.
  // Each line waits a small `delay` gap (default 70ms), then reveals; a line
  // with `workMs` shows its label + spinning caret for that long before the
  // value lands and the chain moves on — the stutter sits at the value slot.
  useEffect(() => {
    const lastInIdx = terminalEntries.map((e, i) => (e.kind === "in" ? i : -1)).filter((i) => i >= 0).pop() ?? -1;
    const steps = terminalEntries.slice(lastInIdx + 1).flatMap((e) => {
      if (e.kind === "out") return [{ gap: e.delay ?? 70, work: e.workMs ?? 0 }];
      if (e.kind === "links") return e.items.map(() => ({ gap: 70, work: 0 }));
      return [];
    });
    if (steps.length === 0) {
      setRevealingEntryIndex(-1);
      setRevealingLineIndex(-1);
      setSettledLineIndex(-1);
      return;
    }
    setRevealingEntryIndex(lastInIdx);
    setRevealingLineIndex(-1);
    setSettledLineIndex(-1);
    let lineIndex = -1;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (lineIndex < steps.length - 1) timer = setTimeout(reveal, steps[lineIndex + 1].gap);
    };
    const reveal = () => {
      lineIndex += 1;
      setRevealingLineIndex(lineIndex);
      const { work } = steps[lineIndex];
      if (work > 0) {
        const settleAt = lineIndex;
        timer = setTimeout(() => {
          setSettledLineIndex(settleAt);
          next();
        }, work);
      } else {
        setSettledLineIndex(lineIndex);
        next();
      }
    };
    timer = setTimeout(reveal, steps[0].gap);
    // ESC skips the reveal — everything lands at once.
    const skip = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      clearTimeout(timer);
      lineIndex = steps.length - 1;
      setRevealingLineIndex(steps.length - 1);
      setSettledLineIndex(steps.length - 1);
    };
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", skip);
    };
  }, [terminalEntries.length]);

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
    setCwdName("STRATEGIES");
    setTimeout(() => setIsStrategiesBlinking(false), 1000);
    if (typeof window !== "undefined") {
      if (fileId) {
        setTimeout(() => {
          window.location.hash = `file=${encodeURIComponent(fileId)}`;
        }, 150);
      } else if (window.location.hash.includes("tool=")) {
        // Crossing over from TOOLS/: drop the stale tool selection.
        window.location.hash = "";
      }
    }
  };

  const openTools = (toolId?: string) => {
    setStrategiesOpen(false);
    setCwdName("TOOLS");
    if (typeof window !== "undefined") {
      // No toolId => open the pane with no shard selected (EmptyState), rather
      // than defaulting into a tool.
      window.location.hash = toolId ? `tool=${encodeURIComponent(toolId)}` : "";
    }
    setIsToolsBlinking(true);
    setToolsOpen(true);
    setTimeout(() => setIsToolsBlinking(false), 1000);
  };

  /** cd back to / — close whichever pane is mounted and clear the selection. */
  const closeToRoot = () => {
    setStrategiesOpen(false);
    setToolsOpen(false);
    setCwdName(null);
    if (typeof window !== "undefined") window.location.hash = "";
  };

  /** Deselect the open entry but stay in the directory (pane shows its index). */
  const deselectEntry = () => {
    if (typeof window !== "undefined") window.location.hash = "";
  };

  // Keep selectedEntry mirroring the hash — whether set by CLI commands or by
  // tile clicks inside the panes (which write #file=/#tool= themselves).
  useEffect(() => {
    const sync = () => {
      const m = window.location.hash.match(/(?:file|tool)=([^&]+)/);
      const hit = m ? fileByPaneId(decodeURIComponent(m[1])) : null;
      setSelectedEntry(hit?.file ?? null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const appendTerminalLine = useCallback((text: string) => {
    setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
  }, []);

  // Pane tile clicks echo their CLI command into the log — clicking and typing
  // are the same navigation system, and the terminal records both.
  const echoPaneOpen = useCallback((fileId: string) => {
    const hit = fileByPaneId(fileId);
    if (!hit) return;
    setTerminalEntries((prev) => [
      ...prev,
      { kind: "in", text: `open ${hit.file.name.toLowerCase()}`, prompt: promptRef.current },
      { kind: "out", text: `Opening ${hit.file.name}${hit.file.secondary ? ` (${hit.file.secondary})` : ""}...` },
    ]);
  }, []);

  type RunCommandOpts = {
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
    cwd: FsDir | null;
    selected: FsFile | null;
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
      if (topic === "strategies" || topic === "nav" || topic === "navigation") {
        return [
          { kind: "out", text: "HELP - navigation" },
          { kind: "out", text: "  cd strategies / cd tools   mount a directory" },
          { kind: "out", text: "  ls                         list the current directory" },
          { kind: "out", text: "  open <name>                slot a shard (e.g. open usdt0)" },
          { kind: "out", text: "  run <name>                 execute — jumps to its page" },
          { kind: "out", text: "  cd .. / back               up one level" },
          { kind: "out", text: "  pwd / tree                 where am I / full map" },
        ];
      }
      if (topic === "vault") {
        return [
          { kind: "out", text: "HELP - vault" },
          { kind: "out", text: "  open usdt0 / open usdc      inspect the V2 vaults" },
          { kind: "out", text: "  deposit-v2 <amount|max|half>" },
          { kind: "out", text: "  withdraw-v2 <amount|max|half>" },
          { kind: "out", text: "  balance                     wallet + vault balances" },
          { kind: "out", text: "  deposit / withdraw          V1 HEGEMON (deprecated — withdrawals only)" },
          { kind: "out", text: "  apr, tvl, vault stats       V1 HEGEMON figures" },
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
      return [{ kind: "out", text: "Unknown help topic. Try: help nav | help vault | help system | help identity | help lore" }];
    }

    // ── Filesystem navigation ────────────────────────────────────────────
    // cwd mounts a pane; open selects a shard in it; run executes a page.
    // The panes are a rendering of the CLI state, not a parallel nav system.

    const out = (text: string): TerminalOut => ({ kind: "out", text });
    const pwdPath = () =>
      opts.cwd ? `/${opts.cwd.name}${opts.selected ? `/${opts.selected.name}` : ""}` : "/";
    const mountDir = (dir: FsDir) => (dir.pane === "strategies" ? openStrategies() : openTools());
    const openEntry = (dir: FsDir, file: FsFile) =>
      dir.pane === "strategies" ? openStrategies(file.id) : openTools(file.id);
    /** Resolve a file: cwd first, then unique global match (auto-mount). */
    const findEntry = (token: string): { dir: FsDir; file: FsFile } | null => {
      if (opts.cwd) {
        const local = resolveFile(opts.cwd, token);
        if (local) return { dir: opts.cwd, file: local };
      }
      for (const dir of FS_DIRS) {
        if (dir === opts.cwd) continue;
        const file = resolveFile(dir, token);
        if (file) return { dir, file };
      }
      return null;
    };
    const lsDir = (dir: FsDir): TerminalOut[] =>
      dir.children.map((f) => out(`${(f.name + (f.route ? "*" : "")).padEnd(26)}${statusTag(f.status)}`));

    // Legacy one-word shortcuts expand to the canonical grammar — printed
    // first, so muscle memory keeps working while teaching the new commands.
    const LEGACY_ALIASES: Record<string, string> = {
      strategies: "cd /STRATEGIES",
      "open strategies": "cd /STRATEGIES",
      "open strategies/": "cd /STRATEGIES",
      tools: "cd /TOOLS",
      "open tools": "cd /TOOLS",
      "open tools/": "cd /TOOLS",
      hegemon: "open HEGEMON",
      morpho: "open HEGEMON",
      vault: "open HEGEMON",
      "hegemon-v2": "open MYRMIDONS_USDT0",
      hegemon_v2: "open MYRMIDONS_USDT0",
      v2: "open MYRMIDONS_USDT0",
      usdc: "open MYRMIDONS_USDC",
      erebus: "open EREBUS",
      liquidation: "open EREBUS",
      swap: "open SWAP",
      mnemon: "open MNEMON",
    };
    if (LEGACY_ALIASES[cmd]) {
      return [out(`→ ${LEGACY_ALIASES[cmd]}`), ...runCommand(LEGACY_ALIASES[cmd], opts)];
    }

    if (cmd.startsWith("swap ")) {
      return [
        out("SWAP // NOT_IMPLEMENTED"),
        out("Use 'swap' to open the tool UI (in dev)."),
      ];
    }

    if (cmd === "cd" || cmd.startsWith("cd ")) {
      const arg = cmd.slice(2).trim();
      // Home
      if (!arg || arg === "/" || arg === "~") {
        if (!opts.cwd) return [];
        closeToRoot();
        return [];
      }
      // Up one level: deselect first, then unmount
      if (arg === ".." || arg === "../") {
        if (opts.selected) {
          deselectEntry();
          return [];
        }
        if (opts.cwd) {
          closeToRoot();
          return [];
        }
        return [out("Already at /.")];
      }
      if (arg === ".") return [];
      const dir = resolveDir(arg);
      if (dir) {
        if (opts.cwd?.name === dir.name && !opts.selected) return [out(`Already in /${dir.name}.`)];
        mountDir(dir);
        return [];
      }
      // A file (or path ending in one) is not a directory
      const token = arg.split("/").filter(Boolean).pop() ?? arg;
      if (findEntry(token)) return [out(`cd: not a directory: ${token} — try 'open ${token}'`)];
      return [out(`cd: no such file or directory: ${arg}`)];
    }

    if (cmd === "ls" || cmd === "dir" || cmd.startsWith("ls ") || cmd.startsWith("dir ")) {
      const arg = cmd.replace(/^(ls|dir)\s*/, "").trim();
      if (arg && arg !== "/" && arg !== ".") {
        const dir = resolveDir(arg);
        if (!dir) return [out(`ls: cannot access '${arg}': no such directory`)];
        return lsDir(dir);
      }
      if (!arg && opts.cwd) return lsDir(opts.cwd);
      return FS_DIRS.map((d) => out(`${d.name}/`));
    }

    if (cmd === "tree") {
      const lines: TerminalOut[] = [out("/")];
      FS_DIRS.forEach((dir, di) => {
        const dirLast = di === FS_DIRS.length - 1;
        lines.push(out(`${dirLast ? "└──" : "├──"} ${dir.name}/`));
        dir.children.forEach((f, fi) => {
          const fileLast = fi === dir.children.length - 1;
          const stem = dirLast ? "    " : "│   ";
          lines.push(
            out(`${stem}${fileLast ? "└──" : "├──"} ${(f.name + (f.route ? "*" : "")).padEnd(24)}${statusTag(f.status)}`)
          );
        });
      });
      lines.push(out(""));
      lines.push(out("* runnable — 'run <name>' opens its page"));
      return lines;
    }

    if (cmd === "open" || cmd.startsWith("open ")) {
      const arg = cmd.slice(4).trim();
      if (!arg) return [out("Usage: open <name> — e.g. open MNEMON (see 'ls')")];
      // Directory → same as cd
      const asDir = resolveDir(arg);
      if (asDir) {
        if (opts.cwd?.name === asDir.name && !opts.selected) return [out(`Already in /${asDir.name}.`)];
        mountDir(asDir);
        return [out(`Mounting ${asDir.name}/...`)];
      }
      // Path form: open STRATEGIES/MYRMIDONS_USDT0
      const segs = arg.split("/").filter(Boolean);
      if (segs.length === 2) {
        const dir = resolveDir(segs[0]);
        const file = dir ? resolveFile(dir, segs[1]) : null;
        if (!dir || !file) return [out(`open: no such file: ${arg}`)];
        openEntry(dir, file);
        return [out(`Opening ${file.name}${file.secondary ? ` (${file.secondary})` : ""}...`)];
      }
      const hit = findEntry(arg);
      if (!hit) return [out(`open: no such file: ${arg} — 'ls' to list, 'tree' for everything`)];
      const lines: TerminalOut[] = [];
      if (opts.cwd?.name !== hit.dir.name) lines.push(out(`(auto-mounting ${hit.dir.name}/)`));
      openEntry(hit.dir, hit.file);
      lines.push(out(`Opening ${hit.file.name}${hit.file.secondary ? ` (${hit.file.secondary})` : ""}...`));
      return lines;
    }

    if (cmd === "run" || cmd.startsWith("run ") || cmd.startsWith("./") || cmd === "launch" || cmd.startsWith("launch ") || cmd === "exec" || cmd.startsWith("exec ")) {
      const arg = cmd.startsWith("./")
        ? cmd.slice(2).trim()
        : cmd.replace(/^(run|launch|exec)\s*/, "").trim();
      if (!arg) return [out("Usage: run <name> — executables are marked * in 'ls'")];
      const segs = arg.split("/").filter(Boolean);
      const hit =
        segs.length === 2
          ? (() => {
              const dir = resolveDir(segs[0]);
              const file = dir ? resolveFile(dir, segs[1]) : null;
              return dir && file ? { dir, file } : null;
            })()
          : findEntry(arg);
      if (!hit) return [out(`run: no such file: ${arg}`)];
      if (hit.file.access === "Private") return [out(`run: permission denied: ${hit.file.name}`)];
      if (!hit.file.route) return [out(`run: not executable: ${hit.file.name} — try 'open ${hit.file.name}'`)];
      router.push(hit.file.route);
      return [out(`Executing ${hit.file.name} → ${hit.file.route}`)];
    }

    if (cmd === "back" || cmd === "exit") {
      if (opts.selected) {
        deselectEntry();
        return [out(`Returning to /${opts.cwd?.name ?? ""}.`)];
      }
      if (opts.cwd) {
        closeToRoot();
        return [out("Returning to /.")];
      }
      return [out("Already at /.")];
    }

    if (cmd === "pwd") {
      return [out(pwdPath())];
    }

    if (cmd === "status") {
      return [
        { kind: "out", text: "SYSTEM STATUS" },
        { kind: "out", text: "  Network: HyperEVM" },
        { kind: "out", text: "  Index: OK" },
        { kind: "out", text: "  Strategies: 3 detected" },
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
      return [{ kind: "out", text: "Try: cd strategies  (or type 'help' for commands)" }];
    }

    if (cmd === "commands" || cmd === "?") {
      return [
        { kind: "out", text: "cd strategies / cd tools" },
        { kind: "out", text: "ls / tree / pwd / cd .." },
        { kind: "out", text: "open <name> / run <name>" },
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
    if (cmd === "deposit-v2") {
      return [{ kind: "out", text: "Usage: deposit-v2 <amount|max|half> - deposit USDT0 into HEGEMON_V2 (in dev)" }];
    }
    if (cmd === "withdraw-v2") {
      return [{ kind: "out", text: "Usage: withdraw-v2 <amount|max|half> - withdraw shares from HEGEMON_V2 (in dev)" }];
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
      const pad = (s: string, w = 26) => s.padEnd(w);
      return [
        { kind: "out", text: "MYRMIDONS  Quick Reference" },
        { kind: "out", text: "" },
        { kind: "out", text: "  Navigate" },
        { kind: "out", text: `    ${pad("cd strategies / cd tools")}Mount a directory` },
        { kind: "out", text: `    ${pad("ls / tree")}List directory / full map` },
        { kind: "out", text: `    ${pad("open <name>")}Slot a shard (open usdt0)` },
        { kind: "out", text: `    ${pad("run <name>")}Jump to its page (run mnemon)` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Invest — Morpho Vault V2 (in dev)" },
        { kind: "out", text: `    ${pad("open usdt0 / open usdc")}Inspect the V2 vaults` },
        { kind: "out", text: `    ${pad("deposit-v2 <amt>")}Deposit USDT0 into MYRMIDONS_USDT0` },
        { kind: "out", text: `    ${pad("withdraw-v2 <amt>")}Withdraw from MYRMIDONS_USDT0` },
        { kind: "out", text: `    ${pad("balance")}Wallet + vault balances` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Tools" },
        { kind: "out", text: `    ${pad("open mnemon")}Morpho market analyser (HyperEVM)` },
        { kind: "out", text: `    ${pad("swap <amt> <in> <out>")}Onchain swap — swap 1 hype usdt0` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Reach us" },
        { kind: "out", text: `    ${pad("socials / contact")}X (×2), Telegram` },
        { kind: "out", text: "" },
        { kind: "out", text: "  System" },
        { kind: "out", text: `    ${pad("status / gas / block")}Chain state` },
        { kind: "out", text: `    ${pad("whoami / connect")}Operator identity` },
        { kind: "out", text: `    ${pad("clear / history / Tab")}Session` },
        { kind: "out", text: "" },
        { kind: "out", text: 'Type "help nav", "help vault", or "help system" for full details.' },
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
        { kind: "out", text: "HEGEMON_V2 is in test phase. HEGEMON (V1) is being deprecated. EREBUS is offline." },
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
    // exit/back are handled by runCommand (cd .. semantics)

    // balance / balance refresh — async LiquidSwap + HEGEMON vault share (30s cache)
    if (cmd === "balance" || cmd === "balance refresh" || cmd === "vault balance" || cmd === "balances") {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
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
          // HEGEMON_V2 vault shares (in dev)
          if (publicClientRef && chainIdRef === HEGEMON_V2_VAULT_CHAIN_ID) {
            try {
              const [v2Shares, v2Decimals] = await Promise.all([
                publicClientRef.readContract({
                  address: HEGEMON_V2_VAULT_ADDRESS as Address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [address as Address],
                }) as Promise<bigint>,
                readVaultDecimals(HEGEMON_V2_VAULT_ADDRESS as Address, publicClientRef),
              ]);
              lines.push({
                kind: "out",
                text: `MYRMIDONS_USD₮0_V2  ${formatAmount(v2Shares, v2Decimals)}`,
              });
            } catch {
              lines.push({ kind: "out", text: "MYRMIDONS_USD₮0_V2  UNAVAILABLE" });
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

    // deposit <amount> / deposit-v2 <amount> — direct deposit USDT0 into the HEGEMON
    // (V1) or HEGEMON_V2 vault (amount: number, max, or half)
    const depositMatch = raw.trim().toLowerCase().match(/^deposit(-v2)?\s+(.+)$/);
    if (depositMatch) {
      const isV2Vault = depositMatch[1] === "-v2";
      const targetVaultAddress = (isV2Vault ? HEGEMON_V2_VAULT_ADDRESS : USDT0_VAULT_ADDRESS) as Address;
      const targetChainId = isV2Vault ? HEGEMON_V2_VAULT_CHAIN_ID : USDT0_VAULT_CHAIN_ID;
      const vaultLabel = isV2Vault ? "VAULT_V2" : "VAULT";
      const amountStr = depositMatch[2].trim();
      const isMaxOrHalf = amountStr === "max" || amountStr === "half";
      const isValidNumeric = amountStr && /^\d+(\.\d*)?$/.test(amountStr);
      if (!amountStr || (!isValidNumeric && !isMaxOrHalf)) {
        setCommandHistory((prev) => [...prev, raw].slice(-20));
        setCommandHistoryIndex(-1);
        setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
        setCommandInput("");
        setSelectionStart(0);
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `${vaultLabel} // ERROR  INVALID_AMOUNT` }]);
        return;
      }
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!address || !walletClient?.account || !publicClient) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `${vaultLabel} // ERROR  WALLET_REQUIRED` }]);
        return;
      }
      if (chainId !== targetChainId) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `${vaultLabel} // ERROR  WRONG_NETWORK` }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          const vaultAddress = targetVaultAddress;
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
              append(`${vaultLabel} // ERROR  INVALID_AMOUNT`);
              return;
            }
          }
          if (parsedAssets === 0n) {
            append(`${vaultLabel} // ERROR  INSUFFICIENT_BALANCE`);
            return;
          }
          if (parsedAssets > balances.assetBalance) {
            append(`${vaultLabel} // ERROR  INSUFFICIENT_BALANCE`);
            return;
          }
          const allowance = await readAllowance({
            owner: address as Address,
            assetAddress,
            spender: vaultAddress,
            publicClient,
          });
          if (parsedAssets > allowance) {
            append(`${vaultLabel} // APPROVAL_REQUIRED`);
            const approveHash = await approveExact({
              assetAddress,
              spender: vaultAddress,
              amount: parsedAssets,
              walletClient: walletClient!,
              publicClient,
            });
            const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
            if (approveReceipt.status === "reverted") {
              append(`${vaultLabel} // ERROR  APPROVAL_REVERTED`);
              return;
            }
            append(`${vaultLabel} // APPROVED`);
          }
          const depositHash = await deposit({
            vaultAddress,
            assets: parsedAssets,
            receiver: address as Address,
            walletClient: walletClient!,
          });
          append(`${vaultLabel} // DEPOSIT_SUBMITTED`);
          const depositReceipt = await publicClient.waitForTransactionReceipt({ hash: depositHash });
          if (depositReceipt.status === "reverted") {
            append(`${vaultLabel} // ERROR  DEPOSIT_REVERTED  ${depositHash}`);
            return;
          }
          append(`${vaultLabel} // DEPOSIT_CONFIRMED  ${depositHash}`);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: address! } }));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/reject|denied|user denied/i.test(msg)) append(`${vaultLabel} // ERROR  SIGN_REJECTED`);
          else append(`${vaultLabel} // ERROR  UNKNOWN`);
        }
      })();
      return;
    }

    // withdraw <amount> / withdraw-v2 <amount> — direct withdraw vault shares from
    // the HEGEMON (V1) or HEGEMON_V2 vault (amount: number, max, or half)
    const withdrawMatch = raw.trim().toLowerCase().match(/^withdraw(-v2)?\s+(.+)$/);
    if (withdrawMatch) {
      const isV2Vault = withdrawMatch[1] === "-v2";
      const targetVaultAddress = (isV2Vault ? HEGEMON_V2_VAULT_ADDRESS : USDT0_VAULT_ADDRESS) as Address;
      const targetChainId = isV2Vault ? HEGEMON_V2_VAULT_CHAIN_ID : USDT0_VAULT_CHAIN_ID;
      const vaultLabel = isV2Vault ? "VAULT_V2" : "VAULT";
      const amountStr = withdrawMatch[2].trim();
      const isMaxOrHalf = amountStr === "max" || amountStr === "half";
      const isValidNumeric = amountStr && /^\d+(\.\d*)?$/.test(amountStr);
      if (!amountStr || (!isValidNumeric && !isMaxOrHalf)) {
        setCommandHistory((prev) => [...prev, raw].slice(-20));
        setCommandHistoryIndex(-1);
        setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
        setCommandInput("");
        setSelectionStart(0);
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `${vaultLabel} // ERROR  INVALID_AMOUNT` }]);
        return;
      }
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
      setCommandInput("");
      setSelectionStart(0);
      if (!address || !walletClient?.account || !publicClient) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `${vaultLabel} // ERROR  WALLET_REQUIRED` }]);
        return;
      }
      if (chainId !== targetChainId) {
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `${vaultLabel} // ERROR  WRONG_NETWORK` }]);
        return;
      }
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      (async () => {
        try {
          const vaultAddress = targetVaultAddress;
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
              append(`${vaultLabel} // ERROR  INVALID_AMOUNT`);
              return;
            }
          }
          if (parsedShares === 0n) {
            append(`${vaultLabel} // ERROR  INSUFFICIENT_BALANCE`);
            return;
          }
          if (parsedShares > balances.vaultShareBalance) {
            append(`${vaultLabel} // ERROR  INSUFFICIENT_BALANCE`);
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
          append(`${vaultLabel} // WITHDRAW_SUBMITTED`);
          const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });
          if (withdrawReceipt.status === "reverted") {
            append(`${vaultLabel} // ERROR  WITHDRAW_REVERTED  ${withdrawHash}`);
            return;
          }
          append(`${vaultLabel} // WITHDRAW_CONFIRMED  ${withdrawHash}`);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: address! } }));
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/reject|denied|user denied/i.test(msg)) append(`${vaultLabel} // ERROR  SIGN_REJECTED`);
          else append(`${vaultLabel} // ERROR  UNKNOWN`);
        }
      })();
      return;
    }

    // wrap <amount> HYPE — wrap only (no LiquidSwap)
    if (raw.trim().toLowerCase().startsWith("wrap ")) {
      const wrapParsed = parseWrapCommand(raw);
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
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
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
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
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
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
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }, { kind: "out", text: "HyperEVM RPC: …" }]);
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
    const output = runCommand(raw, {
      address,
      vaultKpis,
      vaultKpisLoading,
      gasPriceWei,
      blockNumber,
      hypePriceUsd,
      vaultBalanceData,
      cwd: cwdName ? resolveDir(cwdName) : null,
      selected: selectedEntry,
      commandHistory,
      sessionStartTime,
      chainId,
    });
    setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }, ...output]);
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

  // Fetch HyperEVM block height on mount (non-blocking). Uses an ignore flag
  // rather than aborting on cleanup — aborting on cleanup kills the fetch under
  // React Strict Mode's double-invoke in dev. Timeout still guards a slow RPC.
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

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
        if (!ignore) setHyperEvmBlock(n.toLocaleString("en-US"));
      } catch { /* boot must not depend on this */ } finally {
        clearTimeout(timeout);
      }
    })();

    return () => { ignore = true; clearTimeout(timeout); };
  }, []);

  // Fetch HyperEVM gas price on mount (non-blocking) — boot flavor
  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    (async () => {
      try {
        const res = await fetch("https://rpc.hyperliquid.xyz/evm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
          signal: controller.signal,
        });
        const json = await res.json();
        const hex = json?.result;
        if (typeof hex !== "string") return;
        const wei = Number.parseInt(hex, 16);
        if (!Number.isFinite(wei)) return;
        const gwei = wei / 1e9;
        if (!ignore) setHyperEvmGas(gwei < 0.001 ? gwei.toExponential(2) : gwei.toFixed(3));
      } catch { /* boot must not depend on this */ } finally {
        clearTimeout(timeout);
      }
    })();

    return () => { ignore = true; clearTimeout(timeout); };
  }, []);

  // Rewrite POST placeholder lines in place as live data lands. The boot rows
  // are ordinary log entries, so patch the log itself — the placeholder prefix
  // only ever exists in the boot batch, and `clear` removes it for good.
  const patchBootLine = useCallback((prefix: string, text: string) => {
    setTerminalEntries((prev) =>
      prev.map((e) =>
        e.kind === "out" && e.boot && e.text.startsWith(prefix) && e.text !== text
          ? { ...e, text }
          : e
      )
    );
  }, []);

  useEffect(() => {
    if (!hyperEvmBlock) return;
    patchBootLine("synchronizing block", `synchronizing block ..... ${hyperEvmBlock} OK`);
  }, [hyperEvmBlock, patchBootLine]);

  useEffect(() => {
    if (!hyperEvmGas) return;
    patchBootLine("gas oracle", `gas oracle .............. ${hyperEvmGas} GWEI`);
  }, [hyperEvmGas, patchBootLine]);

  // Operator line stays GUEST until a wallet connects (whenever that happens)
  useEffect(() => {
    if (!address) return;
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    patchBootLine("binding operator", `binding operator ........ ${short} OK`);
  }, [address, patchBootLine]);

  // Live product data for the boot scan lines. Both patch in place when the
  // fetch lands (inline spinner until then) — boot never blocks on the API,
  // and the queries double as a prefetch for the panes (same query keys).
  const usdt0V2Apy = useVaultApy(HEGEMON_V2_VAULT_ADDRESS, HEGEMON_V2_VAULT_CHAIN_ID, true);
  const usdcV2Apy = useVaultApy(USDC_V2_VAULT_ADDRESS, USDC_V2_VAULT_CHAIN_ID, true);
  const marketHealth = useMarketHealth();

  // Best V2 vault net APY (of the vaults the FS declares as VAULT_V2)
  const v2VaultCount = FS_DIRS[0].children.filter((f) => f.secondary?.startsWith("VAULT_V2")).length;
  const bestV2Apy = (() => {
    const vals = [usdt0V2Apy.data, usdcV2Apy.data]
      .map((d) => Number(d?.vaultByAddress?.state?.netApy))
      .filter((n) => Number.isFinite(n) && n > 0);
    return vals.length ? Math.max(...vals) : null;
  })();
  useEffect(() => {
    if (bestV2Apy == null) return;
    patchBootLine(
      "scanning /STRATEGIES",
      `scanning /STRATEGIES .... ${v2VaultCount} V2 vaults · best APY ${fmtPct(bestV2Apy)}`
    );
  }, [bestV2Apy, v2VaultCount, patchBootLine]);

  // MNEMON archive: real markets tracked + best *investable* APY (never dust)
  useEffect(() => {
    const markets = (marketHealth.data?.markets ?? []).filter(isRealMarket);
    if (markets.length === 0) return;
    const stats = computeMarketStats(markets);
    const best = stats.bestDeployableApy != null ? ` · best APY ${fmtPct(stats.bestDeployableApy)}` : "";
    patchBootLine("indexing MNEMON archive", `indexing MNEMON archive . ${stats.markets} markets${best}`);
  }, [marketHealth.data, patchBootLine]);

  return (
    <>
      {matrixMode && <MatrixRain columns={28} />}
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
      {/* No site header on the landing — the terminal owns the full viewport */}
      <div className="h-dvh flex flex-col overflow-hidden bg-bg-base relative">
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
              // `revealTrigger` (out lines only) fires the glow when the line
              // types in, so every appearing line flashes like the CRT is
              // drawing it — the same look appended commands get.
              const wrapWithGlow = (node: ReactNode, revealTrigger = 0) => (
                <ActiveLineGlow key={i} trigger={glowTrigger || revealTrigger}>
                  <PhosphorAfterimage trigger={phosphorTrigger} ghostClassName="opacity-70">
                    {node}
                  </PhosphorAfterimage>
                </ActiveLineGlow>
              );
              if (e.kind === "in") {
                return wrapWithGlow(
                  <div className="flex gap-2 text-text-dim mt-1">
                    {e.prompt ? (
                      <span className="shrink-0 select-none whitespace-nowrap">
                        <span className="text-text-dim/60 hidden sm:inline">{e.prompt.user}@MYRMIDONS:</span>
                        <span className="text-gold/80">{e.prompt.path}</span>
                        <span className="text-border"> &gt;</span>
                      </span>
                    ) : (
                      <span className="text-text-dim/60 shrink-0 select-none w-2" aria-hidden />
                    )}
                    <span className="text-white">{e.text}</span>
                  </div>
                );
              }
              if (e.kind === "out") {
                const outLineStart = getOutputLineStart(i);
                const isInLastBatch = i > lastInIdx;
                const isRevealed = !isInLastBatch || (outLineStart >= 0 && outLineStart <= revealingLineIndex);
                if (!isRevealed) return null;
                // Latched once revealed (non-zero, unique per line): the glow
                // plays once on mount and isn't cut short by the next line.
                const revealTrigger = isInLastBatch ? outLineStart + 1 : 0;
                const isEmpty = e.text === "";
                // Boot wordmark: one entry per row, so the reveal staggers the
                // rows and each glitch-types out of block-glyph static. 75
                // cols wide — illegible and overflowing on phones, so fall
                // back to the brand title there (first row only).
                if (e.ascii) {
                  if (isMobile) {
                    if (e.text !== BOOT_WORDMARK_ROWS[0]) return null;
                    return wrapWithGlow(
                      <div className="flex gap-2 pl-4">
                        <span className="shrink-0 select-none w-2" aria-hidden />
                        <span className="font-brand text-2xl font-bold tracking-wide text-white glow-gold">
                          MYRMIDONS
                        </span>
                      </div>,
                      revealTrigger
                    );
                  }
                  return wrapWithGlow(
                    <div className="flex gap-2 pl-4">
                      <span className="shrink-0 select-none w-2" aria-hidden />
                      <div className="overflow-x-auto">
                        <div
                          className="text-white whitespace-pre"
                          style={{ fontSize: "0.54rem", lineHeight: 2.2 }}
                        >
                          <GlitchTypeText
                            loading={false}
                            value={e.text}
                            mode="text"
                            charset={BOOT_WORDMARK_CHARSET}
                          />
                        </div>
                      </div>
                    </div>,
                    revealTrigger
                  );
                }
                // Greeting line: gold clickable "strategies" that opens STRATEGIES/ pane
                if (e.text === CTA_LINE) {
                  return wrapWithGlow(
                    <div className="flex gap-2 text-text-dim pl-4">
                      <span className="text-border shrink-0 select-none">&gt;</span>
                      <span className="text-text-dim font-mono text-xs">
                        Type &apos;
                        <button
                          type="button"
                          onClick={() => handleCommandSubmit("help")}
                          className="text-gold hover:underline cursor-pointer font-mono text-xs bg-transparent border-none p-0 align-baseline focus:outline-none focus:ring-0"
                        >
                          help
                        </button>
                        &apos;, &apos;
                        <button
                          type="button"
                          onClick={() => handleCommandSubmit("cd strategies")}
                          className="text-gold hover:underline cursor-pointer font-mono text-xs bg-transparent border-none p-0 align-baseline focus:outline-none focus:ring-0"
                        >
                          cd strategies
                        </button>
                        &apos; or &apos;
                        <button
                          type="button"
                          onClick={() => handleCommandSubmit("cd tools")}
                          className="text-gold hover:underline cursor-pointer font-mono text-xs bg-transparent border-none p-0 align-baseline focus:outline-none focus:ring-0"
                        >
                          cd tools
                        </button>
                        &apos; to continue.
                      </span>
                    </div>,
                    revealTrigger
                  );
                }
                const cmdKey = getCmdKey(i);
                const swapTerms = HIGHLIGHT_TERMS["swap"];
                const terms =
                  HIGHLIGHT_TERMS[cmdKey] ??
                  (/^rm\s+-rf\s+\/$/.test(cmdKey) ? HIGHLIGHT_TERMS["rm -rf /"] : undefined) ??
                  (e.text.startsWith("VAULT_V2 // ") ? ["VAULT_V2"] : undefined) ??
                  (e.text.startsWith("VAULT // ") ? ["VAULT"] : undefined) ??
                  (cmdKey.startsWith("swap ") ? swapTerms : undefined) ??
                  (cmdKey.startsWith("wrap ") ? swapTerms : undefined) ??
                  (cmdKey.startsWith("unwrap ") ? swapTerms : undefined) ??
                  (cmdKey.startsWith("deposit ") ? ["VAULT"] : undefined) ??
                  (cmdKey.startsWith("withdraw ") ? ["VAULT"] : undefined) ??
                  (/^(cd|ls|dir|open|run|launch|exec|tree)( |$)|^\.\//.test(cmdKey) ? NAV_TERMS : undefined) ??
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
                // Both HEGEMON (V1) "VAULT // " and HEGEMON_V2 "VAULT_V2 // "
                // lines share the same status-word coloring.
                const vaultPrefix = e.text.startsWith("VAULT_V2 // ") ? "VAULT_V2 // " : "VAULT // ";
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
                    ) : e.boot ? (
                      <span className="text-text-dim font-mono text-xs whitespace-pre">
                        {e.workMs && e.pendingPrefix && isInLastBatch && outLineStart > settledLineIndex ? (
                          // Still working: label + caret spinning at the value slot
                          <>
                            <GlitchTypeText loading={false} value={e.pendingPrefix} mode="text" />
                            <BootSpinner />
                          </>
                        ) : (
                          renderBootSegments(e.text)
                        )}
                      </span>
                    ) : (
                      <span className="text-text-dim font-mono text-xs whitespace-pre">{renderSegments(e.text)}</span>
                    )}
                  </div>,
                  revealTrigger
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
              {(cwdName === "STRATEGIES"
                ? ["ls", "open usdt0", "open usdc", "open hegemon", "cd ..", "help"]
                : cwdName === "TOOLS"
                ? ["ls", "open mnemon", "open swap", "cd ..", "help"]
                : ["help", "cd strategies", "cd tools", "ls", "status", "balance"]
              ).map((c) => (
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

        {/* Status bar: replaces the site header on the landing. DOS/tmux-style
            single line — operator identity left, chain state + wallet right.
            The buttons echo their CLI commands so the log stays the record. */}
        <div className="shrink-0 border-t border-border/50 px-4 py-1.5 flex items-center justify-between gap-3 font-mono text-[9px] uppercase tracking-widest text-text-dim bg-bg-base select-none">
          <div className="flex items-center gap-2 min-w-0">
            {address ? (
              <>
                <span
                  className="w-1.5 h-1.5 bg-success rounded-full animate-pulse-slow shrink-0"
                  style={{
                    boxShadow:
                      "0 0 6px color-mix(in oklab, var(--success) 55%, transparent), 0 0 12px color-mix(in oklab, var(--success) 30%, transparent)",
                  }}
                  aria-hidden
                />
                <span className="truncate">
                  OPERATOR: <span className="text-white">{`${address.slice(0, 6)}…${address.slice(-4)}`}</span>
                </span>
              </>
            ) : (
              <span>OPERATOR: GUEST</span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline">
              HYPEREVM · BLOCK{" "}
              {blockNumber !== undefined
                ? blockNumber.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
                : "—"}{" "}
              · GAS {gasPriceWei !== null ? Number(formatUnits(gasPriceWei, 9)).toFixed(3) : "—"} GWEI
            </span>
            {address ? (
              <button
                type="button"
                onClick={() => {
                  setTerminalEntries((prev) => [
                    ...prev,
                    { kind: "in", text: "disconnect", prompt: promptRef.current },
                    { kind: "out", text: "Disconnected. Operator: Anonymous." },
                  ]);
                  disconnect();
                }}
                className="text-text-dim hover:text-danger transition-colors uppercase tracking-widest"
              >
                [ DISCONNECT ]
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTerminalEntries((prev) => [
                    ...prev,
                    { kind: "in", text: "connect", prompt: promptRef.current },
                    { kind: "out", text: "Opening wallet connector..." },
                  ]);
                  openConnectModal?.();
                }}
                className="text-gold hover:underline transition-colors uppercase tracking-widest"
              >
                [ CONNECT ]
              </button>
            )}
          </div>
        </div>

        {/* Pinned input row — prompt shows operator + cwd, the payoff of cd */}
        <div className="shrink-0 border-t border-border/30 p-4 pt-3 flex gap-2 items-center text-text-dim font-mono text-xs bg-bg-base">
          <span className="shrink-0 select-none whitespace-nowrap">
            <span className="text-text-dim/70 hidden sm:inline">{promptUser}@MYRMIDONS:</span>
            <span className="text-gold">{promptPath}</span>
            <span className="text-border"> &gt;</span>
          </span>
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
                  // Context-aware completion: entries of the cwd first, then
                  // directories, then the global command pool.
                  const cwdDir = cwdName ? resolveDir(cwdName) : null;
                  const pool: string[] = [
                    ...(cwdDir
                      ? cwdDir.children.flatMap((f) => [
                          `open ${f.name.toLowerCase()}`,
                          ...(f.route ? [`run ${f.name.toLowerCase()}`] : []),
                        ])
                      : []),
                    ...(cwdDir ? ["cd .."] : []),
                    ...FS_DIRS.map((d) => `cd ${d.name.toLowerCase()}`),
                    ...SUGGEST_POOL,
                  ];
                  const match =
                    pool.find((c) => c.startsWith(prefix)) ??
                    pool.find((c) => c.endsWith(prefix + "/") || c.endsWith(" " + prefix));
                  if (match) {
                    setCommandInput(match);
                    setSelectionStart(match.length);
                  }
                }
              }}
              placeholder="type help, cd strategies or cd tools"
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
                      { kind: "in", text: "exit", prompt: promptRef.current },
                      { kind: "out", text: "Closing STRATEGIES/..." },
                    ]);
                    setStrategiesPaneExiting(true);
                    setCwdName(null);
                    if (typeof window !== "undefined") window.location.hash = "";
                  }}
                >
                  <StrategiesWindowContent onCliEcho={echoPaneOpen} />
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
                      { kind: "in", text: "exit", prompt: promptRef.current },
                      { kind: "out", text: "Closing TOOLS/..." },
                    ]);
                    setToolsPaneExiting(true);
                    setCwdName(null);
                    if (typeof window !== "undefined") window.location.hash = "";
                  }}
                >
                  <ToolsWindowContent onLog={appendTerminalLine} onCliEcho={echoPaneOpen} />
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
              top: 0,
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
                  { kind: "in", text: "exit", prompt: promptRef.current },
                  { kind: "out", text: "Closing STRATEGIES/..." },
                ]);
                setStrategiesPaneExiting(true);
                setCwdName(null);
                if (typeof window !== "undefined") window.location.hash = "";
              }}
            >
              <StrategiesWindowContent onCliEcho={echoPaneOpen} />
            </FloatingWindow>
          </div>
        )}

        {/* TOOLS/ overlay sheet when viewport too small for split */}
        {(toolsOpen || toolsPaneExiting) && !useSplit && (
          <div
            className="fixed inset-0 z-40 transition-transform duration-1000"
            style={{
              top: 0,
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
                  { kind: "in", text: "exit", prompt: promptRef.current },
                  { kind: "out", text: "Closing TOOLS/..." },
                ]);
                setToolsPaneExiting(true);
                setCwdName(null);
                if (typeof window !== "undefined") window.location.hash = "";
              }}
            >
              <ToolsWindowContent onLog={appendTerminalLine} onCliEcho={echoPaneOpen} />
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
