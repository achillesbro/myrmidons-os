/**
 * Browser-local state the shell keeps between sessions: watches (alerts evaluated on the
 * data refetch) and aliases. localStorage, one key each; nothing leaves the browser.
 */
import type { MarketHealthEntry } from "@/lib/mnemon/schemas";

export type WatchOp = "<" | ">" | "<=" | ">=";
export interface Watch {
  id: number;
  kind: "market" | "vault";
  label: string;                   // what the operator typed the target as, resolved
  marketId?: string;
  chainId?: number;
  vault?: string;                  // VaultDef.key
  metric: string;
  op: WatchOp;
  value: number;
  fired: boolean;                  // edge-triggered: fires when the condition turns true
  created: number;
}

const WATCH_KEY = "myrmidons.watch";
const ALIAS_KEY = "myrmidons.alias";

const read = <T,>(key: string, fallback: T): T => {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
};
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };

export const loadWatches = () => read<Watch[]>(WATCH_KEY, []);
export const saveWatches = (w: Watch[]) => write(WATCH_KEY, w);
export const loadAliases = () => read<Record<string, string>>(ALIAS_KEY, {});
export const saveAliases = (a: Record<string, string>) => write(ALIAS_KEY, a);

/** Metrics a watch can test. Market ones read the MNEMON row (percent metrics are compared
 *  in percent, as typed: `apy > 6`); vault ones read the page's KPI numbers. */
export const MARKET_METRICS: Record<string, { get: (m: MarketHealthEntry) => number | null | undefined; unit: string }> = {
  apy: { get: (m) => (m.supply_apy != null ? m.supply_apy * 100 : null), unit: "%" },
  borrow: { get: (m) => (m.borrow_apy != null ? m.borrow_apy * 100 : null), unit: "%" },
  util: { get: (m) => (m.utilization != null ? m.utilization * 100 : null), unit: "%" },
  avail: { get: (m) => m.available_usd, unit: "$" },
  supply: { get: (m) => m.supply_usd, unit: "$" },
  hf: { get: (m) => m.borrower_risk?.min_hf, unit: "" },
};
export const VAULT_METRICS = ["tvl", "apy"] as const;

export function parseWatchArgs(args: string[]): { metric: string; op: WatchOp; value: number } | { error: string } {
  const [metric, op, valueStr] = args;
  if (!metric || !op || valueStr == null) return { error: "USAGE  watch <market|vault> <metric> <op> <value>" };
  if (!["<", ">", "<=", ">="].includes(op)) return { error: "USAGE  op is one of < > <= >=" };
  const value = Number(valueStr.replace(/[%$,]/g, ""));
  if (!Number.isFinite(value)) return { error: `INVALID_VALUE  ${valueStr}` };
  return { metric: metric.toLowerCase(), op: op as WatchOp, value };
}

const test = (op: WatchOp, v: number, target: number) => (op === "<" ? v < target : op === ">" ? v > target : op === "<=" ? v <= target : v >= target);

/** Evaluate every watch against fresh data. Returns the ones that just turned true (to
 *  announce) and the updated list (fired flags kept, so an alert rings once per crossing). */
export function evaluateWatches(
  watches: Watch[],
  ctx: { markets: MarketHealthEntry[]; vaults: Record<string, { tvl: number | null; apy: number | null }> }
): { rang: { watch: Watch; current: number }[]; next: Watch[] } {
  const rang: { watch: Watch; current: number }[] = [];
  const next = watches.map((w) => {
    let current: number | null | undefined;
    if (w.kind === "market") {
      const m = ctx.markets.find((x) => x.market_id.toLowerCase() === w.marketId?.toLowerCase() && (x.chain_id ?? 999) === (w.chainId ?? 999));
      current = m ? MARKET_METRICS[w.metric]?.get(m) : null;
    } else {
      const v = w.vault ? ctx.vaults[w.vault] : undefined;
      current = v ? (w.metric === "tvl" ? v.tvl : v.apy) : null;
    }
    if (current == null) return w;
    const hit = test(w.op, current, w.value);
    if (hit && !w.fired) rang.push({ watch: w, current });
    return hit === w.fired ? w : { ...w, fired: hit };
  });
  return { rang, next };
}

export const describeWatch = (w: Watch) => `${w.label} ${w.metric} ${w.op} ${w.value}${w.kind === "market" ? MARKET_METRICS[w.metric]?.unit ?? "" : w.metric === "apy" ? "%" : "$"}`;
