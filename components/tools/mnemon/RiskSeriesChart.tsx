"use client";

import { useMemo } from "react";
import {
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { MetricValue } from "@/lib/risk/schemas";

// One risk-API metric series for a market drill-down — same visual language
// as MarketSparkline (gold line, dim grid, mono labels). Points are daily
// before the 2026-08-20 hourly cutover and hourly after; non-ok statuses
// render as gaps, never as zeros. Values are fractions, displayed as %.

const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 4 };

function dayLabel(ts: string): string {
  return ts.slice(5, 16).replace("T", " ");
}

interface Datum {
  label: string;
  value: number | null; // percent
}

function SeriesTooltip({
  active,
  payload,
  name,
}: {
  active?: boolean;
  payload?: { payload: Datum }[];
  name: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-panel border border-border p-2 shadow-sm">
      <p className="text-[10px] font-mono text-text-dim/70 mb-1">{d.label}</p>
      <p className="text-[10px] font-mono text-gold">
        {name}: {d.value != null ? `${d.value.toFixed(2)}%` : "—"}
      </p>
    </div>
  );
}

export function RiskSeriesChart({
  points,
  name,
  trailingDays = 90,
}: {
  points: MetricValue[];
  name: string;
  trailingDays?: number;
}) {
  const data: Datum[] = useMemo(() => {
    const cutoff = Date.now() - trailingDays * 86_400_000;
    return points
      .filter((p) => new Date(p.as_of).getTime() >= cutoff)
      .map((p) => ({
        label: dayLabel(p.as_of),
        value: p.status === "ok" && p.value != null ? p.value * 100 : null,
      }));
  }, [points, trailingDays]);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-[10px] font-mono text-text-dim/50">
        NO_HISTORY
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
        <XAxis
          dataKey="label"
          stroke="var(--text)"
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
          tickLine={false}
          axisLine={false}
          minTickGap={48}
        />
        <YAxis
          width={44}
          stroke="var(--gold)"
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<SeriesTooltip name={name} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--gold)"
          strokeWidth={1.5}
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
