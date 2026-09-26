"use client";

import { GlitchTypeText, BlinkCaret } from "@/components/ui/animated-text";
import { PhosphorAfterimage } from "@/components/terminal/PhosphorAfterimage";
import { ActiveLineGlow } from "@/components/terminal/ActiveLineGlow";
import { MatrixRain } from "@/components/terminal/MatrixRain";
import { CrtScreen, crtEnabled, powerOffCrt, setCrtEnabled } from "@/components/chrome/CrtScreen";
import { playSfx, setSfxEnabled, sfxEnabled } from "@/lib/terminal/sfx";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  HEGEMON_V2_VAULT_CHAIN_ID,
  USDC_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_CHAIN_ID,
  WHYPE_V2_VAULT_ADDRESS,
  WHYPE_V2_VAULT_CHAIN_ID,
} from "@/lib/constants/vaults";
import { useVaultMetadata, useVaultAllocations, useVaultApy, useVaultHistory } from "@/lib/morpho/queries";
import { pickAllocations, pickKpis, type KpiData } from "@/lib/morpho/view";
import { useMarketHealth, useMarketFlows } from "@/lib/mnemon/queries";
import { useRiskMarkets } from "@/lib/risk/queries";
import { computeMarketStats, isInvestable, isRealMarket, resolveMarketRef } from "@/lib/mnemon/aggregate";
import { chainTag, explorerTxUrl, fmtLltv, fmtPct, fmtUsd, MNEMON_CHAINS } from "@/lib/mnemon/format";
import type { MarketHealthEntry, MarketFlows } from "@/lib/mnemon/schemas";
import type { RiskMarkets } from "@/lib/risk/schemas";
import { CHAINS } from "@/lib/web3/chains";
import { VAULTS, findVault, resolveVaultRef, type VaultDef } from "@/lib/terminal/vaults";
import { CHANGELOG, allocLines, hard, marketCard, marketsLines, navLines, pairOf, parseMarketsArgs, resolveMarketAnywhere, statusLines, topLines } from "@/lib/terminal/report";
import { MARKET_METRICS, VAULT_METRICS, describeWatch, evaluateWatches, loadAliases, loadWatches, parseWatchArgs, saveAliases, saveWatches, type Watch } from "@/lib/terminal/watch";
import { formatEvent, isLegacyNoiseLine, tryParseJsonEvent } from "@/lib/logs/jsonl";
import { isHegemonStartupNoise, normalizeHegemonLine, stripAnsi } from "@/components/vault/ReallocatorTerminal";
import {
  accruedDebt,
  blueActionsSupported,
  blueSignaturesSupported,
  blueMarket,
  buildBlueAction,
  canCloseDebt,
  projectPosition,
  runBlueAction,
  safeMaxBorrow,
  safeWithdrawableCollateral,
  shouldCloseAll,
} from "@/lib/web3/blue";
import { usePortfolio } from "@/lib/web3/portfolio";
import { fetchMarketParams } from "@morpho-org/morpho-sdk/blue/fetch";
import type { MarketId } from "@morpho-org/morpho-sdk/blue/types";
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
import { WORDMARK_ROWS, WORDMARK_CHARSET } from "@/lib/landing/wordmark";
import { cn } from "@/lib/utils";
import { FloatingWindow } from "@/components/ui/FloatingWindow";
import StrategiesWindowContent from "@/components/landing/StrategiesWindowContent";
import ToolsWindowContent from "@/components/tools/ToolsWindowContent";
import { FolderSvg, FOLDER_CLIP_PATH } from "@/components/ui/folder-svg";
import { useAccount, useBlockNumber, usePublicClient, useWalletClient, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { createPublicClient, formatUnits, http, parseUnits, maxUint256, type Address } from "viem";
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
  redeem,
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
import { DOCS as DOC_PAGES, getDocByManName, renderDocToMan } from "@/lib/docs/content";
import { MAN_TONE_CLASS, highlightManLine } from "@/lib/docs/man-highlight";
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
  /** man-page line: rendered with semantic colouring (lib/docs/man-highlight). */
  man?: boolean;
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

/** The sound a line makes as it reveals (the teaser's mapping): wordmark rows crackle with
 *  block static, POST lines seek the disk (the POST header beeps, spinners keep it working),
 *  everything else types in with a short burst of keys. Blank spacers are silent. */
type LineSfx = "static" | "beep" | "seek" | "type" | "error" | "ok";
/** Status lines by their status word (the renderer's colouring): errors buzz the PC speaker,
 *  confirmations chirp it, everything else types. */
function lineKind(text: string): LineSfx {
  const word = text.replace(/^[A-Z_0-9]+ \/\/ /, "").split(" ")[0] ?? "";
  if (word.startsWith("ERROR") || word.includes("REVERTED") || word.includes("REJECTED")) return "error";
  if (/^\w+: (?:no such|cannot|permission denied)|^Unknown /.test(text)) return "error";
  if (word.includes("CONFIRMED") || word === "APPROVED" || word === "SWITCHED") return "ok";
  return "type";
}
function lineSfx(kind: LineSfx, text: string, workMs: number) {
  if (!text.trim()) return;
  if (kind === "error") return playSfx("buzz");
  if (kind === "ok") return playSfx("chirp");
  if (kind === "static") return playSfx("static", { gain: 0.8 });
  if (kind === "beep") { playSfx("beep"); return playSfx("seek"); }
  if (kind === "seek") {
    playSfx("seek", { gain: 0.8 });
    if (workMs > 0) playSfx("seek", { delay: workMs / 2000, gain: 0.6 });
    return;
  }
  const n = Math.min(4, Math.max(1, Math.round(text.length / 14)));
  for (let k = 0; k < n; k++) playSfx("key", { delay: k * 0.045, gain: 0.55 });
}
/** Keyboard thock for the operator's own keys; Enter lands heavier. */
function keySfx(key: string) {
  if (key === "Enter") playSfx("key", { rate: 0.8 });
  else if (key.length === 1 || key === "Backspace" || key === "Tab") playSfx("key", { gain: 0.75 });
}
/** A pane mounting: the relay clicks, the drive spins for the 1s slide and reads the
 *  directory. Closing: the drive spins down and the relay drops. */
function paneSfx(open: boolean) {
  if (open) {
    playSfx("relay");
    playSfx("whirr", { delay: 0.02 });
    for (const d of [0.25, 0.42, 0.61]) playSfx("seek", { delay: d, gain: 0.7 });
  } else {
    playSfx("whirrDown");
    playSfx("relay", { delay: 0.5, gain: 0.8 });
  }
}
/** A shard slotting in (selected) or ejecting (deselected), like a cartridge: the latch
 *  seats it, a struck-metal ping says it's in; out, the slot's spring twangs. */
function shardSfx(slotted: boolean) {
  if (slotted) { playSfx("latch"); playSfx("ping", { delay: 0.12 }); playSfx("seek", { delay: 0.2, gain: 0.6 }); }
  else { playSfx("latch", { rate: 1.25, gain: 0.7 }); playSfx("twang", { delay: 0.05 }); }
}

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
  [/\bONLINE$/, "text-success glow-green"],
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
  { href: "https://t.me/OxAchilles", label: "Telegram: @OxAchilles" },
];

/** Market (Morpho Blue) command grammar — shared by usage errors and `help market`. */
const MARKET_USAGE: Record<string, string> = {
  markets: "markets [coll/loan | symbol | id-prefix] [--chain <name>] [--loan <symbol>] [--sort apy|supply|util|borrow] [--n <count>] [--investable]",
  lend: "lend <amt|max|half> <market>",
  unlend: "unlend <amt|max|half> <market>",
  borrow: "borrow <amt|max> <market> [collateral <amt|max|half>]",
  repay: "repay <amt|max|half> <market> [withdraw <amt|max>]",
  position: "position <market>",
};

/** `chain <name|id>` aliases: MNEMON labels/tags, viem chain names, a few shorthands. */
function resolveChainRef(ref: string): number | null {
  const q = ref.trim().toLowerCase();
  if (/^\d+$/.test(q)) return CHAINS.some((c) => c.id === Number(q)) ? Number(q) : null;
  const extra: Record<string, number> = { eth: 1, mainnet: 1, hype: 999, hevm: 999, arb: 42161, rh: 4663 };
  if (extra[q]) return extra[q];
  for (const c of CHAINS) {
    const m = MNEMON_CHAINS.find((x) => x.id === c.id);
    if ([c.name, m?.label, m?.tag].some((s) => s?.toLowerCase() === q)) return c.id;
  }
  return null;
}

// Commands whose output is a report: coloured by meaning, like man pages (see the renderer)
const REPORT_CMDS = /^(help|\?|commands|status|alloc|allocations|nav|market|top|watch|changelog|log|permissions|vault stats|vaultstats|stats|apr|apy|tvl|version|ver|ls|dir|tree|alias|network|chain|chains|gas|block|rpc|time|uptime|whoami|balance)( |$)/;
const formatGweiOf = (wei: bigint | null): string => {
  if (wei === null) return "—";
  const gwei = Number(wei) / 1e9;
  return gwei < 0.001 ? gwei.toExponential(2) : gwei.toFixed(3);
};

// Terminal out-lines collapse whitespace — pad with NBSP for columns.
const nb = (s: string, n: number) => s.padEnd(n, " ");

const SUGGEST_POOL = [
  "help market",
  "portfolio",
  "run portfolio",
  "man hegemon",
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
  "open whype",
  "open mnemon",
  "run mnemon",
  "alloc",
  "nav",
  "tail",
  "market ",
  "markets ",
  "top",
  "top usdc",
  "watch",
  "alias",
  "export",
  "tx ",
  "permissions",
  "changelog",
  "help shell",
  "help vault",
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
  help: ["cd strategies", "cd tools", "ls", "tree", "open usdt0", "open usdc", "open mnemon", "open", "run", "deposit-v2", "withdraw-v2", "balance", "swap", "lend", "borrow", "position", "portfolio", "man", "socials", "contact", "status", "gas", "block", "whoami", "connect", "clear", "history", "Tab", "MYRMIDONS", "Quick Reference", "Navigate", "Invest", "Markets", "Tools", "Reach us", "System", "help"],
  "help market": ["markets", "lend", "unlend", "borrow", "repay", "position", "chain", "max", "half", "collateral", "withdraw"],
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
  commands: ["open strategies/", "hegemon", "status", "vault stats", "balance", "gas", "block", "whoami", "contact", "help", "manifest"],
  "?": ["open strategies/", "hegemon", "status", "vault stats", "balance", "gas", "block", "whoami", "contact", "help", "manifest"],
  suggest: ["SUGGESTED", "COMMANDS"],
  history: ["COMMAND", "HISTORY"],
  "open hegemon-v2": ["STRATEGIES/", "MYRMIDONS_USDT0"],
  "hegemon-v2": ["STRATEGIES/", "MYRMIDONS_USDT0"],
  v2: ["STRATEGIES/", "MYRMIDONS_USDT0"],
  "open usdc": ["STRATEGIES/", "MYRMIDONS_USDC"],
  usdc: ["STRATEGIES/", "MYRMIDONS_USDC"],
  "open whype": ["STRATEGIES/", "MYRMIDONS_WHYPE"],
  whype: ["STRATEGIES/", "MYRMIDONS_WHYPE"],
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
 *  and each row glitch-types like any other line. Shared with the landing
 *  hero via lib/landing/wordmark.ts. */
const BOOT_WORDMARK_ROWS = WORDMARK_ROWS;
const BOOT_WORDMARK_CHARSET = WORDMARK_CHARSET;

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
  { label: "detecting chains ........ ", value: `${MNEMON_CHAINS.length} ONLINE`, work: 300 },
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
  // A caret blinks on the empty screen for a beat after power-on, then the rows sweep in fast
  ...BOOT_WORDMARK_ROWS.map((text, i) => ({ kind: "out" as const, text, ascii: true, delay: i === 0 ? 2300 : 45 })),
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

/** One vault's live figures for the shell: KPIs (the tiles' numbers), allocations and 30d history. */
interface VaultBundle {
  def: VaultDef;
  kpis: KpiData | null;
  kpisLoading: boolean;
  tvlUsd: number | null;
  netApyPct: number | null;
  allocations: ReturnType<typeof pickAllocations>;
  history: import("@/lib/morpho/schemas").HistoryPoint[] | null;
}
function useVaultBundle(def: VaultDef): VaultBundle {
  const metadata = useVaultMetadata(def.address, def.chainId, true);
  const apy = useVaultApy(def.address, def.chainId, true);
  const allocations = useVaultAllocations(def.address, def.chainId, true);
  const history = useVaultHistory(def.address, "30d", def.chainId, true);
  const kpis = metadata.data != null || apy.data != null ? pickKpis(metadata.data ?? null, apy.data ?? null, allocations.data ?? null) : null;
  const tvlRaw = metadata.data?.vaultByAddress?.state?.totalAssetsUsd;
  const apyRaw = apy.data?.vaultByAddress?.state?.netApy ?? metadata.data?.vaultByAddress?.state?.netApy;
  return {
    def,
    kpis,
    kpisLoading: metadata.isLoading || apy.isLoading,
    tvlUsd: tvlRaw != null && Number.isFinite(Number(tvlRaw)) ? Number(tvlRaw) : null,
    netApyPct: apyRaw != null && Number.isFinite(Number(apyRaw)) ? Number(apyRaw) * 100 : null,
    allocations: allocations.data ? pickAllocations(allocations.data as Parameters<typeof pickAllocations>[0]) : [],
    history: history.data ?? null,
  };
}

/** The terminal only exists once its tube powers on: the boot sequence starts with the power-on. */
export default function TerminalPage() {
  return <CrtScreen><TerminalOS /></CrtScreen>;
}

function TerminalOS() {
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
  const [sfxOn, setSfxOn] = useState(true);               // persisted per browser (lib/terminal/sfx)
  const [crtOn, setCrtOn] = useState(true);               // persisted per browser (CrtScreen)
  useEffect(() => { setSfxOn(sfxEnabled()); setCrtOn(crtEnabled()); }, []);
  // pane and shard sounds follow their state changes (never the first render)
  const sfxPrev = useRef({ strategies: false, tools: false, entry: null as string | null });
  const revealHeard = useRef({ batch: -2, lines: 0 });
  useEffect(() => {
    const prev = sfxPrev.current, entry = selectedEntry?.id ?? null;
    if (strategiesOpen !== prev.strategies) paneSfx(strategiesOpen);
    if (toolsOpen !== prev.tools) paneSfx(toolsOpen);
    if (entry !== prev.entry) shardSfx(entry !== null);
    sfxPrev.current = { strategies: strategiesOpen, tools: toolsOpen, entry };
  }, [strategiesOpen, toolsOpen, selectedEntry]);
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
  const { switchChainAsync } = useSwitchChain();
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

  // Fetch vault balances (MYRMIDONS_USDT0) when connected to HyperEVM
  useEffect(() => {
    if (!publicClient || !address || chainId !== HEGEMON_V2_VAULT_CHAIN_ID) {
      setVaultBalanceData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const assetAddress = await getVaultAssetAddress(
          HEGEMON_V2_VAULT_ADDRESS as `0x${string}`,
          publicClient
        );
        const [balances, assetMeta, vaultDecimals] = await Promise.all([
          readBalances({
            account: address,
            assetAddress,
            vaultAddress: HEGEMON_V2_VAULT_ADDRESS as `0x${string}`,
            publicClient,
          }),
          readAssetMeta(assetAddress, publicClient),
          readVaultDecimals(HEGEMON_V2_VAULT_ADDRESS as `0x${string}`, publicClient),
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

  // The three vaults' live figures (the tiles' numbers), for every vault command
  const vaultBundleUsdt0 = useVaultBundle(VAULTS[0]);
  const vaultBundleUsdc = useVaultBundle(VAULTS[1]);
  const vaultBundleWhype = useVaultBundle(VAULTS[2]);
  const vaultBundles: VaultBundle[] = [vaultBundleUsdt0, vaultBundleUsdc, vaultBundleWhype];
  const vaultKpis: KpiData | null = vaultBundleUsdt0.kpis;
  const vaultKpisLoading = vaultBundleUsdt0.kpisLoading;
  const riskMarkets = useRiskMarkets();
  const marketFlows = useMarketFlows();

  // Shell state kept per browser: watches (alerts) and aliases. Saved as they change.
  const [watches, setWatchesState] = useState<Watch[]>([]);
  const [aliases, setAliasesState] = useState<Record<string, string>>({});
  useEffect(() => { setWatchesState(loadWatches()); setAliasesState(loadAliases()); }, []);
  const setWatches = useCallback((w: Watch[]) => { setWatchesState(w); saveWatches(w); }, []);
  const setAliases = useCallback((a: Record<string, string>) => { setAliasesState(a); saveAliases(a); }, []);

  // tail: the keeper stream into the log, until q / Esc / tail stop
  const tailRef = useRef<EventSource | null>(null);
  const stopTail = useCallback((why: string) => {
    if (!tailRef.current) return;
    tailRef.current.close();
    tailRef.current = null;
    playSfx("relay");
    setTerminalEntries((prev) => [...prev, { kind: "out", text: `FEED // STOPPED  ${why}` }]);
  }, []);
  useEffect(() => () => { tailRef.current?.close(); }, []);

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
      if (e.kind === "out") {
        const sfx: LineSfx = e.ascii ? "static" : e.boot ? (e.text.startsWith("POST //") ? "beep" : "seek") : lineKind(e.text);
        return [{ gap: e.delay ?? 70, work: e.workMs ?? 0, text: e.text, sfx }];
      }
      if (e.kind === "links") return e.items.map((it) => ({ gap: 70, work: 0, text: it.label, sfx: "type" as LineSfx }));
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
    // A later append re-reveals the whole batch: lines heard once stay silent
    const heard = revealHeard.current.batch === lastInIdx ? revealHeard.current.lines : 0;
    revealHeard.current = { batch: lastInIdx, lines: Math.max(heard, steps.length) };
    let lineIndex = -1;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (lineIndex < steps.length - 1) timer = setTimeout(reveal, steps[lineIndex + 1].gap);
    };
    const reveal = () => {
      lineIndex += 1;
      setRevealingLineIndex(lineIndex);
      const { work, text, sfx } = steps[lineIndex];
      if (lineIndex >= heard) lineSfx(sfx, text, work);
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
    vaults: VaultBundle[];
    markets: MarketHealthEntry[];
    generatedAt: string | null | undefined;
    risk: RiskMarkets | undefined;
    flows: MarketFlows | undefined;
    watches: Watch[];
    aliases: Record<string, string>;
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
          { kind: "out", text: "  cd .. / back               up one level (at / exits to the landing)" },
          { kind: "out", text: "  pwd / tree                 where am I / full map" },
        ];
      }
      if (topic === "vault" || topic === "vaults") {
        return [
          { kind: "out", text: "HELP - vaults (MYRMIDONS_USDT0 · MYRMIDONS_USDC · MYRMIDONS_WHYPE, Morpho Vault V2 on HyperEVM)" },
          { kind: "out", text: "  [vault] = usdt0 | usdc | whype. Omitted: the slotted shard's vault, else usdt0." },
          { kind: "out", text: "  open usdt0 / usdc / whype          slot a vault's shard" },
          { kind: "out", text: "  vault stats [vault]                TVL, net APY, utilisation" },
          { kind: "out", text: "  apr [vault] / tvl [vault]          one figure" },
          { kind: "out", text: "  alloc [vault]                      the allocation table (markets, weights, APY, util, MNEMON status)" },
          { kind: "out", text: "  nav [vault]                        APY and TVL history as a line chart (30d)" },
          { kind: "out", text: "  tail [vault]                       stream the HEGEMON_V2 keeper log here (q stops)" },
          { kind: "out", text: "  deposit <amt|max|half> [vault]     deposit the vault's asset" },
          { kind: "out", text: "  withdraw <amt|max|half> [vault]    redeem shares" },
          { kind: "out", text: "  balance                            wallet tokens + shares in every vault" },
        ];
      }
      if (topic === "system") {
        return [
          { kind: "out", text: "HELP - system" },
          { kind: "out", text: "  status                     index, chains, vaults, wallet — live" },
          { kind: "out", text: "  chain [<name|id>]          wallet chains / switch" },
          { kind: "out", text: "  block [chain] / gas [chain] / rpc / ping    the wallet's chain, or the one named" },
          { kind: "out", text: "  tx <hash>                  receipt status on the wallet's chain" },
          { kind: "out", text: "  uptime, time, version, changelog" },
        ];
      }
      if (topic === "identity") {
        return [
          { kind: "out", text: "HELP - identity" },
          { kind: "out", text: "  whoami" },
          { kind: "out", text: "  connect, disconnect" },
          { kind: "out", text: "  permissions                what this wallet can do from here, on this chain" },
        ];
      }
      if (topic === "shell") {
        return [
          { kind: "out", text: "HELP - shell" },
          { kind: "out", text: "  alias <name> <command…>    define a shortcut (alias top5 top usdc)  ·  alias lists  ·  unalias <name>" },
          { kind: "out", text: "  !!                         repeat the last command" },
          { kind: "out", text: "  a && b                     run a, then b" },
          { kind: "out", text: "  watch <market|vault> <metric> <op> <value>   ring when it crosses (watch whype/usdc apy > 6, watch usdc tvl < 1000)" },
          { kind: "out", text: `  watch metrics              market: ${Object.keys(MARKET_METRICS).join(" ")}  ·  vault: ${VAULT_METRICS.join(" ")}  ·  watch / watch rm <id> / watch clear` },
          { kind: "out", text: "  export                     save this session's log as a text file" },
          { kind: "out", text: "  history, clear, Tab, ↑↓, Esc (stops a tail)" },
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
      if (topic === "market" || topic === "markets") {
        return [
          { kind: "out", text: `HELP - markets (Morpho Blue on ${MNEMON_CHAINS.length} chains, via MNEMON — same rules as the analyser's panel)` },
          ...Object.values(MARKET_USAGE).map((u) => ({ kind: "out" as const, text: `  ${u}` })),
          { kind: "out", text: "  markets flags: --chain <name> --loan <symbol> --sort apy|supply|util|borrow --n <count> --investable" },
          { kind: "out", text: "  market <market>    the analyser's drill-down as a card: rates, book, risk, collateral, oracle, flows, gates" },
          { kind: "out", text: "  top [loan] [chain] best investable markets by supply APY (top usdc, top usdc base)" },
          { kind: "out", text: "  chain [<name|id>]  —  list wallet chains / switch (chain hevm, chain 42161)" },
          { kind: "out", text: "  <market> = COLL/LOAN[@LLTV] (whype/usdc, whype/usdc@77) or a market id prefix (0xd7d382…)" },
          { kind: "out", text: "  max on unlend/repay closes by shares (dust-free); borrow max = 90% of the safe maximum" },
          { kind: "out", text: "  actions run on the wallet's current chain — 'markets' lists every chain, 'chain' switches" },
        ];
      }
      return [{ kind: "out", text: "Unknown help topic. Try: help nav | help vault | help market | help system | help shell | help identity | help lore" }];
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
      hegemon: "open MYRMIDONS_USDT0",
      morpho: "open MYRMIDONS_USDT0",
      vault: "open MYRMIDONS_USDT0",
      "hegemon-v2": "open MYRMIDONS_USDT0",
      hegemon_v2: "open MYRMIDONS_USDT0",
      v2: "open MYRMIDONS_USDT0",
      usdc: "open MYRMIDONS_USDC",
      whype: "open MYRMIDONS_WHYPE",
      hype: "open MYRMIDONS_WHYPE",
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
      // Up one level: deselect first, then unmount. One more level above the
      // FS root exists: the landing page — cd .. there exits the shell.
      if (arg === ".." || arg === "../") {
        if (opts.selected) {
          deselectEntry();
          return [];
        }
        if (opts.cwd) {
          closeToRoot();
          return [];
        }
        router.push("/");
        return [out("Exiting shell. Surfacing to landing...")];
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
      // At the FS root the only level left is the landing page: the tube powers off first.
      setTimeout(() => router.push("/"), powerOffCrt());
      return [out("Exiting shell. Surfacing to landing...")];
    }

    if (cmd === "pwd") {
      return [out(pwdPath())];
    }

    if (cmd === "status") {
      return statusLines({
        markets: opts.markets,
        generatedAt: opts.generatedAt,
        vaults: opts.vaults.map((v) => ({ name: v.def.name, kpis: v.kpis, loading: v.kpisLoading })),
        chainId: opts.chainId,
        block: opts.blockNumber,
        gasGwei: formatGweiOf(opts.gasPriceWei),
        address: opts.address,
      }).map((t) => out(hard(t)));
    }

    if (cmd === "whoami") {
      if (opts.address) return [{ kind: "out", text: `Operator: ${opts.address}` }];
      return [{ kind: "out", text: "Anonymous operator." }];
    }

    if (cmd === "version" || cmd === "ver") {
      return [{ kind: "out", text: `MYRMIDONS OS v0.9.3  ·  build ${BOOT_BUILD_ID}  ·  ${CHANGELOG[0][0]}` }];
    }

    // `commands`, `?` and `hint` were three thinner copies of help
    if (cmd === "commands" || cmd === "?" || cmd === "hint") return runCommand("help", opts);

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

    const walletChain = CHAINS.find((c) => c.id === opts.chainId);
    const chainName = walletChain?.name ?? `chain ${opts.chainId}`;
    if (cmd === "gas") {
      const gwei = formatGwei(opts.gasPriceWei);
      const usd =
        gasUsd !== null && walletChain?.nativeCurrency.symbol === "HYPE" ? (gasUsd < 0.01 ? "<$0.01" : `≈$${gasUsd.toFixed(2)}`) : "—";
      return [
        { kind: "out", text: `${chainName} - Gas price (native ${walletChain?.nativeCurrency.symbol ?? "—"})` },
        { kind: "out", text: `  ${gwei} gwei (simple tx: ${usd})  ·  'gas <chain>' reads another chain` },
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
        { kind: "out", text: `${chainName} - Latest block` },
        { kind: "out", text: `  ${blockStr}  ·  'block <chain>' reads another chain` },
      ];
    }

    if (cmd === "network" || cmd === "chain" || cmd === "chains") {
      return [
        { kind: "out", text: "WALLET CHAINS  (chain <name|id> switches the wallet)" },
        ...CHAINS.map((c) => ({
          kind: "out" as const,
          text: `  ${c.id === opts.chainId ? "●" : "○"} ${nb(chainTag(c.id), 5)} ${nb(c.name, 16)} ${c.id}${c.id === opts.chainId ? "  CURRENT" : ""}`,
        })),
      ];
    }

    if (cmd === "rpc") {
      return [
        { kind: "out", text: "RPC ENDPOINT" },
        { kind: "out", text: `Chain: ${chainName} (${opts.chainId})` },
        { kind: "out", text: `URL: ${walletChain?.rpcUrls.default.http[0] ?? "—"}` },
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

    if (cmd === "deposit" || cmd === "deposit-v2") {
      return [{ kind: "out", text: "Usage: deposit <amount|max|half> [usdt0|usdc|whype] - deposit into a MYRMIDONS vault (default: the slotted shard's)" }];
    }
    if (cmd === "withdraw" || cmd === "withdraw-v2") {
      return [{ kind: "out", text: "Usage: withdraw <amount|max|half> [usdt0|usdc|whype] - redeem shares from a MYRMIDONS vault (default: the slotted shard's)" }];
    }
    if (cmd in MARKET_USAGE) {
      return [
        { kind: "out", text: `Usage: ${MARKET_USAGE[cmd]}` },
        { kind: "out", text: "  <market> = COLL/LOAN[@LLTV] (whype/usdc, whype/usdc@77) or a market id prefix (0xd7d382…)" },
      ];
    }

    // ── Vault reads: apr / tvl / vault stats / alloc / nav, on the vault named,
    // else the slotted shard's, else USDT0 ────────────────────────────────
    const vaultRead = cmd.match(/^(apr|apy|tvl|vault stats|vaultstats|stats|alloc|allocations|nav)(?:\s+(\S+))?(?:\s+(\S+))?$/);
    if (vaultRead) {
      const [, verb, a1, a2] = vaultRead;
      // nav takes [vault] [range] in either order
      const isRange = (s?: string) => s != null && /^(7d|30d|90d|1d)$/.test(s);
      const vaultArg = verb === "nav" ? [a1, a2].find((s) => s && !isRange(s)) : a1;
      const range = verb === "nav" ? [a1, a2].find(isRange) ?? "30d" : undefined;
      const r = resolveVaultRef(vaultArg, opts.selected?.id);
      if ("error" in r) return [out(`VAULT // ERROR  ${r.error}`)];
      const b = opts.vaults.find((v) => v.def.key === r.vault.key)!;
      const via = r.from === "shard" ? "  (slotted shard)" : r.from === "default" ? "  (default — name usdt0, usdc or whype)" : "";
      if (verb === "alloc" || verb === "allocations") return allocLines(b.def.name, b.allocations, opts.markets).map((t) => out(hard(t)));
      if (verb === "nav") {
        if (range !== "30d") return [out(`VAULT // ${b.def.name}  nav reads the 30d history the page keeps — other ranges not wired yet`)];
        return navLines(b.def.name, b.history ?? [], range).map((t) => out(hard(t)));
      }
      if (b.kpisLoading) return [out(`Fetching ${b.def.name}…`)];
      const k = b.kpis;
      if (verb === "apr" || verb === "apy") return [out(`${b.def.name} (Vault V2) - Net APY${via}`), out(`  ${k?.netApyPct ?? "—"}`)];
      if (verb === "tvl") return [out(`${b.def.name} (Vault V2) - Total value locked${via}`), out(`  ${k?.tvlUsd ?? "—"}`)];
      return [
        out(`${b.def.name} (Vault V2) - Vault stats${via}`),
        out(`  Net APY: ${k?.netApyPct ?? "—"}`),
        out(`  TVL: ${k?.tvlUsd ?? "—"}`),
        out(`  Avg utilization: ${k?.utilizationPct ?? "—"}`),
        out(`  Allocations: ${b.allocations.length} rows  ·  'alloc ${b.def.key}' for the table, 'nav ${b.def.key}' for the history`),
      ];
    }

    // ── market <ref> — the analyser's drill-down as a card ────────────────
    const marketCardMatch = cmd.match(/^market\s+(\S+)$/);
    if (marketCardMatch) {
      const ref = marketCardMatch[1];
      const real = opts.markets.filter(isRealMarket);
      const resolved = resolveMarketAnywhere(real, ref, opts.chainId);
      if (!resolved.ok) return [out(`MARKET // ERROR  ${resolved.error}`), ...resolved.candidates.map((c) => out(`MARKET //   ${c}`))];
      const m = resolved.market;
      const risk = opts.risk?.markets[m.market_id];
      const best = real
        .filter((x) => (x.chain_id ?? 999) === (m.chain_id ?? 999) && x.loan_symbol === m.loan_symbol && isInvestable(x))
        .sort((x, y) => (y.supply_apy ?? 0) - (x.supply_apy ?? 0))[0];
      return marketCard(m, risk && risk.chain_id === (m.chain_id ?? 999) ? risk : undefined, opts.flows, best).map((t, i) => out(hard(i === 0 ? `MARKET // ${t}` : t)));
    }

    // ── top [loan] [chain] ────────────────────────────────────────────────
    const topMatch = cmd.match(/^top(?:\s+(\S+))?(?:\s+(\S+))?$/);
    if (topMatch) {
      const args = [topMatch[1], topMatch[2]].filter((s): s is string => !!s);
      let loan: string | undefined, chain: number | undefined;
      for (const a of args) {
        const id = resolveChainRef(a);
        if (id != null) chain = id;
        else loan = a;
      }
      return topLines(opts.markets, { loan, chainId: chain }).map((t) => out(hard(t)));
    }

    // ── watch ─────────────────────────────────────────────────────────────
    if (cmd === "watch" || cmd === "watch list") {
      if (opts.watches.length === 0) return [out("WATCH // none — watch <market|vault> <metric> <op> <value>  (help shell)")];
      return [out(`WATCH // ${opts.watches.length} armed`), ...opts.watches.map((w) => out(hard(`  #${w.id}  ${describeWatch(w)}${w.fired ? "  (ringing)" : ""}`)))];
    }
    if (cmd === "watch clear") {
      setWatches([]);
      return [out("WATCH // CLEARED")];
    }
    const watchRm = cmd.match(/^watch\s+(?:rm|remove|del)\s+#?(\d+)$/);
    if (watchRm) {
      const id = Number(watchRm[1]);
      if (!opts.watches.some((w) => w.id === id)) return [out(`WATCH // ERROR  NO_SUCH_WATCH  #${id}`)];
      setWatches(opts.watches.filter((w) => w.id !== id));
      return [out(`WATCH // REMOVED  #${id}`)];
    }
    const watchAdd = raw.trim().match(/^watch\s+(\S+)\s+(\S+)\s+(<=|>=|<|>)\s+(\S+)$/i);
    if (watchAdd) {
      const [, target, metric, op, value] = watchAdd;
      const parsed = parseWatchArgs([metric, op, value]);
      if ("error" in parsed) return [out(`WATCH // ERROR  ${parsed.error}`)];
      const id = (opts.watches.reduce((m, w) => Math.max(m, w.id), 0) || 0) + 1;
      const base = { id, op: parsed.op, value: parsed.value, metric: parsed.metric, fired: false, created: Date.now() };
      const vault = findVault(target);
      let w: Watch;
      if (vault) {
        if (!(VAULT_METRICS as readonly string[]).includes(parsed.metric)) return [out(`WATCH // ERROR  VAULT_METRIC  ${VAULT_METRICS.join(" | ")}`)];
        w = { ...base, kind: "vault", vault: vault.key, label: vault.name };
      } else {
        if (!MARKET_METRICS[parsed.metric]) return [out(`WATCH // ERROR  MARKET_METRIC  ${Object.keys(MARKET_METRICS).join(" | ")}`)];
        const resolved = resolveMarketAnywhere(opts.markets, target, opts.chainId);
        if (!resolved.ok) return [out(`WATCH // ERROR  ${resolved.error}`), ...resolved.candidates.map((c) => out(`WATCH //   ${c}`))];
        const m = resolved.market;
        w = { ...base, kind: "market", marketId: m.market_id, chainId: m.chain_id ?? 999, label: `${chainTag(m.chain_id ?? 999)} ${pairOf(m)}` };
      }
      setWatches([...opts.watches, w]);
      return [out(hard(`WATCH // ARMED  #${id}  ${describeWatch(w)}  — checked on every data refresh (~2 min)`))];
    }
    if (cmd.startsWith("watch")) return [out("Usage: watch <market|vault> <metric> <op> <value>  ·  watch  ·  watch rm <id>  ·  watch clear")];

    // ── alias / unalias ───────────────────────────────────────────────────
    if (cmd === "alias") {
      const names = Object.keys(opts.aliases);
      if (names.length === 0) return [out("ALIAS // none — alias <name> <command…>")];
      return names.map((n) => out(hard(`alias ${n.padEnd(12)} ${opts.aliases[n]}`)));
    }
    const aliasAdd = raw.trim().match(/^alias\s+(\S+)\s+(.+)$/i);
    if (aliasAdd) {
      const name = aliasAdd[1].toLowerCase();
      if (/^(alias|unalias|!!)$/.test(name)) return [out(`ALIAS // ERROR  RESERVED  ${name}`)];
      setAliases({ ...opts.aliases, [name]: aliasAdd[2].trim() });
      return [out(`ALIAS // SET  ${name} → ${aliasAdd[2].trim()}`)];
    }
    const unalias = cmd.match(/^unalias\s+(\S+)$/);
    if (unalias) {
      if (!opts.aliases[unalias[1]]) return [out(`ALIAS // ERROR  NO_SUCH_ALIAS  ${unalias[1]}`)];
      const next = { ...opts.aliases };
      delete next[unalias[1]];
      setAliases(next);
      return [out(`ALIAS // REMOVED  ${unalias[1]}`)];
    }

    // ── export — the session log as a text file ───────────────────────────
    if (cmd === "export" || cmd === "save") {
      const text = terminalEntries
        .map((e) => (e.kind === "in" ? `${e.prompt?.user ?? "GUEST"}@MYRMIDONS:${e.prompt?.path ?? "/"} > ${e.text}` : e.kind === "out" ? e.text : e.items.map((i) => `${i.label}  ${i.href}`).join("\n")))
        .join("\n");
      const name = `myrmidons-session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return [out(`EXPORT // SAVED  ${name}  (${terminalEntries.length} entries)`)];
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
        { kind: "out", text: "  Vaults — MYRMIDONS_USDT0 / USDC / WHYPE (Morpho Vault V2, in dev). [vault] defaults to the slotted shard" },
        { kind: "out", text: `    ${pad("vault stats [vault]")}TVL, net APY, utilisation — apr / tvl for one figure` },
        { kind: "out", text: `    ${pad("alloc [vault]")}Allocation table with MNEMON status` },
        { kind: "out", text: `    ${pad("nav [vault]")}APY and TVL history, as a line chart` },
        { kind: "out", text: `    ${pad("tail [vault]")}Stream the HEGEMON_V2 keeper log here (q stops)` },
        { kind: "out", text: `    ${pad("deposit <amt> [vault]")}Deposit — withdraw <amt> [vault] redeems shares` },
        { kind: "out", text: `    ${pad("balance")}Wallet tokens + shares in every vault` },
        { kind: "out", text: "" },
        { kind: "out", text: `  Markets — Morpho Blue on ${MNEMON_CHAINS.length} chains, via MNEMON` },
        { kind: "out", text: `    ${pad("markets <query> [flags]")}Find markets — markets usdc --chain base --sort apy` },
        { kind: "out", text: `    ${pad("market <market>")}Drill-down card: rates, book, risk, oracle, flows, gates` },
        { kind: "out", text: `    ${pad("top [loan] [chain]")}Best investable markets by APY` },
        { kind: "out", text: `    ${pad("lend <amt> <market>")}Supply a market — borrow / repay / unlend: help market` },
        { kind: "out", text: `    ${pad("position <market>")}Your supply / collateral / debt / health` },
        { kind: "out", text: `    ${pad("portfolio")}Every position, vaults + markets (run portfolio for the page)` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Tools" },
        { kind: "out", text: `    ${pad("open mnemon")}Market analyser (the page: run mnemon)` },
        { kind: "out", text: `    ${pad("swap <amt> <in> <out>")}Onchain swap — swap 1 hype usdt0` },
        { kind: "out", text: `    ${pad("watch <target> <m> <op> <v>")}Ring when a market or vault metric crosses — help shell` },
        { kind: "out", text: "" },
        { kind: "out", text: "  Reach us" },
        { kind: "out", text: `    ${pad("socials / contact")}X (×2), Telegram` },
        { kind: "out", text: "" },
        { kind: "out", text: "  System" },
        { kind: "out", text: `    ${pad("status")}Index, chains, vaults, wallet — live` },
        { kind: "out", text: `    ${pad("chain / block / gas / tx")}The wallet's chain — chain <name> switches` },
        { kind: "out", text: `    ${pad("whoami / connect")}Operator identity — permissions says what you can do` },
        { kind: "out", text: `    ${pad("alias / !! / && / export")}Shell — help shell` },
        { kind: "out", text: `    ${pad("clear / history / Tab")}Session` },
        { kind: "out", text: "" },
        { kind: "out", text: 'Topics: help nav · help vault · help market · help system · help shell · help identity · help lore' },
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
      const onVaultChain = opts.chainId === VAULTS[0].chainId;
      return [
        { kind: "out", text: "ACCESS POSTURE" },
        { kind: "out", text: `  Operator     ${opts.address ? `${opts.address.slice(0, 6)}…${opts.address.slice(-4)}  (wallet connected)` : "GUEST  — reads only; 'connect' to write"}` },
        { kind: "out", text: `  Chain        ${chainName} (${opts.chainId})` },
        { kind: "out", text: `  Vaults       deposit / withdraw ${onVaultChain ? "ALLOWED" : "BLOCKED — the vaults live on HyperEVM, 'chain hevm'"}` },
        { kind: "out", text: `  Markets      lend / borrow ${blueActionsSupported(opts.chainId) ? `ALLOWED  (${blueSignaturesSupported(opts.chainId) ? "Permit2 signatures: one tx per action" : "classic approvals: an approval tx before each funded action"})` : "BLOCKED on this chain"}` },
        { kind: "out", text: "  Private      EREBUS and the ops views are operator-only; not reachable from this shell" },
      ];
    }

    if (cmd === "man" || cmd.startsWith("man ")) {
      // Docs as man pages — same content source as /docs (lib/docs/content).
      // Terminal out-lines collapse whitespace, so indentation and column
      // padding are converted to non-breaking spaces.
      const hardSpaces = (text: string) => text.replace(/ {2,}|^ /g, (m) => "\u00A0".repeat(m.length));
      const page = cmd.slice(3).trim();
      if (!page) {
        return [
          { kind: "out", text: "What manual page do you want?" },
          {
            kind: "out",
            text:
              "Available: " +
              DOC_PAGES.map((d) => `${d.manName}(${Number(d.n)})`).join(", ") +
              " — try: man hegemon",
          },
        ];
      }
      const doc = getDocByManName(page);
      if (!doc) {
        return [{ kind: "out", text: `No manual entry for ${page}. Try: man` }];
      }
      return renderDocToMan(doc).map((text) => ({
        kind: "out" as const,
        man: true,
        text: text === "" ? "\u00A0" : hardSpaces(text),
      }));
    }

    if (cmd === "manifest" || cmd === "doctrine") {
      return [
        { kind: "out", text: "MYRMIDONS MANIFEST" },
        { kind: "out", text: "OBSERVE → DECIDE → EXECUTE" },
        { kind: "out", text: "Public + private strategies." },
        { kind: "out", text: "Risk-gated automation, live on HyperEVM + Robinhood Chain." },
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

    if (cmd === "changelog" || cmd === "log") {
      return [out("CHANGELOG  (newest first)"), ...CHANGELOG.map(([d, t]) => out(hard(`  ${d}  ${t}`)))];
    }
    if (cmd === "changelog-legacy") {
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
        { kind: "out", text: "HEGEMON_V2, the reallocator behind the three MYRMIDONS vaults, is in test phase." },
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
    let raw = (override ?? commandInput).trim();
    if (raw === "") return;
    const echoIn = (text: string, ...outs: string[]) => {
      setTerminalEntries((prev) => [...prev, { kind: "in", text, prompt: promptRef.current }, ...outs.map((t) => ({ kind: "out" as const, text: t }))]);
      setCommandInput("");
      setSelectionStart(0);
    };
    // ── shell: `!!` repeats, `a && b` chains, an alias expands (echoed, then run) ──
    if (raw === "!!") {
      const last = [...commandHistory].reverse().find((h) => h !== "!!");
      if (!last) return echoIn(raw, "!!: no previous command");
      raw = last;
    }
    if (raw.includes("&&")) {
      const parts = raw.split("&&").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        for (const p of parts) handleCommandSubmit(p);
        return;
      }
    }
    const firstWord = raw.split(/\s+/)[0].toLowerCase();
    if (aliases[firstWord] && firstWord !== "alias" && firstWord !== "unalias") {
      const expanded = `${aliases[firstWord]}${raw.slice(firstWord.length)}`;
      echoIn(raw, `→ ${expanded}`);
      handleCommandSubmit(expanded);
      return;
    }
    const cmd = raw.toLowerCase();

    // ── tail [vault] / q / tail stop — the HEGEMON_V2 keeper stream into the log ──
    const tailMatch = cmd.match(/^tail(?:\s+(\S+))?$/);
    if (tailMatch || (cmd === "q" && tailRef.current)) {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      echoIn(raw);
      const append = (text: string) => setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      if (!tailMatch || tailMatch[1] === "stop") return stopTail("by operator");
      if (tailRef.current) return append("FEED // ALREADY_TAILING  q stops it");
      const arg = tailMatch[1];
      let filter: VaultDef | null = null;
      if (arg && arg !== "hegemon" && arg !== "all") {
        const v = findVault(arg);
        if (!v) return append(`FEED // ERROR  UNKNOWN_VAULT  ${arg} — usdt0, usdc, whype or all`);
        filter = v;
      } else if (!arg) {
        const r = resolveVaultRef(undefined, selectedEntry?.id);
        filter = "vault" in r && r.from === "shard" ? r.vault : null;
      }
      const es = new EventSource(`/api/logs/hegemon-v2/stream?t=${Date.now()}`);
      tailRef.current = es;
      playSfx("relay");
      playSfx("whirr", { delay: 0.02 });
      append(`FEED // LIVE  HEGEMON_V2 ${filter ? filter.name : "all vaults"}  — q or Esc stops`);
      let structured = false;
      // The bot's plain-text score tables ("hegemon scores for 0x…:" + a console.table)
      // aren't vault-tagged: the header names the vault, the block runs to the next event.
      let plainVault: string | null = null;
      const handle = (data: string) => {
        const cleaned = normalizeHegemonLine(stripAnsi(data.startsWith("data:") ? data.slice(5).trim() : data));
        if (!cleaned || (structured && isHegemonStartupNoise(cleaned))) return;
        const parsed = tryParseJsonEvent(cleaned);
        if (parsed.ok && parsed.evt) {
          structured = true;
          plainVault = null;
          const evt = parsed.evt;
          if (evt.type === "scores") return;                        // the per-tick market table: MNEMON's, not ours
          if (filter && evt.vault && evt.vault.toLowerCase() !== filter.address.toLowerCase()) return;
          const f = formatEvent(evt);
          append(hard(`FEED // ${f.level.padEnd(7)} ${f.title}${f.subtitle ? `  ${f.subtitle}` : ""}${f.txHash ? `  ${f.txHash}` : ""}`));
          if (f.level === "ERROR") playSfx("buzz", { gain: 0.6 });
          else playSfx("seek", { gain: 0.5 });
          return;
        }
        if (structured && isLegacyNoiseLine(cleaned)) return;
        const header = cleaned.match(/scores for (0x[0-9a-fA-F]{40})/);
        if (header) plainVault = header[1].toLowerCase();
        if (filter && plainVault && plainVault !== filter.address.toLowerCase()) return;
        append(hard(`FEED // ${cleaned.slice(0, 220)}`));        // NBSP keeps the console.table columns aligned
      };
      es.onmessage = (ev) => handle(String(ev.data));
      es.onerror = () => { if (es.readyState === EventSource.CLOSED) stopTail("stream closed"); };
      return;
    }

    // ── tx <hash> — receipt on the wallet's chain ──
    const txMatch = raw.trim().match(/^tx\s+(0x[0-9a-fA-F]{64})$/);
    if (txMatch) {
      const hash = txMatch[1] as `0x${string}`;
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      echoIn(raw, `TX // LOOKUP  ${chainTag(chainId)}  ${hash}`);
      const append = (text: string) => setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      if (!publicClient) return append("TX // ERROR  NO_CLIENT");
      publicClient
        .getTransactionReceipt({ hash })
        .then((r) => append(`TX // ${r.status === "success" ? "CONFIRMED" : "REVERTED"}  block ${r.blockNumber.toLocaleString("en-US")}  ·  gas used ${r.gasUsed.toLocaleString("en-US")}  ·  to ${r.to ?? "—"}  ${hash}`))
        .catch(() => append(`TX // PENDING_OR_UNKNOWN  no receipt on ${chainTag(chainId)} — 'chain <name>' if it lives elsewhere`));
      return;
    }

    // ── block <chain> / gas <chain> — read another chain without switching ──
    const chainRead = cmd.match(/^(block|gas)\s+(\S+)$/);
    if (chainRead) {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      echoIn(raw);
      const append = (text: string) => setTerminalEntries((prev) => [...prev, { kind: "out", text }]);
      const id = resolveChainRef(chainRead[2]);
      const chain = CHAINS.find((c) => c.id === id);
      if (!chain) return append(`CHAIN // ERROR  UNKNOWN_CHAIN  ${chainRead[2]} — 'chain' lists them`);
      const client = createPublicClient({ chain, transport: http() });
      const read = chainRead[1] === "block"
        ? client.getBlockNumber().then((n) => append(`${chain.name} - Latest block  ${n.toLocaleString("en-US")}`))
        : client.getGasPrice().then((p) => append(`${chain.name} - Gas price  ${formatGweiOf(p)} gwei (native ${chain.nativeCurrency.symbol})`));
      read.catch((err: unknown) => append(`CHAIN // ERROR  ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`));
      return;
    }

    if (cmd === "clear") {
      playSfx("zap");                                       // the picture collapses
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
          lines.push({ kind: "out", text: "BALANCE // VAULTS  (shares; the vaults live on HyperEVM)" });
          if (publicClientRef && chainIdRef === VAULTS[0].chainId) {
            for (const v of VAULTS) {
              try {
                const assetAddress = await getVaultAssetAddress(v.address, publicClientRef);
                const [balances, vaultDecimals, assetMeta] = await Promise.all([
                  readBalances({ account: address as Address, assetAddress, vaultAddress: v.address, publicClient: publicClientRef }),
                  readVaultDecimals(v.address, publicClientRef),
                  readAssetMeta(assetAddress, publicClientRef),
                ]);
                lines.push({ kind: "out", text: hard(`${nb(v.name, 17)} ${nb(`${formatAmount(balances.vaultShareBalance, vaultDecimals)} shares`, 26)} wallet ${formatAmount(balances.assetBalance, assetMeta.decimals)} ${assetMeta.symbol}`) });
                if (v.key === "usdt0") {
                  setVaultBalanceData({
                    assetBalance: balances.assetBalance,
                    vaultShareBalance: balances.vaultShareBalance,
                    assetSymbol: assetMeta.symbol,
                    assetDecimals: assetMeta.decimals,
                    vaultDecimals,
                  });
                }
              } catch {
                lines.push({ kind: "out", text: `${v.name}  UNAVAILABLE` });
              }
            }
          } else {
            lines.push({ kind: "out", text: `  wallet is on ${chainTag(chainIdRef)} — 'chain hevm' to read the vaults` });
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

    // deposit <amount> [vault] — deposit the vault's asset (amount: number, max, or
    // half). The vault named, else the slotted shard's, else USDT0.
    const depositMatch = raw.trim().toLowerCase().match(/^deposit(-v2)?\s+(\S+)(?:\s+(\S+))?$/);
    if (depositMatch) {
      const vr = resolveVaultRef(depositMatch[3], selectedEntry?.id);
      if ("error" in vr) {
        setCommandHistory((prev) => [...prev, raw].slice(-20));
        setCommandHistoryIndex(-1);
        return echoIn(raw, `VAULT_V2 // ERROR  ${vr.error}`);
      }
      const targetVaultAddress = vr.vault.address as Address;
      const targetChainId = vr.vault.chainId;
      const vaultLabel = "VAULT_V2";
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
      append(`${vaultLabel} // TARGET  ${vr.vault.name}  ${vr.from === "shard" ? "(slotted shard)" : vr.from === "default" ? "(default)" : ""}`);
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

    // withdraw <amount> [vault] — redeem shares (amount: number, max, or half).
    // The vault named, else the slotted shard's, else USDT0.
    const withdrawMatch = raw.trim().toLowerCase().match(/^withdraw(-v2)?\s+(\S+)(?:\s+(\S+))?$/);
    if (withdrawMatch) {
      const vr = resolveVaultRef(withdrawMatch[3], selectedEntry?.id);
      if ("error" in vr) {
        setCommandHistory((prev) => [...prev, raw].slice(-20));
        setCommandHistoryIndex(-1);
        return echoIn(raw, `VAULT_V2 // ERROR  ${vr.error}`);
      }
      const targetVaultAddress = vr.vault.address as Address;
      const targetChainId = vr.vault.chainId;
      const vaultLabel = "VAULT_V2";
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
      append(`${vaultLabel} // TARGET  ${vr.vault.name}  ${vr.from === "shard" ? "(slotted shard)" : vr.from === "default" ? "(default)" : ""}`);
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
          // Shares in, shares out: redeem exactly what was typed (or max/half
          // of the balance) — no shares→assets conversion to go stale.
          const withdrawHash = await redeem({
            vaultAddress,
            shares: parsedShares,
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

    // portfolio — the connected wallet's vault shares + Blue positions (the
    // /portfolio page's scan, printed). Lines start "PORTFOLIO // ".
    if (/^portfolio$/i.test(raw.trim())) {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
      setCommandInput("");
      setSelectionStart(0);
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `PORTFOLIO // ${text}` }]);
      if (!address) {
        append("ERROR  WALLET_REQUIRED");
        return;
      }
      const pf = portfolio.data;
      if (!pf) {
        append(portfolio.isError ? `ERROR  SCAN_FAILED  ${(portfolio.error as Error)?.message?.slice(0, 100) ?? ""}` : "SCANNING  positions across the indexed chains — run again in a moment");
        return;
      }
      const usd = (v: number | null) => (v == null ? "—" : fmtUsd(v));
      const lends = pf.markets.filter((p) => p.supplied > 0n);
      const borrows = pf.markets.filter((p) => p.debt > 0n || p.collateralAmount > 0n);
      append(`POSITIONS  ${pf.vaults.length} vault · ${lends.length} lending · ${borrows.length} borrow  (${pf.scannedChains.map(chainTag).join(" ")})`);
      for (const v of pf.vaults) {
        append(`  VAULT  ${nb(v.name, 16)} ${nb(`${formatAmount(v.assets, v.asset.decimals, 2)} ${v.asset.symbol}`, 20)} ${usd(v.assetsUsd)}`);
      }
      for (const p of lends) {
        const pair = `${p.market.collateral_symbol}/${p.market.loan_symbol}@${Math.round((p.market.lltv ?? 0) * 100)}`;
        const better = p.better ? `+${fmtPct(p.better.gap)} @ ${p.better.market.collateral_symbol}/${p.better.market.loan_symbol}` : "BEST";
        append(`  LEND   ${nb(chainTag(p.chainId), 5)} ${nb(pair, 22)} ${nb(`${formatAmount(p.supplied, p.loan.decimals, 2)} ${p.loan.symbol}`, 20)} ${nb(usd(p.suppliedUsd), 10)} apy ${nb(fmtPct(p.marketData.supplyApy), 7)} exit ${p.exitCovered ? "OPEN" : "QUEUED"}  gap ${better}`);
      }
      for (const p of borrows) {
        const pair = `${p.market.collateral_symbol}/${p.market.loan_symbol}@${Math.round((p.market.lltv ?? 0) * 100)}`;
        append(`  BORROW ${nb(chainTag(p.chainId), 5)} ${nb(pair, 22)} coll ${nb(`${formatAmount(p.collateralAmount, p.collateral.decimals, 4)} ${p.collateral.symbol}`, 20)} debt ${nb(`${formatAmount(p.debt, p.loan.decimals, 2)} ${p.loan.symbol}`, 18)} ltv ${p.ltv != null ? fmtPct(p.ltv, 1) : "—"} / ${fmtLltv(p.market.lltv)}  health ${p.health != null ? p.health.toFixed(2) : "—"}`);
      }
      if (pf.vaults.length + pf.markets.length === 0) append("  NO_POSITIONS  — lend/borrow from the analyser or 'lend <amt> <market>' here");
      if (pf.failedChains.length) append(`  RPC_TIMEOUT  ${pf.failedChains.map(chainTag).join(" ")} — not read this round`);
      append("  full view: run portfolio");
      return;
    }

    // chain <name|id> — switch the wallet's chain from the terminal (the
    // market commands act on the wallet's current chain).
    const chainMatch = raw.trim().match(/^(?:chain|network)\s+(\S+)$/i);
    if (chainMatch) {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
      setCommandInput("");
      setSelectionStart(0);
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `CHAIN // ${text}` }]);
      const target = resolveChainRef(chainMatch[1]);
      if (target == null) {
        append(`ERROR  UNKNOWN_CHAIN  ${chainMatch[1]} — type 'chain' for the list`);
        return;
      }
      if (!address) {
        append("ERROR  WALLET_REQUIRED");
        return;
      }
      if (target === chainId) {
        append(`ALREADY_ON  ${chainTag(target)} ${target}`);
        return;
      }
      append(`SWITCHING  ${chainTag(target)} ${target}…`);
      switchChainAsync({ chainId: target })
        .then(() => append(`SWITCHED  ${chainTag(target)} ${target}`))
        .catch((err: unknown) => {
          const msg = (err as { shortMessage?: string })?.shortMessage ?? (err instanceof Error ? err.message : String(err));
          append(/reject|denied/i.test(msg) ? "ERROR  SIGN_REJECTED" : `ERROR  ${msg.slice(0, 120)}`);
        });
      return;
    }

    // markets <query> — discovery: every MNEMON market matching a pair, a
    // symbol or an id prefix, on every indexed chain, with the FULL market id
    // (copy it into lend/borrow, or use the pair@lltv form).
    const marketsMatch = raw.trim().match(/^markets(?:\s+(.+))?$/i);
    if (marketsMatch) {
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      echoIn(raw);
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text: hard(`MARKET // ${text}`) }]);
      const args = parseMarketsArgs(marketsMatch[1] ?? "", resolveChainRef);
      if ("error" in args) return append(`ERROR  ${args.error}  — ${MARKET_USAGE.markets}`);
      if (!args.query && args.chainId == null && !args.loan && !args.investable) return append(`USAGE  ${MARKET_USAGE.markets}`);
      for (const line of marketsLines(marketHealth.data?.markets ?? [], args, chainId)) append(line);
      return;
    }

    // lend / unlend / borrow / repay / position — Morpho Blue market actions on
    // MNEMON markets. Same rules as the analyser's panel (lib/web3/blue.ts:
    // shares for full closes, safe max = 90%, SDK guard's withdrawable), same
    // SDK write path. Output lines are prefixed "MARKET // " (gold-highlighted).
    const marketMatch = raw.trim().match(/^(lend|unlend|borrow|repay|position)\s+(.+)$/i);
    const explorerHint = (chain: number) => MNEMON_CHAINS.find((c) => c.id === chain)?.label ?? String(chain);
    if (marketMatch) {
      const verb = marketMatch[1].toLowerCase() as keyof typeof MARKET_USAGE;
      const args = marketMatch[2].trim().split(/\s+/);
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }]);
      setCommandInput("");
      setSelectionStart(0);
      const append = (text: string) =>
        setTerminalEntries((prev) => [...prev, { kind: "out", text: `MARKET // ${text}` }]);
      const usage = () => append(`ERROR  USAGE  ${MARKET_USAGE[verb]}`);
      // grammar: <amt> <market> [collateral|withdraw <amt>]  |  position <market>
      const isPosition = verb === "position";
      const amountStr = isPosition ? null : args[0]?.toLowerCase();
      const ref = isPosition ? args[0] : args[1];
      const kw = args[2]?.toLowerCase();
      const collStr = args[3]?.toLowerCase();
      const kwOk = kw == null || ((verb === "borrow" && kw === "collateral") || (verb === "repay" && kw === "withdraw"));
      const isAmt = (s: string | null | undefined) => s != null && (s === "max" || s === "half" || /^\d+(\.\d*)?$/.test(s));
      if (!ref || (!isPosition && !isAmt(amountStr)) || !kwOk || (kw != null && !isAmt(collStr)) || args.length > (kw ? 4 : isPosition ? 1 : 2)) {
        usage();
        return;
      }
      if (!address || !walletClient?.account || !publicClient) {
        append("ERROR  WALLET_REQUIRED");
        return;
      }
      if (!blueActionsSupported(chainId)) {
        append(`ERROR  UNSUPPORTED_CHAIN  ${explorerHint(chainId)} ${chainId} — 'chain <name>' to switch`);
        return;
      }
      const resolved = resolveMarketRef((marketHealth.data?.markets ?? []).filter(isRealMarket), ref, chainId);
      if (!resolved.ok) {
        append(`ERROR  ${resolved.error}`);
        resolved.candidates.forEach((c) => append(`  ${c}`));
        if (resolved.candidates.length === 0) append(`  wallet is on ${explorerHint(chainId)} — 'markets ${ref}' lists every chain, 'chain <name>' switches`);
        return;
      }
      const m = resolved.market;
      const pair = `${m.collateral_symbol}/${m.loan_symbol}@${m.lltv != null ? Math.round(m.lltv * 100) : "?"}`;
      const user = address as Address;
      (async () => {
        try {
          const params = await fetchMarketParams(m.market_id as MarketId, publicClient);
          const market = blueMarket(publicClient, params, chainId);
          const balanceOf = (token: Address) =>
            publicClient.readContract({ address: token, abi: ERC20_ABI, functionName: "balanceOf", args: [user] }) as Promise<bigint>;
          const [md, pos, loanMeta, collMeta, walletLoan, walletColl] = await Promise.all([
            market.getMarketData(),
            market.getPositionData(user),
            readAssetMeta(params.loanToken, publicClient),
            readAssetMeta(params.collateralToken, publicClient),
            balanceOf(params.loanToken),
            balanceOf(params.collateralToken),
          ]);
          const fl = (v: bigint) => `${formatAmount(v, loanMeta.decimals, 4)} ${loanMeta.symbol}`;
          const fc = (v: bigint) => `${formatAmount(v, collMeta.decimals, 4)} ${collMeta.symbol}`;
          const debtNow = accruedDebt(pos, md);
          const ltv = pos.ltv != null && pos.ltv < 10n ** 24n ? fmtPct(Number(pos.ltv) / 1e18, 1) : "—";
          const hf = pos.healthFactor != null && pos.healthFactor < 10n ** 24n ? (Number(pos.healthFactor) / 1e18).toFixed(2) : "—";
          append(`POSITION  ${pair}  ${m.market_id.slice(0, 10)}…  supply_apy ${fmtPct(md.supplyApy)}  borrow_apy ${fmtPct(md.borrowApy)}`);
          append(`  SUPPLIED ${fl(pos.supplyAssets)}  ·  WALLET ${fl(walletLoan)} / ${fc(walletColl)}`);
          append(`  COLLATERAL ${fc(pos.collateral)}  ·  DEBT ${fl(debtNow)}  ·  LTV ${ltv} / LLTV ${fmtLltv(m.lltv)}  ·  HEALTH ${hf}`);
          if (isPosition) return;

          const mode = verb === "unlend" ? "withdraw" : (verb as "lend" | "borrow" | "repay");
          const pick = (s: string, source: bigint, decimals: number): bigint =>
            s === "max" ? source : s === "half" ? source / 2n : parseAmount(s, decimals);
          // collateral first — the safe borrow max depends on it
          let coll = 0n;
          if (kw && collStr) {
            const collSource = mode === "borrow" ? walletColl : safeWithdrawableCollateral(pos);
            coll = pick(collStr, collSource, collMeta.decimals);
          }
          const loanSource =
            mode === "lend"
              ? walletLoan
              : mode === "withdraw"
                ? pos.supplyAssets
                : mode === "borrow"
                  ? safeMaxBorrow(pos, md, coll)
                  : canCloseDebt(debtNow, walletLoan)
                    ? debtNow
                    : walletLoan;
          const loan = pick(amountStr!, loanSource, loanMeta.decimals);
          const closeAll = shouldCloseAll(mode, { loan, supplied: pos.supplyAssets, debtNow, wallet: walletLoan });
          if (mode === "repay" && kw && collStr && (collStr === "max" || collStr === "half")) {
            // withdrawable depends on what the repay leaves behind
            const after = projectPosition(pos, md, { debtDelta: -loan, closeDebt: closeAll });
            coll = pick(collStr, safeWithdrawableCollateral(after), collMeta.decimals);
          }
          if (loan === 0n && coll === 0n) {
            append("ERROR  NOTHING_TO_DO  amount resolves to zero");
            return;
          }
          const built = buildBlueAction(market, {
            mode,
            user,
            pos,
            marketData: md,
            loan,
            coll,
            closeAll,
            loanSymbol: loanMeta.symbol,
            collateralSymbol: collMeta.symbol,
          });
          if (!built) {
            append("ERROR  NOTHING_TO_DO");
            return;
          }
          append(`${built.label}  ${[loan > 0n && fl(loan), coll > 0n && fc(coll)].filter(Boolean).join("  +  ")}${closeAll ? "  (by shares)" : ""}`);
          const hash = await runBlueAction(built.action, {
            account: user,
            walletClient: walletClient!,
            publicClient,
            // "Sending X…" → "SENDING  X"; "X confirmed" → "CONFIRMED  X" (status word first, for the colouring)
            log: (line) =>
              append(
                line.endsWith(" confirmed")
                  ? `CONFIRMED  ${line.slice(0, -" confirmed".length).toUpperCase()}`
                  : line.replace(/…$/, "").replace(/^Sending /, "SENDING  ").toUpperCase()
              ),
          });
          append(`${built.label.replace(/ .*$/, "")}_CONFIRMED  ${hash}`);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("balances-refreshed", { detail: { wallet: user } }));
          }
        } catch (err: unknown) {
          const msg = (err as { shortMessage?: string })?.shortMessage ?? (err instanceof Error ? err.message : String(err));
          if (/reject|denied|user denied/i.test(msg)) append("ERROR  SIGN_REJECTED");
          else append(`ERROR  ${msg.slice(0, 160)}`);
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
      const pingName = CHAINS.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`;
      setCommandHistory((prev) => [...prev, raw].slice(-20));
      setCommandHistoryIndex(-1);
      setTerminalEntries((prev) => [...prev, { kind: "in", text: raw, prompt: promptRef.current }, { kind: "out", text: `${pingName} RPC: …` }]);
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
              if (last?.kind === "out" && last.text === `${pingName} RPC: …`)
                next[next.length - 1] = { kind: "out", text: `${pingName} RPC: OK (${ms} ms)` };
              return next;
            });
          })
          .catch(() => {
            setTerminalEntries((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.kind === "out" && last.text === `${pingName} RPC: …`)
                next[next.length - 1] = { kind: "out", text: `${pingName} RPC: DEGRADED` };
              return next;
            });
          });
      } else {
        setTimeout(() => {
          setTerminalEntries((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.kind === "out" && last.text === `${pingName} RPC: …`)
              next[next.length - 1] = { kind: "out", text: `${pingName} RPC: DEGRADED` };
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
      vaults: vaultBundles,
      markets: marketHealth.data?.markets ?? [],
      generatedAt: marketHealth.data?.generated_at,
      risk: riskMarkets.data,
      flows: marketFlows.data,
      watches,
      aliases,
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
  const whypeV2Apy = useVaultApy(WHYPE_V2_VAULT_ADDRESS, WHYPE_V2_VAULT_CHAIN_ID, true);
  const marketHealth = useMarketHealth();
  // `portfolio` command: same scan as /portfolio, fetched once the wallet connects.
  const portfolio = usePortfolio(address as Address | undefined, marketHealth.data?.markets);

  // Watches ring once per crossing, checked whenever the data they read refreshes
  const vaultSig = vaultBundles.map((b) => `${b.tvlUsd}:${b.netApyPct}`).join("|");
  useEffect(() => {
    if (watches.length === 0) return;
    const vaultsCtx = Object.fromEntries(vaultBundles.map((b) => [b.def.key, { tvl: b.tvlUsd, apy: b.netApyPct }]));
    const { rang, next } = evaluateWatches(watches, { markets: marketHealth.data?.markets ?? [], vaults: vaultsCtx });
    if (next.some((w, i) => w !== watches[i])) setWatches(next);
    if (rang.length === 0) return;
    playSfx("beep");
    playSfx("chirp", { delay: 0.25 });
    setTerminalEntries((prev) => [
      ...prev,
      ...rang.map(({ watch: w, current }) => ({ kind: "out" as const, text: hard(`WATCH // ALERT  #${w.id}  ${describeWatch(w)}  — now ${current.toLocaleString("en-US", { maximumFractionDigits: 2 })}`) })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watches, marketHealth.data, vaultSig]);

  // Best V2 vault net APY (of the vaults the FS declares as VAULT_V2)
  const v2VaultCount = FS_DIRS[0].children.filter((f) => f.secondary?.startsWith("VAULT_V2")).length;
  const bestV2Apy = (() => {
    const vals = [usdt0V2Apy.data, usdcV2Apy.data, whypeV2Apy.data]
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
            // Pre-boot: the screen is up, nothing has revealed yet — a caret blinks alone
            const preboot = lastInIdx === -1 && revealingLineIndex < 0 && terminalEntries[0]?.kind === "out" && terminalEntries[0].ascii;
            const asciiRows = BOOT_WORDMARK_ROWS.length;
            // The emblem beside the wordmark rolls in with the rows: as many bars as rows revealed
            const emblemRows = lastInIdx === -1 ? Math.max(0, Math.min(asciiRows, revealingLineIndex + 1)) : asciiRows;
            const emblemSize = `${asciiRows * 2.2 * 0.54}rem`;   // rows x line-height x font-size: the rows' height
            return [preboot && <span key="preboot" className="animate-caret-blink text-white pl-4">█</span>, ...terminalEntries.map((e, i) => {
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
                  const firstRow = e.text === BOOT_WORDMARK_ROWS[0];
                  return wrapWithGlow(
                    <div className="relative flex gap-2" style={{ paddingLeft: `calc(1rem + ${emblemSize} + 0.75rem)` }}>
                      {firstRow && (
                        /* The emblem, the rows' height, anchored to the first row and overflowing down
                           beside the rest; the site's logo filter; wiped in top-down as the rows land */
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src="/brand/myrmidons-logo.svg"
                          alt=""
                          aria-hidden
                          className="absolute left-4 top-0 select-none pointer-events-none"
                          style={{
                            width: emblemSize,
                            height: emblemSize,
                            filter: "brightness(2) drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--gold) 30%, transparent))",
                            clipPath: `inset(0 0 ${(1 - emblemRows / asciiRows) * 100}% 0)`,
                            transition: "clip-path 45ms linear",
                          }}
                        />
                      )}
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
                  (e.text.startsWith("MARKET // ") ? ["MARKET"] : undefined) ??
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
                // 64-hex tokens link to the explorer as tx hashes by default;
                // pass `hrefFor: null` to render them as plain gold text
                // (market ids are 64-hex too — a tx link would be wrong).
                const linkifyTxHashes = (
                  text: string,
                  hrefFor: ((h: string) => string) | null = (h) => `https://hyperevmscan.io/tx/${h}`
                ) => {
                  const parts = text.split(TX_HASH_REGEX);
                  if (parts.length === 1) return text;
                  return (
                    <>
                      {parts.map((part, i) =>
                        part.match(/^0x[a-fA-F0-9]{64}$/) ? (
                          hrefFor ? (
                            <a
                              key={i}
                              href={hrefFor(part)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gold font-mono text-xs underline transition-colors"
                            >
                              {part}
                            </a>
                          ) : (
                            <span key={i} className="text-gold font-mono text-xs select-all">
                              {part}
                            </span>
                          )
                        ) : (
                          part
                        )
                      )}
                    </>
                  );
                };
                // man pages and the report commands (status, alloc, market, top, nav,
                // help…): colour by meaning (headings, failure modes, healthy states,
                // identifiers/values). Lines with a `PREFIX // ` keep the status-word path.
                const isReport = (e.man || REPORT_CMDS.test(cmdKey)) && !/^[A-Z_0-9]+ \/\/ /.test(e.text);
                const manContent = isReport ? (
                  <span className="font-mono text-xs whitespace-pre-wrap">
                    {highlightManLine(e.text).map((seg, k) => (
                      <span key={k} className={MAN_TONE_CLASS[seg.tone]}>
                        <GlitchTypeText loading={false} value={seg.text} mode="text" />
                      </span>
                    ))}
                  </span>
                ) : null;
                const swapPrefix = "SWAP // ";
                // Both HEGEMON (V1) "VAULT // " and HEGEMON_V2 "VAULT_V2 // "
                // lines share the same status-word coloring.
                // MARKET (Blue markets) and CHAIN (wallet switch) lines share the
                // status-word coloring. Their 64-hex tokens are MARKET IDS unless
                // the status word says CONFIRMED — then it is a tx hash on the
                // wallet's chain.
                const vaultPrefix =
                  ["VAULT_V2 // ", "VAULT // ", "MARKET // ", "CHAIN // ", "PORTFOLIO // ", "WATCH // ", "FEED // ", "TX // ", "ALIAS // ", "EXPORT // "].find((p) => e.text.startsWith(p)) ?? "VAULT // ";
                const isMarketLine = vaultPrefix === "MARKET // " || vaultPrefix === "CHAIN // " || vaultPrefix === "PORTFOLIO // " || vaultPrefix === "TX // ";
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
                      : firstWord.includes("CONFIRMED") || firstWord === "APPROVED" || firstWord === "SWITCHED" || firstWord === "SUCCESS" || firstWord === "LIVE" || firstWord === "ARMED" || firstWord === "SAVED"
                        ? "text-success glow-green"
                        : firstWord === "WARN" || firstWord === "ALERT"
                          ? "text-gold"
                          : "text-text-dim";
                  const hrefFor = isMarketLine
                    ? firstWord.includes("CONFIRMED")
                      ? (h: string) => explorerTxUrl(chainId, h) ?? `https://hyperevmscan.io/tx/${h}`
                      : null
                    : undefined;
                  vaultContent = (
                    <span className="font-mono text-xs whitespace-pre">
                      {renderSegments(vaultPrefix)}
                      <span className={firstWordClass}>{firstWord}</span>
                      {rest ? <span className="text-text-dim">{linkifyTxHashes(rest, hrefFor)}</span> : null}
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
                    ) : manContent ? (
                      manContent
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
            })];
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
                ? ["ls", "open usdt0", "open usdc", "open whype", "cd ..", "help"]
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
            <button
              type="button"
              onClick={() => { setSfxEnabled(!sfxOn); setSfxOn(!sfxOn); }}
              className="text-text-dim hover:text-white transition-colors uppercase tracking-widest"
              aria-pressed={sfxOn}
            >
              [ SFX {sfxOn ? "ON" : "OFF"} ]
            </button>
            {!isMobile && (
              <button
                type="button"
                onClick={() => { setCrtEnabled(!crtOn); setCrtOn(!crtOn); }}
                className="text-text-dim hover:text-white transition-colors uppercase tracking-widest"
                aria-pressed={crtOn}
              >
                [ CRT {crtOn ? "ON" : "OFF"} ]
              </button>
            )}
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
                keySfx(e.key);
                if (e.key === "Escape" && tailRef.current) {
                  e.preventDefault();
                  stopTail("Esc");
                } else if (e.key === "Enter") {
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
                    if (match !== commandInput) playSfx("relay", { delay: 0.04 });   // the completion lands
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
                        Open to view the MYRMIDONS vaults…
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
                  Open to view the MYRMIDONS vaults…
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
