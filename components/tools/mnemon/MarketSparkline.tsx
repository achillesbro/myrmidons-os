"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HistoryPoint } from "@/lib/mnemon/schemas";

// 7d supply-APY (gold, left axis) + utilization (dim, right axis) sparkline for
// a single market's drill-down. Mirrors the vault-page chart conventions.

interface TooltipProps {
  active?: boolean;
  payload?: { payload: { label: string; apy: number | null; util: number | null } }[];
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

export function MarketSparkline({ history }: { history: HistoryPoint[] }) {
  const data = history
    .filter((p) => p.supply_apy != null || p.u != null)
    .map((p) => ({
      // "MM-DD HH:MM" from the ISO string, no Date parsing needed.
      label: p.ts.slice(5, 16).replace("T", " "),
      apy: p.supply_apy != null ? p.supply_apy * 100 : null,
      util: p.u != null ? p.u * 100 : null,
    }));

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-text-dim/50 font-mono text-xs">
        NO_HISTORY
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
        <XAxis
          dataKey="label"
          stroke="var(--text)"
          opacity={0.6}
          minTickGap={48}
          interval="preserveStartEnd"
          tickMargin={6}
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
        />
        <YAxis
          yAxisId="apy"
          stroke="var(--gold)"
          opacity={0.7}
          width={44}
          tickFormatter={(v) => `${v}%`}
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
        />
        <YAxis
          yAxisId="util"
          orientation="right"
          stroke="var(--text)"
          opacity={0.4}
          width={40}
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
    </ResponsiveContainer>
  );
}
