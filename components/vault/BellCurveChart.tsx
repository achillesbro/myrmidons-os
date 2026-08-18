"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { HEGEMON_V2_CONSTANTS, effectiveUtilAttractivenessV2 } from "@/lib/strategy/hegemonV2";

/**
 * HEGEMON_V2 effective utilization-attractiveness curve, extracted from
 * VaultV2Page so the landing can show the same chart. Plots what the scorer
 * actually applies: the bell centered on U0, cut to 40% (SAT_INFLOW_MULT) at
 * U_SAT and to zero at U_CRIT — explicit pre/post points at both thresholds
 * keep the cliffs vertical; x-range is symmetric around U0.
 */

const BELL_HALF_WIDTH = Math.min(0.18, 1 - HEGEMON_V2_CONSTANTS.U0, HEGEMON_V2_CONSTANTS.U0);

const BELL_CURVE_DATA = (() => {
  const points: Array<{ utilization: number; attractiveness: number }> = [];
  const step = 0.0025; // 0.25% steps
  const minUtil = HEGEMON_V2_CONSTANTS.U0 - BELL_HALF_WIDTH;
  const maxUtil = HEGEMON_V2_CONSTANTS.U0 + BELL_HALF_WIDTH;
  const EPS = 1e-6;
  const us: number[] = [];
  for (let u = minUtil; u <= maxUtil + EPS; u += step) us.push(u);
  for (const t of [HEGEMON_V2_CONSTANTS.U_SAT, HEGEMON_V2_CONSTANTS.U_CRIT]) {
    if (t > minUtil && t < maxUtil) us.push(t - EPS, t);
  }
  us.sort((a, b) => a - b);
  for (const u of us) {
    points.push({
      utilization: u * 100, // Convert to percentage for display
      attractiveness: effectiveUtilAttractivenessV2(u),
    });
  }
  return points;
})();

export const BELL_CURVE_X_MIN = (HEGEMON_V2_CONSTANTS.U0 - BELL_HALF_WIDTH) * 100;
export const BELL_CURVE_X_MAX = (HEGEMON_V2_CONSTANTS.U0 + BELL_HALF_WIDTH) * 100;
const X_DOMAIN: [number, number] = [BELL_CURVE_X_MIN, BELL_CURVE_X_MAX];

interface BellCurveChartProps {
  /** Weighted vault utilization (fraction). Omit/null to hide the marker. */
  weightedUtilization?: number | null;
  height?: number;
}

export function BellCurveChart({ weightedUtilization = null, height = 400 }: BellCurveChartProps) {
  return (
    <div className="w-full" style={{ height: `${height}px` }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={BELL_CURVE_DATA} margin={{ top: 50, right: 20, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="utilization"
            type="number"
            domain={X_DOMAIN}
            stroke="var(--text)"
            opacity={0.7}
            tick={{
              fill: "var(--text)",
              fontSize: 10,
              fontFamily: "var(--font-body)",
              opacity: 0.7
            }}
            tickFormatter={(value) => Math.round(value).toString()}
            label={{
              value: "Utilization %",
              position: "insideBottom",
              offset: -5,
              fill: "var(--text)",
              fontSize: 10,
              fontFamily: "var(--font-body)",
              opacity: 0.7
            }}
          />
          <YAxis
            domain={[0, 1]}
            stroke="var(--text)"
            opacity={0.7}
            tick={{
              fill: "var(--text)",
              fontSize: 10,
              fontFamily: "var(--font-body)",
              opacity: 0.7
            }}
            label={{
              value: "Attractiveness",
              angle: -90,
              position: "insideLeft",
              fill: "var(--text)",
              fontSize: 10,
              fontFamily: "var(--font-body)",
              opacity: 0.7
            }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0a1b34",
              border: "1px solid #457fc4",
              borderRadius: "4px",
              color: "#ffffff",
              fontFamily: "monospace",
              fontSize: "10px",
            }}
            formatter={(value: number | undefined) => value !== undefined ? [value.toFixed(4), "Attractiveness"] : ["—", "Attractiveness"]}
            labelFormatter={(label) => `Utilization: ${Number(label).toFixed(1)}%`}
          />
          {/* Reference lines for key thresholds */}
          <ReferenceLine
            x={HEGEMON_V2_CONSTANTS.U0 * 100}
            stroke="#a98629"
            strokeDasharray="2 2"
            strokeOpacity={0.5}
            label={{ value: "U0", position: "top", fill: "#a98629", fontSize: 9 }}
          />
          <ReferenceLine
            x={HEGEMON_V2_CONSTANTS.U_SAT * 100}
            stroke="#a98629"
            strokeDasharray="2 2"
            strokeOpacity={0.3}
            label={{ value: "U_SAT", position: "top", fill: "#a98629", fontSize: 9 }}
          />
          <ReferenceLine
            x={HEGEMON_V2_CONSTANTS.U_CRIT * 100}
            stroke="#dc2626"
            strokeDasharray="2 2"
            strokeOpacity={0.5}
            label={{ value: "U_CRIT", position: "top", fill: "#dc2626", fontSize: 9 }}
          />
          {/* Current vault utilization; when below left limit, show at limit with "Current<64%" */}
          {weightedUtilization !== null && (() => {
            const currentPct = weightedUtilization * 100;
            const belowMin = currentPct < BELL_CURVE_X_MIN;
            return (
              <ReferenceLine
                x={belowMin ? BELL_CURVE_X_MIN : currentPct}
                stroke="#a98629"
                strokeWidth={2}
                label={{
                  value: belowMin ? `Current<${Math.round(BELL_CURVE_X_MIN)}%` : `Current: ${currentPct.toFixed(1)}%`,
                  position: "top",
                  fill: "#a98629",
                  fontSize: 10,
                  fontWeight: "bold",
                }}
              />
            );
          })()}
          <Line
            type="linear"
            dataKey="attractiveness"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--gold)" }}
            style={{
              filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--gold) 30%, transparent))"
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
