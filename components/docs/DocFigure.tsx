"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BellCurveChart } from "@/components/vault/BellCurveChart";
import { MarketSparkline } from "@/components/tools/mnemon/MarketSparkline";
import { useMarketHealth } from "@/lib/mnemon/queries";
import { useRiskMarkets } from "@/lib/risk/queries";
import { fmtPct, fmtUsd, pairLabel } from "@/lib/mnemon/format";

/**
 * Live figures for the docs pages. Each figure reuses a chart the site
 * already runs (BellCurveChart, MarketSparkline) or the data hooks the tools
 * use, so the docs show the real system, not illustrations. The caption text
 * lives in lib/docs/content.ts so the terminal's `man` renders it too.
 */

export type DocFigureKind = "bell-curve" | "broken-market" | "capacity-ratio";

function Frame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="border border-border/40">
      <div className="p-3">{children}</div>
      <figcaption className="border-t border-border/25 px-3 py-2 font-mono text-[10px] leading-relaxed text-text-dim">
        {caption}
      </figcaption>
    </figure>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-40 items-center justify-center font-mono text-xs text-text-dim/60">
      {text}
    </div>
  );
}

/* -------------------------------------------------------------------- */
/* broken-market: a live RATE_RATCHET sample from the archive            */
/* -------------------------------------------------------------------- */

function BrokenMarketFigure() {
  const { data, isLoading, isError } = useMarketHealth();
  const market = useMemo(() => {
    const broken = (data?.markets ?? []).filter((m) => m.is_broken && m.history.length > 0);
    const ratchets = broken.filter((m) => m.broken_reason === "rate_ratchet");
    // Highest APY = the most legible ratchet.
    return (
      (ratchets.length ? ratchets : broken).sort(
        (a, b) => (b.supply_apy ?? 0) - (a.supply_apy ?? 0)
      )[0] ?? null
    );
  }, [data]);

  if (isLoading) return <Empty text="LOADING_ARCHIVE…" />;
  if (isError) return <Empty text="ARCHIVE_UNREACHABLE" />;
  if (!market) return <Empty text="NO_BROKEN_MARKET_FLAGGED_RIGHT_NOW" />;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-widest">
        <span className="text-white">
          {pairLabel(market.collateral_symbol, market.loan_symbol)}
        </span>
        <span className="text-danger">{(market.broken_reason ?? "broken").toUpperCase()}</span>
        <span className="text-text-dim">
          SUPPLY {fmtUsd(market.supply_usd)} · APY {fmtPct(market.supply_apy)}
        </span>
      </div>
      <div className="h-48">
        <MarketSparkline history={market.history} />
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* capacity-ratio: ranked dot plot of the largest books, log scale       */
/* -------------------------------------------------------------------- */

const CAPACITY_TOP_N = 15;
const LOG_TICKS = [0.0001, 0.001, 0.01, 0.1, 1, 10, 100];

interface CapacityRow {
  id: string;
  pair: string; // pair + LLTV: several markets share a pair
  ratio: number;
  grouped: number | null;
  borrowUsd: number;
}

function CapacityTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: CapacityRow }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="border border-border bg-panel p-2 font-mono text-[10px]">
      <p className="mb-1 text-text-dim/70">{d.pair}</p>
      <p className="text-gold">CAPACITY_RATIO: {d.ratio.toPrecision(3)}</p>
      {d.grouped != null && (
        <p className="text-text-dim">GROUPED (STRESS): {d.grouped.toPrecision(3)}</p>
      )}
      <p className="text-text-dim">BORROW: {fmtUsd(d.borrowUsd)}</p>
    </div>
  );
}

function CapacityRatioFigure() {
  const riskQuery = useRiskMarkets();
  const healthQuery = useMarketHealth();

  const rows = useMemo<CapacityRow[]>(() => {
    const health = new Map(
      (healthQuery.data?.markets ?? []).map((m) => [m.market_id, m] as const)
    );
    const out: CapacityRow[] = [];
    for (const [id, m] of Object.entries(riskQuery.data?.markets ?? {})) {
      const cap = m.liq_capacity;
      const h = health.get(id);
      if (!cap || cap.status !== "ok" || cap.capacity_ratio == null || cap.capacity_ratio <= 0)
        continue;
      if (!h || h.supply_usd == null || h.available_usd == null) continue;
      out.push({
        id,
        pair: `${pairLabel(h.collateral_symbol, h.loan_symbol)}${h.lltv != null ? ` · ${fmtPct(h.lltv, 0)}` : ""}`,
        ratio: cap.capacity_ratio,
        grouped: cap.capacity_ratio_grouped,
        borrowUsd: Math.max(h.supply_usd - h.available_usd, 0),
      });
    }
    // The biggest books are the ones the metric is about.
    const top = out
      .sort((a, b) => b.borrowUsd - a.borrowUsd)
      .slice(0, CAPACITY_TOP_N)
      .sort((a, b) => b.ratio - a.ratio);
    // The category axis keys on the label: same pair + same LLTV markets
    // (different oracle/IRM) would collapse onto one row without a suffix.
    const seen = new Map<string, number>();
    for (const r of top) {
      const n = (seen.get(r.pair) ?? 0) + 1;
      seen.set(r.pair, n);
      if (n > 1) r.pair = `${r.pair} · ${r.id.slice(2, 6)}`;
    }
    return top;
  }, [riskQuery.data, healthQuery.data]);

  if (riskQuery.isLoading || healthQuery.isLoading) return <Empty text="LOADING_RISK_API…" />;
  if (riskQuery.isError || healthQuery.isError) return <Empty text="RISK_API_UNREACHABLE" />;
  if (rows.length === 0) return <Empty text="NO_CAPACITY_ROWS" />;

  const min = rows[rows.length - 1].ratio;
  const max = rows[0].ratio;
  const ticks = LOG_TICKS.filter((t) => t >= min / 10 && t <= max * 10);

  return (
    <ResponsiveContainer width="100%" height={rows.length * 26 + 48}>
      <ScatterChart
        margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
        accessibilityLayer={false}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} horizontal={false} />
        <XAxis
          type="number"
          dataKey="ratio"
          scale="log"
          domain={[min / 2, max * 2]}
          ticks={ticks}
          tickFormatter={(v: number) => `${v}×`}
          stroke="var(--text)"
          opacity={0.6}
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
        />
        <YAxis
          type="category"
          dataKey="pair"
          width={150}
          interval={0}
          tickLine={false}
          stroke="var(--text)"
          opacity={0.6}
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
        />
        <ReferenceLine
          x={1}
          stroke="var(--gold)"
          strokeDasharray="4 4"
          label={{
            value: "1× FULL BOOK CLEARS",
            position: "top",
            fill: "var(--gold)",
            fontSize: 9,
            fontFamily: "var(--font-body)",
          }}
        />
        <Tooltip content={<CapacityTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={rows} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.id} fill={r.ratio >= 1 ? "var(--success)" : "var(--danger)"} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------- */

export function DocFigure({ figure, caption }: { figure: DocFigureKind; caption: string }) {
  return (
    <Frame caption={caption}>
      {figure === "bell-curve" && <BellCurveChart height={260} />}
      {figure === "broken-market" && <BrokenMarketFigure />}
      {figure === "capacity-ratio" && <CapacityRatioFigure />}
    </Frame>
  );
}
