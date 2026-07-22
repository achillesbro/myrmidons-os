"use client";

import { useMemo } from "react";
import {
  Bar,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { FlowPoint, HistoryPoint } from "@/lib/mnemon/schemas";
import { fmtAmount } from "@/lib/mnemon/format";

// 7d supply-APY (gold, left axis) + utilization (dim, right axis) sparkline for
// a single market's drill-down, with an optional volume strip underneath:
// hourly net supply flow as green/red bars (loan-token units) and gold markers
// at liquidation timestamps. The strip only renders when the caller passes
// synced flow history (MNEMON tool); the vault pages keep the plain chart.

// Both charts share the same category array and identical margins/axis widths,
// so the hour buckets align vertically.
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 4 };
const LEFT_AXIS_W = 44;
const RIGHT_AXIS_W = 40;

// ISO ts -> the "MM-DD HH:MM" label of its hour bucket.
function hourLabel(ts: string): string {
  return `${ts.slice(5, 13)}:00`.replace("T", " ");
}

interface Datum {
  label: string;
  apy: number | null;
  util: number | null;
  flow: number; // net supply flow in the bucket; 0 = no events
  liq: boolean; // a liquidation happened in this bucket
}

interface TooltipProps {
  active?: boolean;
  payload?: { payload: Datum }[];
  loanSymbol?: string | null;
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-panel border border-border p-2 shadow-sm">
      <p className="text-[10px] font-mono text-text-dim/70 mb-1">{d.label}</p>
      <p className="text-[10px] font-mono text-gold">
        APY: {d.apy != null ? `${d.apy.toFixed(2)}%` : "—"}
      </p>
      <p className="text-[10px] font-mono text-text-dim">
        UTIL: {d.util != null ? `${d.util.toFixed(1)}%` : "—"}
      </p>
    </div>
  );
}

function FlowTooltip({ active, payload, loanSymbol }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-panel border border-border p-2 shadow-sm">
      <p className="text-[10px] font-mono text-text-dim/70 mb-1">{d.label}</p>
      <p
        className={`text-[10px] font-mono ${
          d.flow > 0 ? "text-success" : d.flow < 0 ? "text-danger" : "text-text-dim"
        }`}
      >
        NET: {d.flow !== 0 ? fmtAmount(d.flow, loanSymbol, { signed: true }) : "0"}
      </p>
      {d.liq && <p className="text-[10px] font-mono text-gold">LIQUIDATION</p>}
    </div>
  );
}

export function MarketSparkline({
  history,
  flowHistory,
  liquidationTs,
  loanSymbol,
}: {
  history: HistoryPoint[];
  // Hourly net supply flows for this market (loan units). Pass only when the
  // flow archive is synced — stale windows would misalign with the fresh APY.
  flowHistory?: FlowPoint[] | null;
  // Liquidation event timestamps (ISO) for this market, for the gold markers.
  liquidationTs?: string[];
  loanSymbol?: string | null;
}) {
  const { data, hasFlows, maxAbsFlow } = useMemo(() => {
    const flowByLabel = new Map<string, number>();
    for (const p of flowHistory ?? []) {
      if (p.ts && p.net_supply_flow != null) {
        flowByLabel.set(hourLabel(p.ts), p.net_supply_flow);
      }
    }
    const liqLabels = new Set((liquidationTs ?? []).map(hourLabel));

    const rows: Datum[] = history
      .filter((p) => p.supply_apy != null || p.u != null)
      .map((p) => {
        const label = p.ts.slice(5, 16).replace("T", " ");
        return {
          label,
          apy: p.supply_apy != null ? p.supply_apy * 100 : null,
          util: p.u != null ? p.u * 100 : null,
          flow: flowByLabel.get(label) ?? 0,
          liq: liqLabels.has(label),
        };
      });
    const maxAbs = rows.reduce((m, r) => Math.max(m, Math.abs(r.flow)), 0);
    return {
      data: rows,
      hasFlows: rows.some((r) => r.flow !== 0 || r.liq),
      maxAbsFlow: maxAbs,
    };
  }, [history, flowHistory, liquidationTs]);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-dim/50 font-mono text-xs">
        NO_HISTORY
      </div>
    );
  }

  const mainChart = (
    /* accessibilityLayer={false} drops recharts' focusable surface, which
       otherwise draws a blue focus ring on click. */
    <LineChart data={data} margin={CHART_MARGIN} accessibilityLayer={false}>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
      <XAxis
        dataKey="label"
        stroke="var(--text)"
        opacity={0.6}
        minTickGap={48}
        interval="preserveStartEnd"
        tickMargin={6}
        hide={hasFlows} // the strip below carries the shared time axis
        style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
      />
      <YAxis
        yAxisId="apy"
        stroke="var(--gold)"
        opacity={0.7}
        width={LEFT_AXIS_W}
        tickFormatter={(v) => `${v}%`}
        style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
      />
      <YAxis
        yAxisId="util"
        orientation="right"
        stroke="var(--text)"
        opacity={0.4}
        width={RIGHT_AXIS_W}
        domain={[0, 100]}
        tickFormatter={(v) => `${v}%`}
        style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
      />
      <Tooltip content={<ChartTooltip />} />
      <Line
        yAxisId="util"
        type="linear"
        dataKey="util"
        name="Utilization"
        stroke="var(--text)"
        strokeOpacity={0.35}
        strokeWidth={1}
        dot={false}
        connectNulls
      />
      <Line
        yAxisId="apy"
        type="linear"
        dataKey="apy"
        name="Supply APY"
        stroke="var(--gold)"
        strokeWidth={2}
        dot={false}
        connectNulls
        activeDot={{ r: 3, fill: "var(--gold)" }}
        style={{
          filter:
            "drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent))",
        }}
      />
    </LineChart>
  );

  if (!hasFlows) {
    return <ResponsiveContainer width="100%" height="100%">{mainChart}</ResponsiveContainer>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-[7] min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          {mainChart}
        </ResponsiveContainer>
      </div>
      <div className="flex-[3] min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ ...CHART_MARGIN, top: 2 }}
            accessibilityLayer={false}
          >
            {/* POINT scale to match the line chart above (lines run edge-to-
                edge; the default band scale would shift buckets half a band
                right and misalign the charts). Bars get a fixed width. */}
            <XAxis
              dataKey="label"
              scale="point"
              stroke="var(--text)"
              opacity={0.6}
              minTickGap={48}
              interval="preserveStartEnd"
              tickMargin={6}
              style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
            />
            <YAxis
              width={LEFT_AXIS_W}
              domain={[-maxAbsFlow || -1, maxAbsFlow || 1]}
              tickFormatter={(v: number) => fmtAmount(v, null, { signed: true })}
              ticks={maxAbsFlow ? [-maxAbsFlow, 0, maxAbsFlow] : [0]}
              stroke="var(--text)"
              opacity={0.4}
              style={{ fontSize: "8px", fontFamily: "var(--font-body)" }}
            />
            {/* mirror gutter so the hour buckets align with the chart above */}
            <YAxis
              yAxisId="pad"
              orientation="right"
              width={RIGHT_AXIS_W}
              tick={false}
              axisLine={false}
            />
            <Tooltip content={<FlowTooltip loanSymbol={loanSymbol} />} />
            <ReferenceLine y={0} stroke="var(--border)" opacity={0.6} />
            {data.map(
              (d) =>
                d.liq && (
                  <ReferenceLine
                    key={`liq-${d.label}`}
                    x={d.label}
                    stroke="var(--gold)"
                    strokeDasharray="2 2"
                    opacity={0.8}
                  />
                )
            )}
            <Bar dataKey="flow" name="Net supply flow" barSize={3} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.label}
                  fill={d.flow >= 0 ? "var(--success)" : "var(--danger)"}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
