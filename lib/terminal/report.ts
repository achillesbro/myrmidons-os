/**
 * Text reports for the terminal's read commands — status, alloc, market, top, nav,
 * markets filters. Framework-free: the page hands in what its hooks hold and prints
 * the lines. Columns are padded with plain spaces; the page's out-lines collapse
 * whitespace, so callers pass the lines through `nb`-style NBSP padding (see
 * `hard` below) before appending.
 */
import type { MarketHealthEntry, MarketFlows } from "@/lib/mnemon/schemas";
import type { RiskMarket } from "@/lib/risk/schemas";
import type { HistoryPoint } from "@/lib/morpho/schemas";
import type { AllocationRow, KpiData } from "@/lib/morpho/view";
import { chainTag, fmtAge, fmtLltv, fmtPct, fmtUsd, investableGateText, MNEMON_CHAINS, reasonLabel } from "@/lib/mnemon/format";
import { isInvestable, isRealMarket, resolveMarketRef } from "@/lib/mnemon/aggregate";

/** A market ref for a READ (market card, watch): the wallet's chain first, then any chain
 *  that has it — one chain's hit or ambiguity is returned, several chains ask for a tag. */
export function resolveMarketAnywhere(markets: MarketHealthEntry[], ref: string, chainId: number): ReturnType<typeof resolveMarketRef> {
  const real = markets.filter(isRealMarket);
  const home = resolveMarketRef(real, ref, chainId);
  if (home.ok || home.candidates.length > 0 || !home.error.startsWith("MARKET_NOT_FOUND")) return home;
  const elsewhere = MNEMON_CHAINS.map((c) => ({ chain: c, r: resolveMarketRef(real, ref, c.id) })).filter(({ r }) => r.ok || r.candidates.length > 0);
  if (elsewhere.length === 1) return elsewhere[0].r;
  if (elsewhere.length === 0) return home;
  return { ok: false, error: `AMBIGUOUS_CHAIN  ${ref} exists on ${elsewhere.map(({ chain }) => chain.tag).join(", ")} — 'chain <name>' to pick, or use the market id`, candidates: [] };
}
import { oracleProvider } from "@/lib/risk/oracle";
import { CHAINS } from "@/lib/web3/chains";

/** Column padding that survives the log's whitespace collapsing. */
export const hard = (s: string) => s.replace(/ {2,}|^ /g, (m) => " ".repeat(m.length));
const pad = (s: string, n: number) => s.padEnd(n);
const num = (v: number | null | undefined, digits = 2) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));

export const pairOf = (m: MarketHealthEntry) => `${m.collateral_symbol}/${m.loan_symbol}@${m.lltv != null ? Math.round(m.lltv * 100) : "?"}`;

// ---- status
export interface VaultSummary { name: string; kpis: KpiData | null; loading: boolean }
export function statusLines(a: {
  markets: MarketHealthEntry[];
  generatedAt: string | null | undefined;
  vaults: VaultSummary[];
  chainId: number;
  block: bigint | undefined;
  gasGwei: string;
  address: string | undefined;
}): string[] {
  const real = a.markets.filter(isRealMarket);
  const counts = new Map<number, number>();
  for (const m of real) counts.set(m.chain_id ?? 999, (counts.get(m.chain_id ?? 999) ?? 0) + 1);
  const chain = CHAINS.find((c) => c.id === a.chainId);
  const lines = [
    "SYSTEM STATUS",
    `  INDEX      MNEMON  ${real.length} markets on ${MNEMON_CHAINS.length} chains  ·  snapshot ${a.generatedAt ? fmtAge(a.generatedAt) : "—"}`,
    ...MNEMON_CHAINS.map((c) => `             ${pad(chainTag(c.id), 5)} ${pad(c.label, 12)} ${pad(String(counts.get(c.id) ?? 0), 4)} markets`),
    `  VAULTS     ${a.vaults.length} on HyperEVM  (HEGEMON_V2 reallocator, test phase)`,
    ...a.vaults.map((v) => `             ${pad(v.name, 17)} TVL ${pad(v.loading ? "…" : v.kpis?.tvlUsd ?? "—", 12)} APY ${v.loading ? "…" : v.kpis?.netApyPct ?? "—"}`),
    `  WALLET     ${a.address ? `${a.address.slice(0, 6)}…${a.address.slice(-4)}` : "GUEST"}  ·  chain ${chain ? `${chainTag(a.chainId)} ${chain.name}` : a.chainId}  ·  block ${a.block != null ? a.block.toLocaleString("en-US") : "—"}  ·  gas ${a.gasGwei} gwei`,
  ];
  return lines;
}

// ---- alloc
export function allocLines(vaultName: string, rows: AllocationRow[], markets: MarketHealthEntry[]): string[] {
  if (rows.length === 0) return [`${vaultName}  no allocations yet`];
  const byId = new Map(markets.map((m) => [m.market_id.toLowerCase(), m]));
  const lines = [`${vaultName}  ALLOCATIONS  (${rows.length} rows)`, `  ${pad("MARKET", 28)} ${pad("WEIGHT", 8)} ${pad("APY", 8)} ${pad("UTIL", 8)} ${pad("AVAIL", 10)} STATUS`];
  for (const r of rows) {
    const m = r.marketId ? byId.get(r.marketId.toLowerCase()) : undefined;
    const status = !m ? (r.market.toLowerCase().includes("idle") ? "IDLE" : "UNTRACKED") : m.is_broken ? `BROKEN ${reasonLabel(m.broken_reason) ?? ""}`.trim() : isInvestable(m) ? "INVESTABLE" : `NOT_INVESTABLE ${(m.investable_reasons ?? []).slice(0, 2).join(",")}`.trim();
    lines.push(`  ${pad(r.market.slice(0, 28), 28)} ${pad(r.allocationPct != null ? `${r.allocationPct.toFixed(1)}%` : "—", 8)} ${pad(r.apyPct != null ? `${r.apyPct.toFixed(2)}%` : m ? fmtPct(m.supply_apy) : "—", 8)} ${pad(m ? fmtPct(m.utilization, 1) : "—", 8)} ${pad(m ? fmtUsd(m.available_usd) : "—", 10)} ${status}`);
  }
  return lines;
}

// ---- market <ref>: the analyser's drill-down as a card
export function marketCard(m: MarketHealthEntry, risk: RiskMarket | undefined, flows: MarketFlows | undefined, best: MarketHealthEntry | undefined): string[] {
  const metric = (name: string) => risk?.metrics[name]?.value;
  const f = flows?.markets.find((x) => x.market_id.toLowerCase() === m.market_id.toLowerCase() && (x.chain_id ?? 999) === (m.chain_id ?? 999));
  const liq = flows?.liquidations.filter((l) => l.market_id.toLowerCase() === m.market_id.toLowerCase() && (l.chain_id ?? 999) === (m.chain_id ?? 999)) ?? [];
  const cap = risk?.liq_capacity;
  const oracle = risk?.oracle ? oracleProvider(risk.oracle) : null;
  const gates = m.investable_reasons ?? [];
  const warns = m.investable_warnings ?? [];
  const loan = m.loan_symbol ?? "";
  const br = m.borrower_risk, sc = m.supplier_concentration, gi = m.investable_inputs;
  const lines = [
    `${pairOf(m)}  ${chainTag(m.chain_id ?? 999)}  ${m.market_id}`,
    `  RATES       supply ${fmtPct(m.supply_apy)}  ·  borrow ${fmtPct(m.borrow_apy)}  ·  apy@target ${fmtPct(m.apy_at_target)}  ·  util ${fmtPct(m.utilization, 1)} (7d ${fmtPct(metric("avg_util_7d"), 1)}, 30d ${fmtPct(metric("avg_util_30d"), 1)})  ·  time>95% 30d ${fmtPct(metric("time_at_utilization_95_30d"), 1)}${best && best.market_id !== m.market_id ? `  ·  best ${loan}: ${pairOf(best)} ${fmtPct(best.supply_apy)}` : ""}`,
    `  BOOK        supply ${fmtUsd(m.supply_usd)}  ·  available ${fmtUsd(m.available_usd)}  ·  suppliers ${sc?.suppliers ?? "—"} (top1 ${fmtPct(metric("top1_supply_share"), 0)}, top3 ${fmtPct(metric("top3_supply_share"), 0)})  ·  borrowers ${br?.borrowers ?? "—"} (top1 ${fmtPct(metric("top1_borrow_share"), 0)})`,
    `  RISK        liq_capacity ${cap?.capacity_ratio != null ? `${cap.capacity_ratio.toFixed(2)}x` : "—"}  ·  min_hf ${br?.min_hf != null ? br.min_hf.toFixed(2) : "—"}  ·  hf<1.05 ${br?.borrowers_hf_lt_105 ?? "—"} borrowers / ${fmtPct(br?.pct_debt_hf_lt_105, 1)} of debt  ·  at-risk debt ${fmtUsd(gi?.at_risk_debt_usd)}  ·  bad debt 30d ${fmtUsd(gi?.bad_debt_30d_usd)}`,
    `  COLLATERAL  lltv ${fmtLltv(m.lltv)}  ·  lif ${gi?.lif != null ? gi.lif.toFixed(3) : "—"}  ·  vol 7d ${fmtPct(metric("realized_vol_7d"), 0)} / 30d ${fmtPct(metric("realized_vol_30d"), 0)}  ·  drawdown 30d ${fmtPct(metric("max_drawdown_30d"))}  ·  buffer breaches 24h ${fmtPct(metric("buffer_breach_freq_24h"))}`,
    `  ORACLE      ${oracle ? `${oracle.label}${oracle.confidence === "claimed" ? " ?" : ""}` : "NO_ORACLE_DATA"}  ·  price ${m.oracle_price != null ? num(m.oracle_price, 6) : "—"}  ·  vs spot ${m.oracle_deviation != null ? fmtPct(m.oracle_deviation) : "—"}${risk?.oracle?.owner_status ? `  ·  owner ${risk.oracle.owner_status}` : ""}${risk?.oracle?.shared_feed_markets ? `  ·  feed shared by ${risk.oracle.shared_feed_markets} markets` : ""}`,
    `  FLOWS       ${f ? `24h supply ${num(f.net_supply_24h)} ${loan} (in ${num(f.supply_in_24h)}, out ${num(f.supply_out_24h)})  ·  24h borrow ${num(f.net_borrow_24h)} ${loan}  ·  7d supply ${num(f.net_supply_7d)} ${loan}` : "no flow data"}  ·  liquidations 30d ${f?.n_liquidations_30d ?? liq.length}`,
    `  GATES       ${m.is_broken ? `BROKEN  ${reasonLabel(m.broken_reason) ?? m.broken_reason ?? ""}` : isInvestable(m) ? "INVESTABLE" : `NOT_INVESTABLE  ${gates.map((g) => `${g}: ${investableGateText(g)}`).join("  ·  ") || "—"}`}${warns.length ? `  ·  warnings ${warns.join(", ")}` : ""}`,
  ];
  return lines;
}

// ---- top [loan] [chain]
export function topLines(markets: MarketHealthEntry[], opts: { loan?: string; chainId?: number; n?: number }): string[] {
  const n = opts.n ?? 10;
  const hits = markets
    .filter(isRealMarket)
    .filter(isInvestable)
    .filter((m) => (opts.loan ? (m.loan_symbol ?? "").toLowerCase() === opts.loan.toLowerCase() : true))
    .filter((m) => (opts.chainId != null ? (m.chain_id ?? 999) === opts.chainId : true))
    .sort((a, b) => (b.supply_apy ?? 0) - (a.supply_apy ?? 0));
  const scope = [opts.loan ? opts.loan.toUpperCase() : "every loan token", opts.chainId != null ? chainTag(opts.chainId) : "every chain"].join(", ");
  if (hits.length === 0) return [`TOP  no investable market for ${scope}`];
  const lines = [`TOP  ${Math.min(n, hits.length)} of ${hits.length} investable markets by supply APY  (${scope})`, `  ${pad("CHAIN", 5)} ${pad("MARKET", 24)} ${pad("APY", 8)} ${pad("UTIL", 7)} ${pad("AVAILABLE", 11)} ${pad("SUPPLY", 10)} WARN`];
  for (const m of hits.slice(0, n)) {
    lines.push(`  ${pad(chainTag(m.chain_id ?? 999), 5)} ${pad(pairOf(m), 24)} ${pad(fmtPct(m.supply_apy), 8)} ${pad(fmtPct(m.utilization, 0), 7)} ${pad(fmtUsd(m.available_usd), 11)} ${pad(fmtUsd(m.supply_usd), 10)} ${(m.investable_warnings ?? []).join(",") || "—"}`);
    lines.push(`        ${m.market_id}`);
  }
  return lines;
}

// ---- markets [query] [--chain x] [--loan y] [--sort apy|supply|util|borrow] [--n N]
export interface MarketsArgs { query?: string; chainId?: number; loan?: string; sort: "apy" | "supply" | "util" | "borrow"; n: number; investable: boolean }
export function parseMarketsArgs(arg: string, resolveChain: (ref: string) => number | null): MarketsArgs | { error: string } {
  const out: MarketsArgs = { sort: "supply", n: 8, investable: false };
  const tokens = arg.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].toLowerCase();
    const val = () => tokens[++i];
    if (t === "--chain" || t === "-c") { const v = val(); const id = v ? resolveChain(v) : null; if (id == null) return { error: `UNKNOWN_CHAIN  ${v ?? ""}` }; out.chainId = id; }
    else if (t === "--loan" || t === "-l") { const v = val(); if (!v) return { error: "USAGE  --loan <symbol>" }; out.loan = v; }
    else if (t === "--sort" || t === "-s") { const v = val()?.toLowerCase(); if (v !== "apy" && v !== "supply" && v !== "util" && v !== "borrow") return { error: "USAGE  --sort apy|supply|util|borrow" }; out.sort = v; }
    else if (t === "--n" || t === "-n") { const v = Number(val()); if (!Number.isFinite(v) || v < 1) return { error: "USAGE  --n <count>" }; out.n = Math.min(40, v); }
    else if (t === "--investable" || t === "-i") out.investable = true;
    else if (t.startsWith("-")) return { error: `UNKNOWN_FLAG  ${t}` };
    else out.query = (out.query ? `${out.query} ` : "") + tokens[i];
  }
  return out;
}
export function marketsLines(all: MarketHealthEntry[], a: MarketsArgs, walletChainId: number): string[] {
  const q = a.query?.toLowerCase();
  const pair = q?.match(/^([^/@]+)\/([^/@]+)(?:@(\d+)%?)?$/);
  const key = { apy: (m: MarketHealthEntry) => m.supply_apy ?? 0, supply: (m: MarketHealthEntry) => m.supply_usd ?? 0, util: (m: MarketHealthEntry) => m.utilization ?? 0, borrow: (m: MarketHealthEntry) => m.borrow_apy ?? 0 }[a.sort];
  const hits = all
    .filter(isRealMarket)
    .filter((m) => {
      if (!q) return true;
      const c = (m.collateral_symbol ?? "").toLowerCase(), l = (m.loan_symbol ?? "").toLowerCase();
      if (pair) return c === pair[1] && l === pair[2] && (pair[3] == null || Math.round((m.lltv ?? 0) * 100) === Number(pair[3]));
      if (q.startsWith("0x")) return m.market_id.toLowerCase().startsWith(q);
      return c.includes(q) || l.includes(q);
    })
    .filter((m) => (a.chainId != null ? (m.chain_id ?? 999) === a.chainId : true))
    .filter((m) => (a.loan ? (m.loan_symbol ?? "").toLowerCase() === a.loan.toLowerCase() : true))
    .filter((m) => (a.investable ? isInvestable(m) : true))
    .sort((x, y) => key(y) - key(x));
  const scope = [a.query, a.chainId != null && `chain ${chainTag(a.chainId)}`, a.loan && `loan ${a.loan.toUpperCase()}`, a.investable && "investable"].filter(Boolean).join(", ");
  if (hits.length === 0) return [`NO_MATCH  ${scope || "(all)"}`];
  const lines = [`MARKETS  ${scope || "all"}  ${hits.length} match${hits.length > 1 ? "es" : ""}${hits.length > a.n ? `, top ${a.n} by ${a.sort}` : ""}`];
  for (const m of hits.slice(0, a.n)) {
    const flags = [m.is_broken ? "BROKEN" : null, !m.is_broken && !isInvestable(m) ? "NOT_INVESTABLE" : null, (m.chain_id ?? 999) !== walletChainId ? "OTHER_CHAIN" : null].filter(Boolean).join(" ");
    lines.push(`  ${pad(chainTag(m.chain_id ?? 999), 5)} ${pad(pairOf(m), 22)} supply ${pad(fmtPct(m.supply_apy), 7)} borrow ${pad(fmtPct(m.borrow_apy), 7)} util ${pad(fmtPct(m.utilization, 0), 5)} liq ${pad(fmtUsd(m.available_usd), 9)} ${flags}`);
    lines.push(`        ${m.market_id}`);
  }
  return lines;
}

// ---- nav <vault> [7d|30d|90d]: block-character sparkline of the vault's history
const BLOCKS = "▁▂▃▄▅▆▇█";
export function sparkline(values: number[], width: number): string {
  if (values.length === 0) return "";
  const cols: number[] = [];
  for (let i = 0; i < width; i++) {                        // resample: mean of each column's bucket
    const a = Math.floor((i * values.length) / width), b = Math.max(a + 1, Math.floor(((i + 1) * values.length) / width));
    const slice = values.slice(a, b);
    cols.push(slice.reduce((s, v) => s + v, 0) / slice.length);
  }
  const min = Math.min(...cols), max = Math.max(...cols), span = max - min || 1;
  return cols.map((v) => BLOCKS[Math.min(7, Math.round(((v - min) / span) * 7))]).join("");
}
export function navLines(vaultName: string, points: HistoryPoint[], range: string): string[] {
  const apy = points.map((p) => p.apy).filter((v): v is number => v != null && Number.isFinite(v));
  const tvl = points.map((p) => p.tvlUsd).filter((v): v is number => v != null && Number.isFinite(v));
  if (apy.length < 2 && tvl.length < 2) return [`${vaultName}  ${range}  no history yet (the vault is young; points accrue as the API samples it)`];
  const width = Math.min(60, Math.max(apy.length, tvl.length));
  const first = points[0]?.t, last = points[points.length - 1]?.t;
  const day = (t: number | undefined) => (t ? new Date(t).toISOString().slice(0, 10) : "—");
  const lines = [`${vaultName}  ${range}  ${points.length} points  ${day(first)} → ${day(last)}`];
  if (apy.length >= 2) {
    const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
    lines.push(`  APY  ${sparkline(apy, width)}`, `       first ${pct(apy[0])}  ·  last ${pct(apy[apy.length - 1])}  ·  min ${pct(Math.min(...apy))}  ·  max ${pct(Math.max(...apy))}  ·  mean ${pct(apy.reduce((s, v) => s + v, 0) / apy.length)}`);
  }
  if (tvl.length >= 2) {
    lines.push(`  TVL  ${sparkline(tvl, width)}`, `       first ${fmtUsd(tvl[0])}  ·  last ${fmtUsd(tvl[tvl.length - 1])}  ·  min ${fmtUsd(Math.min(...tvl))}  ·  max ${fmtUsd(Math.max(...tvl))}  ·  change ${fmtPct((tvl[tvl.length - 1] - tvl[0]) / (tvl[0] || 1), 1)}`);
  }
  return lines;
}

// ---- changelog: what shipped, from the repo's own record (CLAUDE.md dates)
export const CHANGELOG: [string, string][] = [
  ["2026-09-26", "OS v0.9.3 — CRT tube + retro-PC sounds; vault selection, alloc, nav, market, top, tail, watch, alias, tx, export"],
  ["2026-09-25", "Morpho SDK v6: every Blue write is one BlueBundlesV1 call; Arc joins the wallet chains; vector emblem"],
  ["2026-09-16", "MNEMON export v8: investable is a gate model (exit liquidity, rate, oracle, bad debt, DEX liquidatability)"],
  ["2026-09-15", "Market lend/borrow from the analyser and the terminal; PORTFOLIO tracker; HEGEMON V1 vault retired"],
  ["2026-09-01", "Oracle identity from the risk API: provider, composition, owner, shared-feed blast radius"],
  ["2026-08-25", "MYRMIDONS WHYPE vault (Morpho Vault V2, 18-dec asset)"],
  ["2026-08-20", "MNEMON goes multi-chain (schema v5); risk-model panel"],
  ["2026-07-22", "MYRMIDONS USDC vault"],
  ["2026-07-17", "MYRMIDONS USDT0 — first Morpho Vault V2, HEGEMON_V2 reallocator"],
];
