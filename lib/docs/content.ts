import { HEGEMON_V2_CONSTANTS } from "@/lib/strategy/hegemonV2";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_ADDRESS,
  USDT0_VAULT_ADDRESS,
} from "@/lib/constants/vaults";

/**
 * Docs content: five pages as typed block lists, the single source for BOTH
 * renderers — /docs/[slug] (site system, components/docs/DocPage) and the
 * terminal's `man` command (renderDocToMan below). No MDX: structured blocks
 * are what lets one source feed a React page and a text stream.
 *
 * Live values (HEGEMON constants, vault addresses) are imported from the
 * modules the site already runs on — retune the bot, sync the constants
 * file, and the docs update themselves. MNEMON/RISK thresholds live in the
 * Python repos and are hand-copied here — when MNEMON retunes (e.g. the
 * investable floor), update this file in the same change.
 */

export type DocBlock =
  | { kind: "p"; text: string }
  | { kind: "formula"; lines: [string, string, string][] }
  | { kind: "table"; columns: [string, string, string]; rows: [string, string, string][] }
  | { kind: "list"; items: string[] }
  | { kind: "banner"; tone: "warn" | "ok"; text: string };

export interface DocSection {
  title: string;
  blocks: DocBlock[];
}

export interface Doc {
  slug: string;
  n: string; // "01".."05"
  title: string; // sidebar + page title
  manName: string; // `man <name>`
  tagline: string; // one-liner under the title / NAME section
  sections: DocSection[];
}

const C = HEGEMON_V2_CONSTANTS;

/* ------------------------------------------------------------------ */
/* 01 — OVERVIEW                                                       */
/* ------------------------------------------------------------------ */

const OVERVIEW: Doc = {
  slug: "overview",
  n: "01",
  title: "OVERVIEW",
  manName: "myrmidons",
  tagline: "the stack — observe, classify, allocate",
  sections: [
    {
      title: "WHAT THIS IS",
      blocks: [
        {
          kind: "p",
          text: "MYRMIDONS is a research and execution stack for onchain lending markets, built on Morpho and live on HyperEVM (chain 999) and Robinhood Chain (chain 4663). It runs one loop without pause: observe every market, classify which ones are real and investable, and reallocate vault capital toward the best of them.",
        },
      ],
    },
    {
      title: "THE LOOP",
      blocks: [
        {
          kind: "formula",
          lines: [
            ["MNEMON", "──▶ samples every Morpho market", "// every 5–15 min"],
            ["CLASSIFIER", "──▶ flags broken markets, marks investable", "// server-side rules"],
            ["HEGEMON", "──▶ reallocates vault capital", "// simulated before sent"],
          ],
        },
        {
          kind: "p",
          text: "Everything the loop sees and does is public: the archive is served as static JSON, the risk engine as a versioned API, and the reallocator's decisions stream live into the site's terminal.",
        },
      ],
    },
    {
      title: "COMPONENTS",
      blocks: [
        {
          kind: "table",
          columns: ["COMPONENT", "WHAT", "WHERE"],
          rows: [
            ["MNEMON", "Market archive — sampling, classifier, flows", "data.myrmidons-strategies.com"],
            ["METRON", "Pure statistics library (risk estimators)", "internal, tag-pinned"],
            ["RISK ENGINE", "Capacity + risk metrics on the archive", "api.myrmidons-strategies.com"],
            ["HEGEMON", "Vault reallocator bot", "operator VPS"],
            ["VAULTS", "ERC-4626 Morpho vaults the bot manages", "HyperEVM"],
          ],
        },
        {
          kind: "p",
          text: "The keeper also exposes a live event stream (SSE) that powers the terminal feeds on the vault pages. It exists and is observable, but carries no stability promise.",
        },
      ],
    },
    {
      title: "SCOPE",
      blocks: [
        {
          kind: "p",
          text: "Observability spans both chains: every Morpho market on HyperEVM and Robinhood Chain is archived, classified and risk-scored. Execution (the vaults and the reallocator) runs on HyperEVM. Proof-of-concept scale; more chains planned.",
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 02 — HEGEMON                                                        */
/* ------------------------------------------------------------------ */

const HEGEMON: Doc = {
  slug: "hegemon",
  n: "02",
  title: "HEGEMON",
  manName: "hegemon",
  tagline: "vault reallocator · allocation policy",
  sections: [
    {
      title: "DESCRIPTION",
      blocks: [
        {
          kind: "p",
          text: "HEGEMON is the reallocator: it moves vault capital between whitelisted Morpho markets along a utilization-targeting curve. Every market gets a score; scores become target weights; a rebalance only fires when the improvement clears the churn floor. Every move is simulated before it is sent onchain.",
        },
      ],
    },
    {
      title: "MARKET SCORE",
      blocks: [
        {
          kind: "formula",
          lines: [
            ["utilScore", "= bellCurve(u; center=U0, width=SIGMA)", "// prefers u near U0"],
            ["exitScore", "= clamp01(exitRatio) ^ EXIT_POWER", "// penalizes poor exits"],
            ["score", "= netApy · utilScore · exitScore", "// per market, each tick"],
          ],
        },
        {
          kind: "p",
          text: "Scores are max-normalized and passed through a softmax (temperature SOFTMAX_T) to become target weights. The bell keeps capital where utilization is healthy — high enough to earn, low enough to exit.",
        },
      ],
    },
    {
      title: "CONSTANTS",
      blocks: [
        {
          kind: "table",
          columns: ["PARAM", "VALUE", "MEANING"],
          rows: [
            ["U0", String(C.U0), "Bell-curve peak utilization"],
            ["SIGMA", String(C.SIGMA), "Bell-curve width"],
            ["U_OPT_LOW", String(C.U_OPT_LOW), "Deposits never push a market below this"],
            ["U_SAT", String(C.U_SAT), "Saturated band start — inflow downweighted"],
            ["U_CRIT", String(C.U_CRIT), "Hard gate — no deposits at or above"],
            ["EXIT_MIN", String(C.EXIT_MIN), "exitRatio floor for new deposits"],
            ["EXIT_POWER", String(C.EXIT_POWER), "Convexity of the exit-safety penalty"],
            ["SAT_INFLOW_MULT", String(C.SAT_INFLOW_MULT), "Inflow multiplier in the saturated band"],
            ["SOFTMAX_T", String(C.SOFTMAX_T), "Softmax temperature over normalized scores"],
            ["MIN_REALLOC_BPS_DELTA", String(C.MIN_REALLOC_BPS_DELTA), "Churn floor (bps of totalAssets per market)"],
            ["CRIT_WEIGHT_RISK", String(C.CRIT_WEIGHT_RISK), "Risk-lane trigger (assets stuck in critical markets)"],
            ["RISK_COOLDOWN_HOURS", String(C.RISK_COOLDOWN_HOURS), "Deposit cooldown after a risk-lane exit"],
            ["LIQUIDITY_BUFFER_BPS", String(C.LIQUIDITY_BUFFER_BPS), "Floor kept in the liquidity market"],
          ],
        },
        {
          kind: "banner",
          tone: "ok",
          text: "Values on this page render live from the strategy module the site runs on — they cannot drift from the deployed configuration shown here.",
        },
      ],
    },
    {
      title: "GATES & COOLDOWNS",
      blocks: [
        {
          kind: "list",
          items: [
            "Deposits never push a market's utilization below U_OPT_LOW or above U_CRIT.",
            "In the saturated band [U_SAT, U_CRIT) inflow is throttled by SAT_INFLOW_MULT.",
            "A market below EXIT_MIN exit ratio receives no new deposits until it recovers.",
            "Risk-lane exits put the market on a deposit cooldown (RISK_COOLDOWN_HOURS).",
            "A rebalance only executes when a market's weight change clears MIN_REALLOC_BPS_DELTA.",
            "A liquidity buffer (LIQUIDITY_BUFFER_BPS of totalAssets) is floored in the designated liquidity market; the liquidity market rotates only when a challenger beats the incumbent by LIQUIDITY_ROTATION_FACTOR.",
          ],
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 03 — MNEMON                                                         */
/* ------------------------------------------------------------------ */

const MNEMON: Doc = {
  slug: "mnemon",
  n: "03",
  title: "MNEMON",
  manName: "mnemon",
  tagline: "the market archive — sampling, classifier, flows",
  sections: [
    {
      title: "DESCRIPTION",
      blocks: [
        {
          kind: "p",
          text: "MNEMON is an independent archive of every Morpho market on HyperEVM and Robinhood Chain. It samples the chain on fixed cadences (market state every 5 minutes, most feeds every 15) and stores everything on MYRMIDONS infrastructure — it is not a proxy of the Morpho API. On top of the raw feed it runs a broken-market classifier, investability rules, and event ingestion for flows and liquidations.",
        },
      ],
    },
    {
      title: "BROKEN-MARKET CLASSIFIER",
      blocks: [
        {
          kind: "table",
          columns: ["FLAG", "ENTER / EXIT", "MEANING"],
          rows: [
            ["RATE_RATCHET", "apy@target > 50% / < 25%", "The IRM ratcheted into a runaway rate — the market is broken, not attractive"],
            ["PINNED_UTIL", "u ≥ 99.9% for 24h / below 95% for 48h", "Stuck at full utilization — lenders cannot withdraw"],
            ["DUST", "supply < $1k", "Too small to mean anything"],
          ],
        },
        {
          kind: "p",
          text: "Ratchet and pinned flags only apply while a market's supply is under $25k — a deep market running hot is an opportunity, not a defect. Classification is hysteretic: markets enter and exit flags at different thresholds, so they do not flap.",
        },
        {
          kind: "p",
          text: "INVESTABLE = not broken AND at least $50k of available liquidity. The FE and the reallocator benchmark both filter on this server-computed flag, so every consumer agrees on what is deployable.",
        },
      ],
    },
    {
      title: "WHAT IT TRACKS",
      blocks: [
        {
          kind: "list",
          items: [
            "Market state: rates, utilization, supply/borrow, oracle price — 5-minute cadence.",
            "Flows: every Morpho market event (supply, withdraw, borrow, repay, liquidations), whale flows (single events ≥ 5% of a market's supply), per-chain sync cursors.",
            "Borrower and lender books: health factors, near-liquidation debt share, lender concentration.",
            "Utilization spells: stretches at or above near-full utilization (when lenders may not be able to exit).",
            "Oracle deviation: Morpho oracle vs the DefiLlama cross; persistent deviation is an exchange-rate-oracle fingerprint, an episode is a depeg.",
            "Liquidation capacity inputs: DEX route quote ladders and HyperCore book depth, hourly.",
          ],
        },
      ],
    },
    {
      title: "DATA — STATIC JSON EXPORT",
      blocks: [
        {
          kind: "banner",
          tone: "warn",
          text: "UNSTABLE // SCHEMA MAY CHANGE. These files exist for the site's own tools. Every row carries schema_version; fields are added (and occasionally reshaped) without notice. Build on the risk API instead where possible.",
        },
        {
          kind: "table",
          columns: ["FILE", "CONTENT", "CADENCE"],
          rows: [
            ["market_health.json", "Latest state + classifier verdict per market, 7d sparkline", "15 min"],
            ["market_flows.json", "Per-market flow windows, whale feed, liquidation feed, per-chain sync", "15 min"],
            ["util_spells.json", "Near-full-utilization episodes, trailing 30d", "15 min"],
            ["depeg_spells.json", "Oracle-vs-reference decoupling episodes, trailing 30d", "15 min"],
          ],
        },
        {
          kind: "p",
          text: "Served from data.myrmidons-strategies.com. Rows are keyed (chain_id, market_id) — the top-level chain_id is null whenever a file mixes chains. Schema history: v4 added the server-computed investable flag; v5 added per-row chain_id (multi-chain); v6 added per-chain flow sync state.",
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 04 — RISK                                                           */
/* ------------------------------------------------------------------ */

const RISK: Doc = {
  slug: "risk",
  n: "04",
  title: "RISK",
  manName: "risk",
  tagline: "the risk engine — capacity model + metric API",
  sections: [
    {
      title: "DESCRIPTION",
      blocks: [
        {
          kind: "p",
          text: "The risk engine computes model-grade metrics on top of the MNEMON archive: METRON (a pure statistics library) provides the estimators, orchestrators run them hourly per market, and the results ship as a versioned static API. Where MNEMON reports what is, the risk engine estimates what could go wrong.",
        },
      ],
    },
    {
      title: "LIQUIDATION CAPACITY",
      blocks: [
        {
          kind: "formula",
          lines: [
            ["LIF", "= min(1.15, 1 / (0.3·lltv + 0.7))", "// Morpho liquidation bonus"],
            ["maxSlippage", "= (1 − 1/LIF) − haircut", "// what a liquidator can absorb"],
            ["capacity", "= max sellable within maxSlippage", "// DEX ladder + Core book depth"],
          ],
        },
        {
          kind: "p",
          text: "capacity_ratio divides the debt-clearing equivalent (capacity / LIF) by the market's whole borrow: the fraction of the entire book that could be profitably liquidated in one sweep at current on-chain liquidity. At 1.0 or above the full book clears; far below 1.0, a large liquidation event exceeds what venues can absorb profitably — liquidations stall and the shortfall socializes to lenders. capacity_ratio_grouped is the stress version: every market sharing the collateral hits the same liquidity at once.",
        },
      ],
    },
    {
      title: "BUFFER BREACH",
      blocks: [
        {
          kind: "p",
          text: "A market's cushion is 1 − LLTV: the price drop that liquidates a borrower at the reference LTV. buffer_breach_freq_{1h,6h,24h} is the share of the trailing 30 days where the collateral fell through that whole cushion within the horizon — the empirical fat-tail complement to volatility. One-sided: pumps never count.",
        },
      ],
    },
    {
      title: "METRIC FAMILIES",
      blocks: [
        {
          kind: "list",
          items: [
            "Volatility: realized (7d/30d) and EWMA, from hourly collateral prices.",
            "Drawdown: max peak-to-trough (30d) and worst 7d window.",
            "Buffer breach frequencies at 1h / 6h / 24h horizons.",
            "Utilization: occupancy below the kink, time above 95%, spell statistics with Kaplan-Meier survival.",
            "Concentration: lender-book HHI. Rates: 30d borrow-supply spread.",
            "Oracle: depeg spell statistics and max deviation.",
          ],
        },
        {
          kind: "p",
          text: "Every value carries as_of, status (ok / no_data / insufficient_history — a failed computation is a null row, never a missing key) and provenance. The as_of grid is hourly since 2026-08-20; earlier history is daily.",
        },
      ],
    },
    {
      title: "API",
      blocks: [
        {
          kind: "banner",
          tone: "ok",
          text: "STABLE BY CONTRACT. Evolution is additive-only (openapi.yaml, test-enforced). Every row carries model_version — pin the version you validated against.",
        },
        {
          kind: "table",
          columns: ["ENDPOINT", "CONTENT", "—"],
          rows: [
            ["/v1/risk/index.json", "Discovery: markets, metric catalog, freshness. Read this first", ""],
            ["/v1/risk/markets.json", "All markets, latest value per metric + liq_capacity", ""],
            ["/v1/risk/markets/{id}.json", "One market, latest values", ""],
            ["/v1/risk/markets/{id}/history.json", "Full history per market, all metrics", ""],
            ["/v1/risk/markets/{id}/history/{metric}.json", "One metric's full series", ""],
            ["/v1/risk/metrics/{metric}.json", "One metric across every market", ""],
          ],
        },
        {
          kind: "p",
          text: "Served from api.myrmidons-strategies.com, rebuilt hourly at :40 UTC. Markets are keyed (chain_id, market_id) across both chains.",
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* 05 — VAULTS                                                         */
/* ------------------------------------------------------------------ */

const VAULTS: Doc = {
  slug: "vaults",
  n: "05",
  title: "VAULTS",
  manName: "vaults",
  tagline: "the vaults — deposits, mechanics, risk",
  sections: [
    {
      title: "THE VAULTS",
      blocks: [
        {
          kind: "table",
          columns: ["VAULT", "ADDRESS", "STATUS"],
          rows: [
            ["MYRMIDONS USDT0 (V2)", HEGEMON_V2_VAULT_ADDRESS, "Deposits open"],
            ["MYRMIDONS USDC (V2)", USDC_V2_VAULT_ADDRESS, "Deposits open"],
            ["HEGEMON V1 (USDT0)", USDT0_VAULT_ADDRESS, "Deprecated — withdrawals open"],
          ],
        },
        {
          kind: "p",
          text: "All vaults live on HyperEVM (chain 999) and are Morpho vaults managed by the HEGEMON reallocator. Addresses above render from the same module the site's deposit flow uses.",
        },
      ],
    },
    {
      title: "MECHANICS",
      blocks: [
        {
          kind: "list",
          items: [
            "ERC-4626: you deposit the asset (USDT0 or USDC) and receive vault shares; share price accrues yield. Withdrawals burn shares for the asset.",
            "The vault can only allocate into its whitelisted Morpho markets, within per-market caps enforced onchain. The reallocator cannot send funds anywhere else.",
            "Deposits and withdrawals are available on the vault pages and in the terminal (deposit-v2 / withdraw-v2). Approvals are exact-amount.",
            "A liquidity buffer is kept in a designated market so ordinary withdrawals do not depend on a reallocation.",
          ],
        },
      ],
    },
    {
      title: "RISK — READ THIS",
      blocks: [
        {
          kind: "banner",
          tone: "warn",
          text: "Depositing exposes you to real risks that no strategy removes. Nothing here is investment advice; deposit only what you can afford to lose.",
        },
        {
          kind: "list",
          items: [
            "Smart-contract risk: the vaults, Morpho, and every market's oracle and IRM are code; code can have bugs.",
            "Market risk: if a market's borrowers are liquidated into thin liquidity, bad debt socializes to lenders — see the risk engine's capacity_ratio for how the stack measures this.",
            "Oracle risk: a wrong price liquidates the wrong people. MNEMON tracks oracle deviation continuously, but tracking is not prevention.",
            "Liquidity risk: at high utilization withdrawals can be temporarily constrained until rates rebalance the market (MNEMON's utilization spells measure exactly these episodes).",
            "Strategy risk: HEGEMON's gates bound behavior but cannot guarantee yield; past performance predicts nothing.",
          ],
        },
      ],
    },
    {
      title: "V1 DEPRECATION",
      blocks: [
        {
          kind: "p",
          text: "The V1 MetaMorpho vault is deprecated: deposits are closed, withdrawals remain open indefinitely. Existing depositors can exit at any time from the vault page.",
        },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */

export const DOCS: Doc[] = [OVERVIEW, HEGEMON, MNEMON, RISK, VAULTS];

export function getDoc(slug: string): Doc | undefined {
  return DOCS.find((d) => d.slug === slug);
}

export function getDocByManName(name: string): Doc | undefined {
  return DOCS.find((d) => d.manName === name || d.slug === name);
}

/* ------------------------------------------------------------------ */
/* man renderer — the terminal's `man <page>` output                   */
/* ------------------------------------------------------------------ */

const MAN_WIDTH = 66;

function manHeaderLine(left: string, center: string, right: string): string {
  const midStart = Math.max(left.length + 2, Math.floor((MAN_WIDTH - center.length) / 2));
  let line = left.padEnd(midStart) + center;
  line = line.padEnd(Math.max(line.length + 2, MAN_WIDTH - right.length)) + right;
  return line;
}

/** Render a doc as plain terminal lines (the `man` command's output). */
export function renderDocToMan(doc: Doc): string[] {
  const ref = `${doc.title.toUpperCase()}(${Number(doc.n)})`;
  const out: string[] = [];
  out.push(manHeaderLine(ref, "MYRMIDONS MANUAL", ref));
  out.push("");
  out.push("NAME");
  out.push(`    ${doc.manName} — ${doc.tagline}`);
  for (const section of doc.sections) {
    out.push("");
    out.push(section.title.toUpperCase());
    for (const block of section.blocks) {
      switch (block.kind) {
        case "p":
          out.push(...wrap(block.text, 4));
          break;
        case "formula":
          for (const [lhs, rhs, comment] of block.lines) {
            out.push(`    ${lhs} ${rhs}  ${comment}`);
          }
          break;
        case "table":
          for (const [a, b, c2] of block.rows) {
            const dots = ".".repeat(Math.max(2, 30 - a.length));
            out.push(`    ${a}${dots}${b}${c2 ? `  ${c2}` : ""}`);
          }
          break;
        case "list":
          for (const item of block.items) {
            const lines = wrap(item, 6);
            out.push(`    - ${lines[0]?.trimStart() ?? ""}`);
            out.push(...lines.slice(1));
          }
          break;
        case "banner":
          out.push(...wrap(`[${block.tone === "warn" ? "!" : "i"}] ${block.text}`, 4));
          break;
      }
    }
  }
  out.push("");
  out.push("SEE ALSO");
  out.push(
    "    " +
      DOCS.filter((d) => d.slug !== doc.slug)
        .map((d) => `${d.manName}(${Number(d.n)})`)
        .join(", ") +
      ` · full page: /docs/${doc.slug}`
  );
  out.push("");
  out.push(manHeaderLine("MYRMIDONS", "2026-08", ref));
  return out;
}

function wrap(text: string, indent: number): string[] {
  const pad = " ".repeat(indent);
  const words = text.split(" ");
  const lines: string[] = [];
  let line = pad;
  for (const w of words) {
    if (line.length + w.length + 1 > MAN_WIDTH && line.trim()) {
      lines.push(line);
      line = pad;
    }
    line += (line.trim() ? " " : "") + w;
  }
  if (line.trim()) lines.push(line);
  return lines;
}
