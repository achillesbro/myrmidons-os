"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";

export interface ChartPoint { t: number; v: number }

/**
 * A line chart drawn into the terminal log (`nav`): the vault page's recharts, dressed as a
 * terminal plot — gold line, square joins, dotted grid, Plex ticks, no tooltip, no animation
 * (anything animating inside the CRT filter re-runs it every frame).
 */
export function TerminalChart({ series, fmt }: { series: ChartPoint[]; fmt: (v: number) => string }) {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const ticks = series.length > 2 ? [series[0].t, series[Math.floor(series.length / 2)].t, series[series.length - 1].t] : series.map((p) => p.t);
  const tick = { fill: "var(--text-dim)", fontSize: 9, fontFamily: "var(--font-body), monospace" };
  return (
    <div className="h-36 w-full max-w-3xl py-1 pl-4 pr-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeOpacity={0.35} strokeDasharray="1 4" />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} ticks={ticks} tickFormatter={day} tick={tick} axisLine={{ stroke: "var(--border)", strokeOpacity: 0.6 }} tickLine={false} />
          <YAxis width={64} tickCount={4} domain={["auto", "auto"]} tickFormatter={fmt} tick={tick} axisLine={{ stroke: "var(--border)", strokeOpacity: 0.6 }} tickLine={false} />
          <Line type="linear" dataKey="v" stroke="var(--gold)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
