"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BellCurveChart } from "@/components/vault/BellCurveChart";
import { HEGEMON_V2_CONSTANTS } from "@/lib/strategy/hegemonV2";
import { MarketSparkline } from "@/components/tools/mnemon/MarketSparkline";
import { useMarketHealth } from "@/lib/mnemon/queries";
import { useRiskMarkets } from "@/lib/risk/queries";
import { fmtPct, fmtUsd, investableGateText, pairLabel } from "@/lib/mnemon/format";
import { isInvestable, isRealMarket } from "@/lib/mnemon/aggregate";

/**
 * Live figures for the docs pages. Each figure reuses a chart the site
 * already runs (BellCurveChart, MarketSparkline) or the data hooks the tools
 * use, so the docs show the real system, not illustrations. The caption text
 * lives in lib/docs/content.ts so the terminal's `man` renders it too.
 */

export type DocFigureKind =
  | "bell-curve"
  | "broken-market"
  | "capacity-ratio"
  | "lif-curve"
  | "sigma-curve"
  | "investable-gates";

/* -------------------------------------------------------------------- */
/* bell-curve: the attractiveness equation, typeset above the chart      */
/* -------------------------------------------------------------------- */

// Native MathML (no math library — every current browser renders it), with
// the numbers injected from the deployed strategy module so the equation
// cannot drift from the configuration, same rule as the CONSTANTS table.
// mathvariant="normal" keeps identifiers as plain letters: the default
// math-italic Unicode codepoints don't exist in the site's mono font, so
// they'd fall back to a serif math font mid-equation. Italic comes from CSS.
const C = HEGEMON_V2_CONSTANTS;
const ATTRACTIVENESS_MATHML = `
<math display="block">
  <mrow>
    <mi mathvariant="normal">bell</mi><mo>(</mo><mi mathvariant="normal">u</mi><mo>)</mo><mo>=</mo>
    <msup>
      <mi mathvariant="normal">e</mi>
      <mrow>
        <mo>−</mo>
        <msup>
          <mrow>
            <mo>(</mo>
            <mfrac>
              <mrow><mi mathvariant="normal">u</mi><mo>−</mo><mn>${C.U0}</mn></mrow>
              <mn>${C.SIGMA}</mn>
            </mfrac>
            <mo>)</mo>
          </mrow>
          <mn>2</mn>
        </msup>
      </mrow>
    </msup>
  </mrow>
</math>
<math display="block">
  <mrow>
    <mi mathvariant="normal">a</mi><mo>(</mo><mi mathvariant="normal">u</mi><mo>)</mo><mo>=</mo>
    <mrow>
      <mtable class="cases" columnalign="left left" columnspacing="2.5em" rowspacing="0.4em">
        <mtr>
          <mtd><mrow><mi mathvariant="normal">bell</mi><mo>(</mo><mi mathvariant="normal">u</mi><mo>)</mo></mrow></mtd>
          <mtd><mrow><mi mathvariant="normal">u</mi><mo>&lt;</mo><mn>${C.U_SAT}</mn></mrow></mtd>
        </mtr>
        <mtr>
          <mtd><mrow><mn>${C.SAT_INFLOW_MULT}</mn><mo>·</mo><mi mathvariant="normal">bell</mi><mo>(</mo><mi mathvariant="normal">u</mi><mo>)</mo></mrow></mtd>
          <mtd><mrow><mn>${C.U_SAT}</mn><mo>≤</mo><mi mathvariant="normal">u</mi><mo>&lt;</mo><mn>${C.U_CRIT}</mn></mrow></mtd>
        </mtr>
        <mtr>
          <mtd><mn>0</mn></mtd>
          <mtd><mrow><mi mathvariant="normal">u</mi><mo>≥</mo><mn>${C.U_CRIT}</mn></mrow></mtd>
        </mtr>
      </mtable>
    </mrow>
  </mrow>
</math>`;

function Frame({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <figure className="border border-border/40">
      {/* select-none + no outline: dragging over an axis label used to
          select the SVG text and paint a focus ring around the chart. */}
      <div className="p-3 select-none [&_svg]:outline-none [&_svg:focus]:outline-none [&_.recharts-wrapper]:outline-none">
        {children}
      </div>
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
    <ResponsiveContainer width="100%" height={rows.length * 26 + 64}>
      <ScatterChart
        /* top margin reserves room for the reference-line label — at 8px it
           was clipped by the svg edge. */
        margin={{ top: 24, right: 16, bottom: 18, left: 8 }}
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
          label={{ value: "CAPACITY_RATIO (LOG SCALE)", position: "insideBottom", offset: -12, ...AXIS_LABEL }}
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
          label={{ value: "MARKET · LLTV", angle: -90, position: "insideLeft", offset: 8, ...AXIS_LABEL }}
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
/* lif-curve: liquidation bonus and drop-to-insolvency against LLTV      */
/* -------------------------------------------------------------------- */

// Morpho Blue's liquidation incentive factor. Pure math, no data: the curve
// is the reason the liquidatable gate's slippage cap moves with LLTV.
function lif(lltv: number): number {
  return Math.min(1.15, 1 / (0.3 * lltv + 0.7));
}

// LLTVs the Morpho DAO has enabled for market creation. They are the ticks
// and are injected into the sampled rows so the pointer can land on them
// (a 0.5% grid alone never hits 91.5% or 96.5%).
const DAO_LLTVS = [0.385, 0.625, 0.77, 0.86, 0.915, 0.945, 0.965, 0.98];
const LIF_ROWS = [...new Set([...Array.from({ length: 97 }, (_, i) => +(0.5 + i * 0.005).toFixed(3)), ...DAO_LLTVS])]
  .filter((lltv) => lltv >= 0.5 && lltv <= 0.98)
  .sort((a, b) => a - b)
  .map((lltv) => {
    const f = lif(lltv);
    return { lltv, bonus: f - 1, drop: 1 - lltv * f, dao: DAO_LLTVS.includes(lltv) };
  });
const AXIS_LABEL = { fill: "var(--text)", fontSize: 9, fontFamily: "var(--font-body)", opacity: 0.7 };

function LifTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { lltv: number; bonus: number; drop: number } }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="border border-border bg-panel p-2 font-mono text-[10px]">
      <p className="mb-1 text-text-dim/70">LLTV {fmtPct(d.lltv, 1)}</p>
      <p className="text-gold">LIQUIDATION BONUS: {fmtPct(d.bonus, 1)}</p>
      <p className="text-danger">DROP TO INSOLVENCY: {fmtPct(d.drop, 1)}</p>
    </div>
  );
}

function LifCurveFigure() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={LIF_ROWS} margin={{ top: 12, right: 16, bottom: 18, left: 8 }} accessibilityLayer={false}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
        {DAO_LLTVS.filter((v) => v >= 0.5).map((v) => (
          <ReferenceLine key={v} x={v} stroke="var(--border)" strokeDasharray="2 4" />
        ))}
        <XAxis
          dataKey="lltv"
          type="number"
          domain={[0.5, 0.98]}
          ticks={DAO_LLTVS.filter((v) => v >= 0.5)}
          tickFormatter={(v: number) => fmtPct(v, 1)}
          stroke="var(--text)"
          opacity={0.6}
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
          label={{ value: "LLTV (DAO-ALLOWED VALUES TICKED)", position: "insideBottom", offset: -12, ...AXIS_LABEL }}
        />
        <YAxis
          tickFormatter={(v: number) => fmtPct(v, 0)}
          stroke="var(--text)"
          opacity={0.6}
          width={44}
          style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
          label={{ value: "% OF PRICE", angle: -90, position: "insideLeft", offset: 12, ...AXIS_LABEL }}
        />
        <Tooltip content={<LifTooltip />} cursor={{ strokeDasharray: "3 3" }} />
        <Line type="monotone" dataKey="drop" stroke="var(--danger)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
        <Line type="monotone" dataKey="bonus" stroke="var(--gold)" dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* -------------------------------------------------------------------- */
/* sigma-curve: what "three sigma" means on the deepest investable market */
/* -------------------------------------------------------------------- */

const SIGMA_POINTS = 181;

function normalPdf(x: number, sigma: number): number {
  return Math.exp(-0.5 * (x / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI));
}

interface SigmaPoint {
  x: number; // daily return, fraction
  pdf: number;
  tail: number | null; // pdf where x <= -3σ, else null (the shaded area)
}

function SigmaTooltip({ active, payload }: { active?: boolean; payload?: { payload: SigmaPoint }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="border border-border bg-panel p-2 font-mono text-[10px]">
      <p className="text-text-dim/70">DAILY RETURN {fmtPct(d.x, 1)}</p>
    </div>
  );
}

function SigmaCurveFigure() {
  const { data, isLoading, isError } = useMarketHealth();
  const pick = useMemo(() => {
    // Deepest investable market whose collateral has a 30d vol and whose
    // gate inputs carry the cutoff: a real σ, a real cutoff, one chart.
    return (
      (data?.markets ?? [])
        .filter(
          (m) =>
            isRealMarket(m) &&
            isInvestable(m) &&
            m.collateral_vol_30d != null &&
            m.collateral_vol_30d > 0 &&
            m.investable_inputs?.at_risk_cutoff != null
        )
        .sort((a, b) => (b.supply_usd ?? 0) - (a.supply_usd ?? 0))[0] ?? null
    );
  }, [data]);

  if (isLoading) return <Empty text="LOADING_ARCHIVE…" />;
  if (isError) return <Empty text="ARCHIVE_UNREACHABLE" />;
  if (!pick) return <Empty text="NO_MARKET_WITH_VOL_AND_CUTOFF" />;

  const sigma = pick.collateral_vol_30d! / Math.sqrt(365);
  const cutoff = pick.investable_inputs!.at_risk_cutoff!;
  const threeSigma = 3 * sigma;
  const half = Math.max(4.5 * sigma, cutoff * 1.15);
  const points: SigmaPoint[] = Array.from({ length: SIGMA_POINTS }, (_, i) => {
    const x = -half + (2 * half * i) / (SIGMA_POINTS - 1);
    const pdf = normalPdf(x, sigma);
    return { x, pdf, tail: x <= -threeSigma ? pdf : null };
  });
  const worstDropDrives = cutoff > threeSigma * 1.001;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        <span className="text-white">{pairLabel(pick.collateral_symbol, pick.loan_symbol)}</span>
        <span>σ daily {fmtPct(sigma, 2)}</span>
        <span>3σ {fmtPct(threeSigma, 1)}</span>
        <span className="text-gold">
          cutoff {fmtPct(cutoff, 1)}
          {worstDropDrives ? " = worst observed 1-day drop" : " = 3σ"}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={points} margin={{ top: 18, right: 16, bottom: 18, left: 8 }} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={[-half, half]}
            ticks={[-cutoff, -threeSigma, -2 * sigma, -sigma, 0, sigma, 2 * sigma, threeSigma].filter(
              (v, i, a) => Math.abs(v) <= half && a.findIndex((w) => Math.abs(w - v) < sigma * 0.3) === i
            )}
            tickFormatter={(v: number) => fmtPct(v, 1)}
            stroke="var(--text)"
            opacity={0.6}
            style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
            label={{ value: "DAILY RETURN OF THE COLLATERAL", position: "insideBottom", offset: -12, ...AXIS_LABEL }}
          />
          <YAxis
            hide
            domain={[0, "dataMax"]}
            label={{ value: "DENSITY", angle: -90, position: "insideLeft", offset: 12, ...AXIS_LABEL }}
          />
          <Tooltip content={<SigmaTooltip />} cursor={{ strokeDasharray: "3 3" }} />
          {[1, 2, 3].map((k) => (
            <ReferenceLine
              key={k}
              x={-k * sigma}
              stroke="var(--text)"
              strokeOpacity={0.35}
              strokeDasharray="2 4"
              label={{ value: `−${k}σ`, position: "top", fill: "var(--text)", fontSize: 9, fontFamily: "var(--font-body)", opacity: 0.7 }}
            />
          ))}
          <ReferenceLine
            x={-cutoff}
            stroke="var(--gold)"
            strokeDasharray="4 4"
            label={{ value: "CUTOFF", position: "top", fill: "var(--gold)", fontSize: 9, fontFamily: "var(--font-body)" }}
          />
          <Area type="monotone" dataKey="pdf" stroke="var(--text)" strokeOpacity={0.7} fill="none" isAnimationActive={false} />
          <Area type="monotone" dataKey="tail" stroke="none" fill="var(--danger)" fillOpacity={0.35} isAnimationActive={false} connectNulls={false} />
        </AreaChart>
      </ResponsiveContainer>
    </>
  );
}

/* -------------------------------------------------------------------- */
/* investable-gates: which gates fail right now, live from the archive   */
/* -------------------------------------------------------------------- */

interface GateRow {
  code: string;
  label: string;
  n: number;
  pass: boolean;
}

function GateTooltip({ active, payload }: { active?: boolean; payload?: { payload: GateRow }[] }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="max-w-xs border border-border bg-panel p-2 font-mono text-[10px]">
      <p className={d.pass ? "text-success" : "text-gold"}>
        {d.label}: {d.n}
      </p>
      {!d.pass && <p className="mt-1 text-text-dim">{investableGateText(d.code)}</p>}
    </div>
  );
}

function InvestableGatesFigure() {
  const { data, isLoading, isError } = useMarketHealth();
  const { rows, real, broken } = useMemo(() => {
    const real = (data?.markets ?? []).filter(isRealMarket);
    const broken = real.filter((m) => m.is_broken).length;
    const counts = new Map<string, number>();
    let investable = 0;
    for (const m of real) {
      if (isInvestable(m)) {
        investable += 1;
        continue;
      }
      // Broken markets fail on the classifier alone; the other gates are
      // not what keeps them out, so count only the non-broken reasons.
      if (m.is_broken) continue;
      for (const r of m.investable_reasons ?? []) counts.set(r, (counts.get(r) ?? 0) + 1);
    }
    const rows: GateRow[] = [{ code: "investable", label: "INVESTABLE", n: investable, pass: true }];
    for (const [code, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push({ code, label: code.toUpperCase(), n, pass: false });
    }
    return { rows, real: real.length, broken };
  }, [data]);

  if (isLoading) return <Empty text="LOADING_ARCHIVE…" />;
  if (isError) return <Empty text="ARCHIVE_UNREACHABLE" />;
  if (rows.length <= 1 && rows[0]?.n === 0) return <Empty text="NO_GATE_DATA_IN_SNAPSHOT" />;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-widest text-text-dim">
        <span className="text-white">{real} lending markets tracked</span>
        <span>{broken} broken</span>
        <span className="text-success">{rows[0].n} investable</span>
        <span>failed gates counted per non-broken market, one market can fail several</span>
      </div>
      <ResponsiveContainer width="100%" height={rows.length * 24 + 40}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 32, bottom: 18, left: 8 }} accessibilityLayer={false}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} horizontal={false} />
          <XAxis
            type="number"
            stroke="var(--text)"
            opacity={0.6}
            style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
            label={{ value: "MARKETS", position: "insideBottom", offset: -12, ...AXIS_LABEL }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={170}
            interval={0}
            tickLine={false}
            stroke="var(--text)"
            opacity={0.6}
            style={{ fontSize: "9px", fontFamily: "var(--font-body)" }}
            label={{ value: "VERDICT / FAILED GATE", angle: -90, position: "insideLeft", offset: 8, ...AXIS_LABEL }}
          />
          <Tooltip content={<GateTooltip />} cursor={{ fill: "var(--border)", opacity: 0.2 }} />
          <Bar dataKey="n" isAnimationActive={false} label={{ position: "right", fill: "var(--text)", fontSize: 9, fontFamily: "var(--font-body)" }}>
            {rows.map((r) => (
              <Cell key={r.code} fill={r.pass ? "var(--success)" : "var(--gold)"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

/* -------------------------------------------------------------------- */

export function DocFigure({ figure, caption }: { figure: DocFigureKind; caption: string }) {
  if (figure === "bell-curve") {
    return (
      <>
        {/* The equation sits in the prose flow, outside the chart frame.
            font-mono keeps it in the site's face (with mathvariant="normal"
            above, no glyph falls back to a serif math font); mi gets italic
            from CSS for the math look. The cases table wears a hairline left
            border instead of a stretchy brace — brace glyph assembly needs
            an OpenType math font many visitors don't have. */}
        <div
          /* [&_math]:font-mono is a real selector, not inheritance — the UA
             stylesheet sets `math { font-family: math }`, which inheritance
             alone cannot override. */
          className="space-y-2 py-1 text-[14px] text-text/85 [&_math]:font-mono [&_mi]:italic [&_.cases]:border-l [&_.cases]:border-text-dim/50 [&_.cases]:pl-3"
          dangerouslySetInnerHTML={{ __html: ATTRACTIVENESS_MATHML }}
        />
        <Frame caption={caption}>
          <BellCurveChart height={260} />
        </Frame>
      </>
    );
  }
  return (
    <Frame caption={caption}>
      {figure === "broken-market" && <BrokenMarketFigure />}
      {figure === "capacity-ratio" && <CapacityRatioFigure />}
      {figure === "lif-curve" && <LifCurveFigure />}
      {figure === "sigma-curve" && <SigmaCurveFigure />}
      {figure === "investable-gates" && <InvestableGatesFigure />}
    </Frame>
  );
}
