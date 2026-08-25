import { HEGEMON_V2_CONSTANTS } from "@/lib/strategy/hegemonV2";
import {
  HEGEMON_V2_VAULT_ADDRESS,
  USDC_V2_VAULT_ADDRESS,
  USDT0_VAULT_ADDRESS,
  WHYPE_V2_VAULT_ADDRESS,
} from "@/lib/constants/vaults";

/**
 * Docs content: five pages as typed block lists, the single source for BOTH
 * renderers — /docs/[slug] (components/docs/DocPage) and the terminal's
 * `man` command (renderDocToMan below). No MDX: structured blocks are what
 * lets one source feed a React page and a text stream.
 *
 * Prose style: ASD-STE100 simplified technical English. Short sentences,
 * one idea per sentence, active voice, no metaphors or idioms, no em-dashes.
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
  | { kind: "banner"; tone: "warn" | "ok"; text: string }
  /** Live chart on the web page (components/docs/DocFigure); `man` prints
   *  the caption as a [figure] line. */
  | { kind: "figure"; figure: "bell-curve" | "broken-market" | "capacity-ratio"; caption: string }
  /** API endpoints, one sub-section each: title, description, the path
   *  (copyable as a full URL), an executable curl (curlPath substitutes a
   *  real market id for {market_id} templates), and a truncated real
   *  response. */
  | {
      kind: "endpoints";
      base: string;
      items: {
        title: string;
        path: string;
        curlPath?: string;
        desc: string;
        example: string;
      }[];
    };

export interface DocSection {
  title: string;
  blocks: DocBlock[];
  /** Lead section: the web page renders it as opening prose with NO heading
   *  (it flows from the page title); `man` still prints the title. */
  lead?: boolean;
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
  tagline: "the stack: observe, classify, allocate",
  sections: [
    {
      title: "WHAT THIS IS",
      lead: true,
      blocks: [
        {
          kind: "p",
          text: "MYRMIDONS is a research and execution stack for onchain lending markets. It is built on Morpho. It is live on HyperEVM (chain 999) and Robinhood Chain (chain 4663). The stack runs one continuous loop: it observes every market, classifies which markets are real and investable, and reallocates vault capital to the best of them.",
        },
      ],
    },
    {
      title: "THE LOOP",
      blocks: [
        {
          kind: "formula",
          lines: [
            ["MNEMON", "──▶ samples every Morpho market", "// every 5 to 15 min"],
            ["CLASSIFIER", "──▶ flags broken markets, marks investable", "// server-side rules"],
            ["HEGEMON", "──▶ reallocates vault capital", "// simulated before sent"],
          ],
        },
        {
          kind: "p",
          text: "All data in the loop is public. The archive is served as static JSON. The risk engine is served as a versioned API. The reallocator's decisions stream live into the site's terminal.",
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
            ["MNEMON", "Market archive: sampling, classifier, flows", "data.myrmidons-strategies.com"],
            ["METRON", "Pure statistics library (risk estimators)", "internal, tag-pinned"],
            ["RISK ENGINE", "Capacity and risk metrics on the archive", "api.myrmidons-strategies.com"],
            ["HEGEMON", "Vault reallocator bot", "operator VPS"],
            ["VAULTS", "ERC-4626 Morpho vaults the bot manages", "HyperEVM"],
          ],
        },
        {
          kind: "p",
          text: "The keeper also exposes a live event stream (SSE). This stream powers the terminal feeds on the vault pages. It is observable, but it has no stability promise.",
        },
      ],
    },
    {
      title: "SCOPE",
      blocks: [
        {
          kind: "p",
          text: "The archive covers both chains. Every Morpho market on HyperEVM and Robinhood Chain is archived, classified, and risk-scored. Execution (the vaults and the reallocator) runs on HyperEVM only. The stack operates at proof-of-concept scale. More chains are planned.",
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
  tagline: "the vault reallocator",
  sections: [
    {
      title: "DESCRIPTION",
      lead: true,
      blocks: [
        {
          kind: "p",
          text: "HEGEMON is the reallocator. It moves vault capital between whitelisted Morpho markets along a utilization-targeting curve. Each market receives a score. The scores become target weights. A rebalance executes only when the change clears the churn floor. The bot simulates every move before it sends the move onchain.",
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
          text: "The bot normalizes the scores and applies a softmax (temperature SOFTMAX_T) to get target weights. The bell curve keeps capital where utilization is healthy: high enough to earn, low enough to exit.",
        },
        {
          kind: "figure",
          figure: "bell-curve",
          caption:
            "a(u), the effective utilization attractiveness the scorer applies, rendered from the deployed constants: a bell centered on U0, cut to SAT_INFLOW_MULT inside the saturated band, and zero at U_CRIT.",
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
            ["U_OPT_LOW", String(C.U_OPT_LOW), "Deposits never push a market below this level"],
            ["U_SAT", String(C.U_SAT), "Start of the saturated band; inflow is reduced"],
            ["U_CRIT", String(C.U_CRIT), "Hard gate: no deposits at or above this level"],
            ["EXIT_MIN", String(C.EXIT_MIN), "exitRatio floor for new deposits"],
            ["EXIT_POWER", String(C.EXIT_POWER), "Convexity of the exit-safety penalty"],
            ["SAT_INFLOW_MULT", String(C.SAT_INFLOW_MULT), "Inflow multiplier in the saturated band"],
            ["SOFTMAX_T", String(C.SOFTMAX_T), "Softmax temperature over normalized scores"],
            ["MIN_REALLOC_BPS_DELTA", String(C.MIN_REALLOC_BPS_DELTA), "Churn floor (bps of totalAssets per market)"],
            ["CRIT_WEIGHT_RISK", String(C.CRIT_WEIGHT_RISK), "Risk-lane trigger (assets in critical markets)"],
            ["RISK_COOLDOWN_HOURS", String(C.RISK_COOLDOWN_HOURS), "Deposit cooldown after a risk-lane exit"],
            ["LIQUIDITY_BUFFER_BPS", String(C.LIQUIDITY_BUFFER_BPS), "Floor kept in the liquidity market"],
          ],
        },
        {
          kind: "banner",
          tone: "ok",
          text: "The values on this page render directly from the strategy module the site runs on. They cannot differ from the deployed configuration.",
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
            "In the saturated band [U_SAT, U_CRIT), SAT_INFLOW_MULT reduces the inflow.",
            "A market below the EXIT_MIN exit ratio receives no new deposits until it recovers.",
            "After a risk-lane exit, the market goes on a deposit cooldown (RISK_COOLDOWN_HOURS).",
            "A rebalance executes only when a market's weight change clears MIN_REALLOC_BPS_DELTA.",
            "The bot keeps a liquidity buffer (LIQUIDITY_BUFFER_BPS of totalAssets) in a designated liquidity market. The liquidity market rotates only when a challenger beats the incumbent by LIQUIDITY_ROTATION_FACTOR.",
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
  tagline: "the market archive",
  sections: [
    {
      title: "DESCRIPTION",
      lead: true,
      blocks: [
        {
          kind: "p",
          text: "MNEMON is an independent archive of every Morpho market on HyperEVM and Robinhood Chain. It samples the chains on fixed cadences: market state every 5 minutes, most other feeds every 15 minutes. It stores all data on MYRMIDONS infrastructure. It is not a proxy of the Morpho API. On top of the raw feed, it runs a broken-market classifier, investability rules, and event ingestion for flows and liquidations.",
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
            ["RATE_RATCHET", "apy@target > 50% / < 25%", "The IRM has entered a runaway rate. The market is broken, not attractive"],
            ["PINNED_UTIL", "u ≥ 99.9% for 24h / below 95% for 48h", "The market is stuck at full utilization. Lenders cannot withdraw"],
            ["DUST", "supply < $1k", "The market is too small to be meaningful"],
          ],
        },
        {
          kind: "p",
          text: "The ratchet and pinned flags apply only while a market's supply is below $25k. A deep market with high rates is an opportunity, not a defect. Classification uses hysteresis: a market enters and exits each flag at different thresholds, so the flags do not oscillate.",
        },
        {
          kind: "p",
          text: "A market is INVESTABLE when it is not broken and has at least $50k of available liquidity. The server computes this flag. The site and the reallocator benchmark both filter on it, so every consumer agrees on what is deployable.",
        },
        {
          kind: "figure",
          figure: "broken-market",
          caption:
            "A market the classifier flags right now, live from the archive: 7d supply APY (gold, left axis) and utilization (right axis). A rate ratchet reads as the APY series going vertical while utilization stays pinned.",
        },
      ],
    },
    {
      title: "WHAT IT TRACKS",
      blocks: [
        {
          kind: "list",
          items: [
            "Market state: rates, utilization, supply and borrow, oracle price. Sampled every 5 minutes.",
            "Flows: every Morpho market event (supply, withdraw, borrow, repay, liquidations), whale flows (single events of 5% or more of a market's supply), and per-chain sync cursors.",
            "Borrower and lender books: health factors, near-liquidation debt share, lender concentration.",
            "Utilization spells: periods at or near full utilization, when lenders may not be able to exit.",
            "Oracle deviation: the Morpho oracle against the DefiLlama cross. Persistent deviation identifies an exchange-rate oracle. A short episode is a depeg.",
            "Liquidation capacity inputs: DEX route quote ladders and HyperCore book depth, sampled every hour.",
          ],
        },
      ],
    },
    {
      title: "DATA // STATIC JSON EXPORT",
      blocks: [
        {
          kind: "banner",
          tone: "warn",
          text: "UNSTABLE // SCHEMA MAY CHANGE. These files exist for the site's own tools. Every file carries a schema_version. Fields can be added or changed without notice. Build on the risk API where possible.",
        },
        {
          kind: "table",
          columns: ["FILE", "CONTENT", "CADENCE"],
          rows: [
            ["market_health.json", "Latest state and classifier verdict per market, 7d sparkline", "15 min"],
            ["market_flows.json", "Per-market flow windows, whale feed, liquidation feed, per-chain sync", "15 min"],
            ["util_spells.json", "Near-full-utilization episodes, trailing 30d", "15 min"],
            ["depeg_spells.json", "Oracle decoupling episodes, trailing 30d", "15 min"],
          ],
        },
        {
          kind: "p",
          text: "The files are served from data.myrmidons-strategies.com. Rows are keyed on (chain_id, market_id). The top-level chain_id is null when a file mixes chains. Schema history: v4 added the server-computed investable flag. v5 added per-row chain_id. v6 added per-chain flow sync state.",
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
  tagline: "the risk engine",
  sections: [
    {
      title: "DESCRIPTION",
      lead: true,
      blocks: [
        {
          kind: "p",
          text: "The risk engine computes model-grade metrics on top of the MNEMON archive. METRON, a pure statistics library, provides the estimators. Orchestrators run the estimators every hour for each market. The results ship as a versioned static API. MNEMON records what happens. The risk engine estimates what can go wrong.",
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
          text: "capacity_ratio divides the debt-clearing capacity (capacity / LIF) by the market's total borrow. It is the fraction of the whole book that liquidators can clear profitably in one sweep at current onchain liquidity. At 1.0 or above, the full book clears. Far below 1.0, a large liquidation event exceeds what the venues can absorb. Liquidations then stall, and lenders absorb the shortfall. capacity_ratio_grouped is the stress version: every market that shares the collateral sells into the same liquidity at the same time.",
        },
        {
          kind: "figure",
          figure: "capacity-ratio",
          caption:
            "Latest capacity_ratio for the largest books, live from the API (log scale). Right of the 1x line, liquidators can clear the whole book in one sweep; markets with a zero or failed capacity row are not plotted.",
        },
      ],
    },
    {
      title: "BUFFER BREACH",
      blocks: [
        {
          kind: "p",
          text: "A market's cushion is 1 − LLTV. This is the price drop that liquidates a borrower at the reference LTV. buffer_breach_freq_{1h,6h,24h} is the share of the last 30 days in which the collateral price fell through the whole cushion within the horizon. It measures the fat tail that volatility alone does not show. The measure is one-sided: price increases never count.",
        },
      ],
    },
    {
      title: "METRIC FAMILIES",
      blocks: [
        {
          kind: "table",
          columns: ["FAMILY", "METRICS", "WHAT IT MEASURES"],
          rows: [
            [
              "VOLATILITY",
              "realized_vol_7d · realized_vol_30d · ewma_vol_30d",
              "Annualized, from hourly collateral prices; the EWMA has a 7d half-life",
            ],
            [
              "DRAWDOWN",
              "max_drawdown_30d · worst_window_7d_30d",
              "Max peak-to-trough decline and worst cumulative 7d window, 30d lookback",
            ],
            [
              "BUFFER BREACH",
              "buffer_breach_freq_1h · buffer_breach_freq_6h · buffer_breach_freq_24h",
              "Share of the horizon's returns that fell through the whole cushion (1 − LLTV)",
            ],
            [
              "UTILIZATION",
              "avg_util_7d · avg_util_30d · occupancy_below_kink_30d · time_at_utilization_95_30d · time_at_utilization_99_30d · util_spell_median_h · util_spell_p90_h · util_spell_survival_24h",
              "Time-weighted mean utilization (7d/30d), time below the IRM kink, time above 95% and 99%, and u ≥ 0.95 spell statistics with Kaplan-Meier survival",
            ],
            [
              "CONCENTRATION",
              "hhi · top1_supply_share · top3_supply_share · top1_borrow_share · top3_borrow_share",
              "Herfindahl-Hirschman index of the lender book, and the share of each book held by its 1 and 3 largest addresses",
            ],
            ["RATES", "rate_spread_30d", "Time-weighted mean borrow-minus-supply APY over 30d"],
            [
              "ORACLE",
              "depeg_max_30d · depeg_spell_median_h · depeg_spell_p90_h · depeg_survival_24h",
              "Max oracle-vs-reference deviation and depeg spell statistics (|deviation| ≥ 5%)",
            ],
            [
              "LIQ CAPACITY",
              "capacity_ratio · capacity_ratio_grouped · lif · max_slippage_used",
              "The liquidation-capacity row, also projected as standalone metrics",
            ],
          ],
        },
        {
          kind: "p",
          text: "Every name above is queryable directly: /v1/risk/metrics/{metric}.json serves the latest value across all markets, and /v1/risk/markets/{market_id}/history/{metric}.json serves one market's full series. See the API section below.",
        },
        {
          kind: "p",
          text: "Every value carries an as_of timestamp, a status, and provenance. A metric status is ok, no_data, or insufficient_history. A capacity status is ok, no_route, no_price, or fee_exceeds_margin: the last one means the swap fee alone exceeds the liquidator's margin, so the modeled capacity is zero. A failed computation is always a row with a null value, never a missing key. The as_of grid is hourly since 2026-08-20. Earlier history is daily.",
        },
      ],
    },
    {
      title: "API",
      blocks: [
        {
          kind: "banner",
          tone: "ok",
          text: "STABLE BY CONTRACT. The schema evolves by addition only (openapi.yaml, test-enforced). Every row carries a model_version. Pin the version you validated against.",
        },
        {
          kind: "p",
          text: "The API is rebuilt each hour at :40 UTC. Markets are keyed on (chain_id, market_id) across both chains. Click any endpoint to copy its full URL. The examples below are real responses, truncated.",
        },
        {
          kind: "endpoints",
          base: "https://api.myrmidons-strategies.com",
          items: [
            {
              title: "DISCOVERY INDEX",
              path: "/v1/risk/index.json",
              desc: "Read this first. It lists the served market ids, the metric catalog (description, unit, and the latest params per metric), the endpoint templates, and a freshness block per metric (latest_as_of, expected_as_of, fresh).",
              example: `{
  "generated_at": "2026-08-20T13:40:01Z",
  "markets": ["0x0a2e456ebd…", "…"],
  "metrics": {
    "hhi": {
      "description": "Herfindahl index of the lender book.",
      "unit": "index_0_1",
      "params": { "window_days": 30, "weights": "supply_assets" }
    },
    "…": "…"
  },
  "freshness": {
    "hhi": {
      "latest_as_of": "2026-08-20T10:00:00Z",
      "expected_as_of": "2026-08-20T12:00:00Z",
      "fresh": false
    },
    "…": "…"
  },
  "endpoints": { "index": "/v1/risk/index.json", "…": "…" }
}`,
            },
            {
              title: "ALL MARKETS",
              path: "/v1/risk/markets.json",
              desc: "One document with every market. Each entry carries the latest value per metric plus the liq_capacity row. This is the endpoint to poll for a dashboard: one request per hourly cycle covers the whole universe.",
              example: `{
  "generated_at": "2026-08-20T13:40:01Z",
  "markets": {
    "0x0a2e456ebd…": {
      "chain_id": 999,
      "liq_capacity": {
        "as_of": "2026-08-20T09:00:00Z",
        "capacity_ratio": 6.4235,
        "capacity_ratio_grouped": 0.00427,
        "lif": 1.0262,
        "max_slippage_used": 0.0175,
        "status": "ok"
      },
      "metrics": {
        "buffer_breach_freq_1h": {
          "as_of": "2026-08-20T10:00:00Z",
          "value": 0.0,
          "status": "ok"
        },
        "…": "…"
      }
    },
    "…": "…"
  }
}`,
            },
            {
              title: "ONE MARKET",
              path: "/v1/risk/markets/{market_id}.json",
              curlPath: "/v1/risk/markets/0x0a2e456ebd22ed68ae1d5c6b2de70bc514337ac588a7a4b0e28f546662144036.json",
              desc: "One market, latest values only. The same shape as one entry of markets.json, plus the provenance fields (model_versions, metron_version, schema_version).",
              example: `{
  "market_id": "0x0a2e456ebd…",
  "chain_id": 999,
  "liq_capacity": {
    "capacity_ratio": 6.4235,
    "capacity_ratio_grouped": 0.00427,
    "status": "ok"
  },
  "metrics": {
    "hhi": {
      "as_of": "2026-08-20T10:00:00Z",
      "value": 0.99999,
      "status": "ok"
    },
    "…": "…"
  },
  "model_versions": ["api-v0.2.0+metron-v1.3.0"],
  "metron_version": "1.3.0"
}`,
            },
            {
              title: "MARKET HISTORY",
              path: "/v1/risk/markets/{market_id}/history.json",
              curlPath: "/v1/risk/markets/0x0a2e456ebd22ed68ae1d5c6b2de70bc514337ac588a7a4b0e28f546662144036/history.json",
              desc: "The full history for one market, grouped by metric. params and input_window describe the latest point; older points can differ across model_version bumps. Per-point provenance lives in the underlying tables.",
              example: `{
  "market_id": "0x0a2e456ebd…",
  "chain_id": 999,
  "metrics": {
    "buffer_breach_freq_1h": {
      "params": {
        "lltv": 0.915,
        "buffer": 0.085,
        "buffer_formula": "one_minus_lltv",
        "lookback_d": 30,
        "sampling": "hourly_last"
      },
      "input_window": {
        "start": "2026-07-21T10:00:00Z",
        "end": "2026-08-20T10:00:00Z"
      },
      "points": [{ "as_of": "…", "value": 0.0, "status": "ok" }, "…"]
    },
    "…": "…"
  }
}`,
            },
            {
              title: "METRIC HISTORY",
              path: "/v1/risk/markets/{market_id}/history/{metric}.json",
              curlPath: "/v1/risk/markets/0x0a2e456ebd22ed68ae1d5c6b2de70bc514337ac588a7a4b0e28f546662144036/history/hhi.json",
              desc: "One metric, one market, the full series. Points ascend by as_of. The grid is hourly since 2026-08-20 and daily before, so long series mix the two cadences.",
              example: `{
  "market_id": "0x0a2e456ebd…",
  "chain_id": 999,
  "metric": "hhi",
  "params": {
    "weights": "supply_assets",
    "snapshot": "latest_at_or_before_as_of_within_30d"
  },
  "points": [
    { "as_of": "2026-08-20T09:00:00Z", "value": 0.99999, "status": "ok" },
    { "as_of": "2026-08-20T10:00:00Z", "value": 0.99999, "status": "ok" }
  ]
}`,
            },
            {
              title: "ONE METRIC, ALL MARKETS",
              path: "/v1/risk/metrics/{metric}.json",
              curlPath: "/v1/risk/metrics/capacity_ratio.json",
              desc: "One metric across every market. Use it to rank or screen the universe. The liq_capacity fields (capacity_ratio, capacity_ratio_grouped, lif, max_slippage_used) are projected here as metrics too.",
              example: `{
  "metric": "capacity_ratio",
  "source": "liq_capacity",
  "generated_at": "2026-08-20T13:40:01Z",
  "markets": [
    {
      "market_id": "0x0309c02dab…",
      "as_of": "2026-08-20T09:00:00Z",
      "value": 0.0000664,
      "status": "ok"
    },
    {
      "market_id": "0x039503b630…",
      "as_of": "2026-08-20T09:00:00Z",
      "value": 0.0,
      "status": "fee_exceeds_margin"
    }
  ]
}`,
            },
          ],
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
  tagline: "deposits, mechanics, and risk",
  sections: [
    {
      title: "DESCRIPTION",
      lead: true,
      blocks: [
        {
          kind: "p",
          text: "The vaults are the deposit side of the stack. Each vault is a Morpho vault on HyperEVM, managed by the HEGEMON reallocator. You deposit an asset, and the vault issues ERC-4626 shares. The reallocator moves the pooled capital between whitelisted markets. Two V2 vaults are open for deposits. The original V1 vault is deprecated and only allows withdrawals.",
        },
      ],
    },
    {
      title: "THE VAULTS",
      blocks: [
        {
          kind: "table",
          columns: ["VAULT", "ADDRESS", "STATUS"],
          rows: [
            ["MYRMIDONS USDT0 (V2)", HEGEMON_V2_VAULT_ADDRESS, "Deposits open"],
            ["MYRMIDONS USDC (V2)", USDC_V2_VAULT_ADDRESS, "Deposits open"],
            ["MYRMIDONS WHYPE (V2)", WHYPE_V2_VAULT_ADDRESS, "Deposits open"],
            ["HEGEMON V1 (USDT0)", USDT0_VAULT_ADDRESS, "Deprecated; withdrawals open"],
          ],
        },
        {
          kind: "p",
          text: "All vaults are on HyperEVM (chain 999). The addresses above render from the same module the site's deposit flow uses.",
        },
      ],
    },
    {
      title: "MECHANICS",
      blocks: [
        {
          kind: "list",
          items: [
            "ERC-4626: you deposit the asset (USDT0 or USDC) and receive vault shares. The share price accrues the yield. A withdrawal burns shares and returns the asset.",
            "The vault can only allocate into its whitelisted Morpho markets, within per-market caps enforced onchain. The reallocator cannot send funds anywhere else.",
            "Deposits and withdrawals are available on the vault pages and in the terminal (deposit-v2 / withdraw-v2). Approvals are exact-amount.",
            "The bot keeps a liquidity buffer in a designated market, so ordinary withdrawals do not depend on a reallocation.",
          ],
        },
      ],
    },
    {
      title: "RISK // READ THIS",
      blocks: [
        {
          kind: "banner",
          tone: "warn",
          text: "A deposit exposes you to real risks that no strategy removes. Nothing here is investment advice. Deposit only what you can afford to lose.",
        },
        {
          kind: "list",
          items: [
            "Smart-contract risk: the vaults, Morpho, and every market's oracle and IRM are code. Code can have bugs.",
            "Market risk: when borrowers are liquidated into thin liquidity, lenders absorb the bad debt. The risk engine's capacity_ratio measures this exposure.",
            "Oracle risk: a wrong price liquidates the wrong people. MNEMON tracks oracle deviation continuously, but tracking is not prevention.",
            "Liquidity risk: at high utilization, withdrawals can be constrained until rates rebalance the market. MNEMON's utilization spells measure these episodes.",
            "Strategy risk: HEGEMON's gates bound its behavior, but they cannot guarantee yield. Past performance predicts nothing.",
          ],
        },
      ],
    },
    {
      title: "V1 DEPRECATION",
      blocks: [
        {
          kind: "p",
          text: "The V1 MetaMorpho vault is deprecated. Deposits are closed. Withdrawals stay open with no end date. Existing depositors can exit at any time from the vault page.",
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
  out.push(`    ${doc.manName} - ${doc.tagline}`);
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
        case "figure":
          out.push(...wrap(`[figure] ${block.caption} (chart: /docs/${doc.slug})`, 4));
          break;
        case "endpoints":
          out.push(`    base: ${block.base}`);
          for (const item of block.items) {
            out.push("");
            out.push(`    ${item.title}`);
            out.push(`      ${item.path}`);
            out.push(...wrap(item.desc, 6));
          }
          out.push("");
          out.push(...wrap("curl commands and response examples: /docs/risk", 4));
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
