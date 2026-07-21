"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { TerminalScrollLoader } from "@/components/ui/terminal-scroll-loader";
import type { MarketHealthEntry, UtilSpell } from "@/lib/mnemon/schemas";
import { fmtPct, fmtRatio, fmtPrice, fmtDurationMin } from "@/lib/mnemon/format";
import { isInvestable } from "@/lib/mnemon/aggregate";
import { MarketSparkline } from "./MarketSparkline";

// The MNEMON per-market drill-down: 7d APY/util sparkline, 30d utilization
// spells, and Borrower Risk / Utilization / Collateral / Market panels. Shared
// by the /tools/mnemon table and the vault-page allocation tables (each mounts
// it fresh on expand, so the glitch-reveal fires each time).

type Tone = "danger" | "gold" | "success" | "default";

const TONE_CLASS: Record<Tone, string> = {
  danger: "text-danger",
  gold: "text-gold",
  success: "text-success",
  default: "text-text",
};

function Metric({
  label,
  value,
  tone = "default",
  title,
  loading = false,
  glitchMode = "text",
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  title?: string;
  loading?: boolean;
  glitchMode?: "text" | "number" | "auto";
}) {
  const content =
    typeof value === "string" || typeof value === "number" ? (
      <GlitchTypeText loading={loading} value={value} mode={glitchMode} />
    ) : (
      value
    );
  return (
    <div className="flex justify-between gap-3 text-[10px] font-mono" title={title}>
      <span className="text-text-dim">{label}</span>
      <span className={TONE_CLASS[tone]}>{content}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="p-3 bg-bg-base space-y-1.5">
      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono border-b border-border/20 pb-1">
        {title}
      </div>
      {children}
    </div>
  );
}

// Health-factor colour: <1.05 is one bad candle from liquidation, <1.2 is thin.
function hfTone(hf: number | null | undefined): Tone {
  if (hf == null) return "default";
  if (hf < 1.05) return "danger";
  if (hf < 1.2) return "gold";
  return "success";
}

function SpellRow({ spell, loading = false }: { spell: UtilSpell; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-border/20 last:border-0">
      <span className="text-[10px] font-mono text-text-dim">
        <GlitchTypeText loading={loading} value={`u ≥ ${(spell.threshold * 100).toFixed(0)}%`} mode="text" />
      </span>
      <span className="text-[10px] font-mono text-text">
        <GlitchTypeText loading={loading} value={fmtDurationMin(spell.duration_min)} mode="text" />
      </span>
      <span className="text-[10px] font-mono text-text-dim/70">
        <GlitchTypeText
          loading={loading}
          value={`peak ${spell.peak_u != null ? `${(spell.peak_u * 100).toFixed(1)}%` : "—"}`}
          mode="text"
        />
      </span>
      {spell.open ? (
        <span
          title="Ongoing — the market is still at this utilization as of the latest sample"
          className="text-[9px] font-mono uppercase tracking-wider text-gold border border-gold/50 px-1"
        >
          <GlitchTypeText loading={loading} value="OPEN" mode="text" />
        </span>
      ) : (
        <span
          title="Ended — utilization has since dropped back below the threshold"
          className="text-[9px] font-mono uppercase tracking-wider text-text-dim/50"
        >
          <GlitchTypeText loading={loading} value="CLOSED" mode="text" />
        </span>
      )}
    </div>
  );
}

function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) — no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied!" : "Click to copy full market ID"}
      className="font-mono text-text-dim/70 hover:text-gold transition-colors cursor-pointer"
    >
      {copied ? "COPIED ✓" : `${id.slice(0, 10)}…${id.slice(-6)} ⧉`}
    </button>
  );
}

export function MnemonMarketDrilldown({
  market,
  spells,
  bestInvestableApy,
}: {
  market: MarketHealthEntry;
  spells: UtilSpell[];
  bestInvestableApy: number | null;
}) {
  const marketSpells = spells
    .filter((s) => s.market_id === market.market_id)
    .sort((a, b) => (a.open === b.open ? b.threshold - a.threshold : a.open ? -1 : 1));

  const br = market.borrower_risk;
  const reg = market.utilization_regime;

  // "vs best" is measured against the best *investable* market (non-broken,
  // deep liquidity) — not the raw APY leader, which is usually a broken/dust
  // market with an absurd rate. Non-investable markets show "—" (no benchmark).
  const investable = isInvestable(market);
  const isLeader =
    investable &&
    bestInvestableApy != null &&
    market.supply_apy != null &&
    market.supply_apy >= bestInvestableApy - 1e-9;
  const vsBest = !investable
    ? "—"
    : isLeader
      ? "BEST"
      : bestInvestableApy != null && market.supply_apy != null
        ? `−${fmtPct(bestInvestableApy - market.supply_apy)}`
        : "—";

  // One-shot reveal on mount: metric values glitch in, chart shows the
  // terminal-scroll loader briefly first.
  const [revealed, setRevealed] = useState(false);
  const [chartReady, setChartReady] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setRevealed(true), 450);
    const t2 = setTimeout(() => setChartReady(true), 700);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="p-4 bg-panel/40 border-t border-border space-y-4">
      {/* Chart + spells */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 min-h-[12rem] h-48">
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-2">
            SUPPLY_APY / UTILIZATION // 7D
          </div>
          <div className="h-[calc(100%-1.25rem)]">
            {chartReady ? (
              <MarketSparkline history={market.history} />
            ) : (
              <TerminalScrollLoader
                variant="chart"
                className="h-full w-full border-0"
                seed={`mnemon-chart-${market.market_id}`}
              />
            )}
          </div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono mb-1">
            UTILIZATION_SPELLS // 30D
          </div>
          <div className="text-[10px] font-mono text-text-dim/60 leading-snug mb-2">
            Stretches this market sat at or above near-full utilization — when
            liquidity is thin and lenders may not be able to withdraw.{" "}
            <span className="text-gold">OPEN</span> = ongoing now,{" "}
            <span className="text-text-dim">CLOSED</span> = ended.
          </div>
          {marketSpells.length > 0 ? (
            <div className="space-y-0.5">
              {marketSpells.slice(0, 6).map((s, i) => (
                <SpellRow key={`${s.threshold}-${s.start_ts}-${i}`} spell={s} loading={!revealed} />
              ))}
            </div>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">
              NO_SPELLS (never held u ≥ 92% in the last 30d)
            </div>
          )}
        </div>
      </div>

      {/* Metric panels */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border">
        <Panel title="Borrower Risk">
          {br ? (
            <>
              <Metric label="BORROWERS" value={br.borrowers} loading={!revealed} glitchMode="number" />
              <Metric
                label="MIN_HEALTH"
                value={fmtRatio(br.min_hf)}
                tone={hfTone(br.min_hf)}
                title="Lowest borrower health factor — below 1.00 is liquidatable"
                loading={!revealed}
              />
              <Metric
                label="NEAR_LIQ"
                value={
                  br.borrowers_hf_lt_105 != null
                    ? `${br.borrowers_hf_lt_105} · ${fmtPct(br.pct_debt_hf_lt_105, 0)}`
                    : "—"
                }
                tone={(br.pct_debt_hf_lt_105 ?? 0) > 0.1 ? "danger" : "default"}
                title="Borrowers within 5% of liquidation (HF < 1.05) · their share of debt"
                loading={!revealed}
              />
              <Metric
                label="TOP3_CONC"
                value={fmtPct(br.top3_debt_pct, 0)}
                tone={(br.top3_debt_pct ?? 0) > 0.6 ? "gold" : "default"}
                title="Share of debt held by the 3 largest borrowers"
                loading={!revealed}
              />
            </>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">NO_BORROWERS</div>
          )}
        </Panel>

        <Panel title="Utilization">
          {reg ? (
            <>
              <Metric label="AVG_7D" value={fmtPct(reg.avg_util_7d, 1)} loading={!revealed} />
              <Metric label="AVG_30D" value={fmtPct(reg.avg_util_30d, 1)} loading={!revealed} />
              <Metric
                label="TIME>95% 30D"
                value={fmtPct(reg.pct_time_gt95_30d, 1)}
                tone={(reg.pct_time_gt95_30d ?? 0) > 0.2 ? "gold" : "default"}
                title="Share of the last 30 days spent above 95% utilization"
                loading={!revealed}
              />
              <Metric
                label="TIME>99% 30D"
                value={fmtPct(reg.pct_time_gt99_30d, 1)}
                tone={(reg.pct_time_gt99_30d ?? 0) > 0.1 ? "danger" : "default"}
                title="Share of the last 30 days spent above 99% utilization (near-frozen)"
                loading={!revealed}
              />
            </>
          ) : (
            <div className="text-[10px] font-mono text-text-dim/50">—</div>
          )}
        </Panel>

        <Panel title="Collateral">
          <Metric
            label="ORACLE"
            value={
              market.oracle_price != null
                ? `${fmtPrice(market.oracle_price)} ${market.loan_symbol ?? ""}`.trim()
                : "—"
            }
            title={`Price of 1 ${market.collateral_symbol ?? "collateral"} in ${market.loan_symbol ?? "loan"} terms`}
            loading={!revealed}
          />
          <Metric
            label="VOL_7D"
            value={fmtPct(market.collateral_vol_7d, 0)}
            title="Annualized 7-day price volatility of the collateral"
            loading={!revealed}
          />
          <Metric label="VOL_30D" value={fmtPct(market.collateral_vol_30d, 0)} loading={!revealed} />
        </Panel>

        <Panel title="Market">
          <Metric label="BORROW_APY" value={fmtPct(market.borrow_apy)} loading={!revealed} />
          <Metric label="LLTV" value={fmtPct(market.lltv, 0)} loading={!revealed} />
          <Metric
            label="VS_BEST"
            value={vsBest}
            tone={isLeader ? "success" : "default"}
            title="APY vs the best investable market (non-broken, ≥ $10k liquidity). '—' = this market isn't investable, so the comparison is meaningless."
            loading={!revealed}
          />
          <Metric label="MARKET_ID" value={<CopyableId id={market.market_id} />} />
        </Panel>
      </div>
    </div>
  );
}
