"use client";

import { Panel } from "@/components/ui/panel";
import { KpiCard } from "@/components/ui/kpi-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID } from "@/lib/constants/vaults";
import {
  useVaultMetadata,
  useVaultAllocations,
  useVaultApy,
  useVaultHistory,
  useVaultMarkets,
} from "@/lib/morpho/queries";
import {
  STRATEGY_CONSTANTS,
  computeMarketDecisions,
  type MarketDecision,
} from "@/lib/strategy/adaptiveCurve";
import { pickKpis, pickAllocations, formatApy, formatDateShort } from "@/lib/morpho/view";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HistoryPoint } from "@/lib/morpho/schemas";
import { DepositPanel } from "@/components/vault/DepositPanel";

function ChartContent({
  data,
  isLoading,
  isError,
}: {
  data: HistoryPoint[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) {
    return (
      <div className="h-[360px] border border-border/50 rounded-md bg-bg-base/50 flex items-center justify-center">
        <div className="text-text/50 font-mono text-sm">Loading chart…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-[360px] border border-border/50 rounded-md bg-bg-base/50 flex flex-col items-center justify-center gap-2">
        <Badge variant="danger" className="text-xs">
          History unavailable
        </Badge>
        <div className="text-text/50 font-mono text-xs">
          Unable to load chart data
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[360px] border border-border/50 rounded-md bg-bg-base/50 flex items-center justify-center">
        <div className="text-text/50 font-mono text-sm">No data available</div>
      </div>
    );
  }

  // Prepare chart data - convert APY from decimal to percentage
  const chartData = data.map((point) => ({
    t: point.t,
    date: formatDateShort(point.t),
    apy: point.apy !== null && point.apy !== undefined ? point.apy * 100 : null,
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-panel border border-border rounded-md p-2 shadow-sm">
          <p className="text-xs font-mono text-text/70 mb-1">{data.date}</p>
          <p className="text-xs font-mono text-text">
            APY: {data.apy !== null ? `${data.apy.toFixed(2)}%` : "—"}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="var(--text)"
            opacity={0.7}
            style={{ fontSize: "11px", fontFamily: "var(--font-ibm-plex-mono)" }}
          />
          <YAxis
            stroke="var(--text)"
            opacity={0.7}
            style={{ fontSize: "11px", fontFamily: "var(--font-ibm-plex-mono)" }}
            label={{ value: "APY %", angle: -90, position: "insideLeft", style: { textAnchor: "middle", fill: "var(--text)", opacity: 0.7, fontSize: "11px" } }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="apy"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--gold)" }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function DataStatus({
  metadataStatus,
  apyStatus,
  allocationsStatus,
}: {
  metadataStatus: string;
  apyStatus: string;
  allocationsStatus: string;
}) {
  if (process.env.NODE_ENV !== "development") return null;

  return (
    <div className="text-xs font-mono text-text/50 space-x-4">
      <span>metadata: {metadataStatus}</span>
      <span>apy: {apyStatus}</span>
      <span>allocations: {allocationsStatus}</span>
    </div>
  );
}

export default function Usdt0VaultPage() {
  const [selectedTimeframe, setSelectedTimeframe] = useState("7D");
  
  // Map UI timeframe to API range
  const rangeMap: Record<string, string> = {
    "1D": "1d",
    "7D": "7d",
    "30D": "30d",
    "ALL": "all",
  };
  const currentRange = rangeMap[selectedTimeframe] || "7d";

  // Fetch vault data
  const metadataQuery = useVaultMetadata(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const apyQuery = useVaultApy(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const allocationsQuery = useVaultAllocations(
    USDT0_VAULT_ADDRESS,
    USDT0_VAULT_CHAIN_ID
  );
  const historyQuery = useVaultHistory(
    USDT0_VAULT_ADDRESS,
    currentRange,
    USDT0_VAULT_CHAIN_ID
  );
  const marketsQuery = useVaultMarkets(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);

  // Extract KPIs (pass allocations for utilization calculation)
  const kpis = pickKpis(
    metadataQuery.data ?? null,
    apyQuery.data ?? null,
    allocationsQuery.data ?? null
  );
  const allocations = pickAllocations(
    (allocationsQuery.data ?? null) as Parameters<typeof pickAllocations>[0]
  );

  // Compute market decisions for strategy tab
  const marketDecisions: MarketDecision[] = marketsQuery.data?.markets
    ? computeMarketDecisions(marketsQuery.data.markets)
    : [];
  
  const eligibleMarkets = marketDecisions.filter(
    (d) => d.regimeReason === "OK" || d.regimeReason === "SAT"
  );
  const bestMarket = marketDecisions.find(
    (d) => d.scoreRawAfterRegime !== null && d.scoreRawAfterRegime > 0
  );

  // Determine loading/error states
  const isLoading =
    metadataQuery.isLoading || apyQuery.isLoading || allocationsQuery.isLoading;
  const hasError =
    metadataQuery.isError || apyQuery.isError || allocationsQuery.isError;

  return (
    <div className="min-h-screen bg-bg-base p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Page Header */}
        <Panel
          title="USDT0 Morpho Vault"
          rightSlot={<Badge variant="success">LIVE</Badge>}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm text-text/70 font-mono">
              Automated reallocation strategy
            </p>
            <DataStatus
              metadataStatus={metadataQuery.status}
              apyStatus={apyQuery.status}
              allocationsStatus={allocationsQuery.status}
            />
          </div>
          {hasError && (
            <div className="mt-2">
              <Badge variant="danger" className="text-xs">
                Morpho data unavailable
              </Badge>
            </div>
          )}
        </Panel>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            {/* Top Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard
                label="Total TVL"
                value={isLoading ? "Loading…" : kpis.tvlUsd || "—"}
                subValue="—"
                accent={kpis.tvlUsd ? "gold" : "default"}
              />
              <KpiCard
                label="Net APY"
                value={isLoading ? "Loading…" : kpis.netApyPct || "—"}
                subValue="—"
                accent={kpis.netApyPct ? "success" : "default"}
              />
              <KpiCard
                label="Utilization"
                value={isLoading ? "Loading…" : kpis.utilizationPct || "—"}
                subValue="—"
                accent="default"
              />
              <KpiCard
                label="Risk Score"
                value={isLoading ? "Loading…" : kpis.riskScore || "—"}
                subValue="—"
                accent="default"
              />
            </div>

            {/* Main Body: Chart + Deposit */}
            <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
              {/* Chart Panel (70% width) */}
              <div className="lg:col-span-7">
                <Panel title="PERFORMANCE">
                  {/* Timeframe Selectors */}
                  <div className="flex gap-2 mb-4">
                    {["1D", "7D", "30D", "ALL"].map((timeframe) => (
                      <Button
                        key={timeframe}
                        variant={
                          selectedTimeframe === timeframe ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => setSelectedTimeframe(timeframe)}
                        className="text-xs"
                      >
                        {timeframe}
                      </Button>
                    ))}
                  </div>
                  {/* Chart */}
                  <ChartContent
                    data={historyQuery.data || []}
                    isLoading={historyQuery.isLoading}
                    isError={historyQuery.isError}
                  />
                </Panel>
              </div>

              {/* Deposit Panel (30% width) */}
              <div className="lg:col-span-3">
                <Panel title="DEPOSIT">
                  <DepositPanel vaultAddress={USDT0_VAULT_ADDRESS} />
                </Panel>
              </div>
            </div>

            {/* Allocations Section */}
            <Panel title="ALLOCATIONS">
              {isLoading ? (
                <div className="text-text/50 font-mono text-sm py-4">
                  Loading…
                </div>
              ) : allocations.length === 0 ? (
                <div className="text-text/50 font-mono text-sm py-4">
                  No allocation data available
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-full">
                    {/* Table Header */}
                    <div className="grid grid-cols-3 gap-4 pb-2 border-b border-border text-xs uppercase tracking-wide text-text/70 font-mono">
                      <div>Market</div>
                      <div className="text-right">Allocation %</div>
                      <div className="text-right">APY</div>
                    </div>
                    {/* Table Rows */}
                    <div className="space-y-3 mt-3">
                      {allocations.map((row, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-3 gap-4 py-2 border-b border-border/30 last:border-0"
                        >
                          <div className="font-mono text-sm">{row.market}</div>
                          <div className="font-mono text-sm text-right">
                            {row.allocationPct !== undefined
                              ? `${row.allocationPct.toFixed(1)}%`
                              : "—"}
                          </div>
                          <div className="font-mono text-sm text-right text-success">
                            {row.apyPct !== undefined
                              ? `${row.apyPct.toFixed(2)}%`
                              : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>
          </TabsContent>

          <TabsContent value="strategy" className="mt-6 space-y-6">
            {/* Decision Summary */}
            {marketsQuery.isError && (
              <Badge variant="danger" className="text-xs">
                Strategy data unavailable
              </Badge>
            )}
            
            {!marketsQuery.isError && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
                <div className="bg-panel border border-border rounded-md p-2">
                  <div className="text-text/70 uppercase tracking-wide mb-1">Best Market</div>
                  <div className="text-text font-semibold">
                    {bestMarket?.marketLabel || "—"}
                  </div>
                </div>
                <div className="bg-panel border border-border rounded-md p-2">
                  <div className="text-text/70 uppercase tracking-wide mb-1">Eligible</div>
                  <div className="text-text font-semibold">
                    {eligibleMarkets.length} / {marketDecisions.length}
                  </div>
                </div>
                <div className="bg-panel border border-border rounded-md p-2">
                  <div className="text-text/70 uppercase tracking-wide mb-1">Temperature</div>
                  <div className="text-text font-semibold">
                    {STRATEGY_CONSTANTS.SOFTMAX_T}
                  </div>
                </div>
                <div className="bg-panel border border-border rounded-md p-2">
                  <div className="text-text/70 uppercase tracking-wide mb-1">Max per Market</div>
                  <div className="text-text font-semibold">
                    {STRATEGY_CONSTANTS.MAX_CONCENTRATION_BPS / 100}%
                  </div>
                </div>
                <div className="bg-panel border border-border rounded-md p-2">
                  <div className="text-text/70 uppercase tracking-wide mb-1">Min Active</div>
                  <div className="text-text font-semibold">
                    {STRATEGY_CONSTANTS.MIN_ACTIVE_MARKETS}
                  </div>
                </div>
              </div>
            )}

            {/* 1. Strategy Overview */}
            <Panel title="Strategy: AdaptiveCurveIRM-Aware Allocation Policy">
              <div className="space-y-4">
                <div className="text-sm text-text/80 font-mono leading-relaxed">
                  <p className="mb-3">
                    This vault uses an AdaptiveCurveIRM-Aware Allocation Policy that scores
                    markets based on APY, utilization attractiveness (bell curve), and exit
                    safety. Capital is allocated via softmax weighting with regime-based
                    adjustments for critical and saturated markets.
                  </p>
                </div>
                
                {/* Constants Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">U_CRIT</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.U_CRIT}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">U_SAT</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.U_SAT}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">U_OPT_LOW</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.U_OPT_LOW}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">U0</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.U0}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">SIGMA</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.SIGMA}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">EXIT_MIN</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.EXIT_MIN}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">EXIT_POWER</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.EXIT_POWER}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">SAT_INFLOW_MULT</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.SAT_INFLOW_MULT}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">SOFTMAX_T</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.SOFTMAX_T}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">MAX_CONCENTRATION_BPS</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.MAX_CONCENTRATION_BPS}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/30">
                    <span className="text-text/70">MIN_ACTIVE_MARKETS</span>
                    <span className="text-text">{STRATEGY_CONSTANTS.MIN_ACTIVE_MARKETS}</span>
                  </div>
                </div>
              </div>
            </Panel>

            {/* 2. Bell Curve */}
            <Panel title="Bell Curve (utilAttractiveness)">
              <pre className="text-xs font-mono text-text/80 bg-bg-base border border-border rounded-md p-4 overflow-x-auto">
{`utilAttractiveness(u) = exp(-((u-U0)/SIGMA)^2)

Utilization (u) → Attractiveness
─────────────────────────────────
0.60  ▁▂▃▅▆▇█▇▆▅▃▂▁
0.65  ▁▂▃▅▆▇█▇▆▅▃▂▁
0.70  ▁▂▃▅▆▇█▇▆▅▃▂▁
0.75  ▁▂▃▅▆▇█▇▆▅▃▂▁
0.80  ▁▂▃▅▆▇█▇▆▅▃▂▁  ← Peak (U0=0.82)
0.85  ▁▂▃▅▆▇█▇▆▅▃▂▁
0.90  ▁▂▃▅▆▇█▇▆▅▃▂▁
0.92  ▁▂▃▅▆▇█▇▆▅▃▂▁  ← Critical (U_CRIT)
0.95  ▁▂▃▅▆▇█▇▆▅▃▂▁

Bell curve centered at U0=0.82, σ=0.07
Peak attractiveness at optimal utilization`}
              </pre>
            </Panel>

            {/* 3. Scoring Breakdown */}
            <Panel title="Scoring Breakdown">
              {marketsQuery.isLoading ? (
                <div className="text-xs text-text/50 font-mono py-4">
                  Loading strategy data…
                </div>
              ) : marketDecisions.length === 0 ? (
                <div className="text-xs text-text/50 font-mono py-4">
                  No market data available
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-full">
                    {/* Table Header */}
                    <div className="grid grid-cols-10 gap-2 pb-2 border-b border-border text-xs uppercase tracking-wide text-text/70 font-mono">
                      <div>Market</div>
                      <div className="text-right">Alloc%</div>
                      <div className="text-right">u</div>
                      <div className="text-right">APY</div>
                      <div className="text-right">exitRatio</div>
                      <div className="text-right">utilAttr</div>
                      <div className="text-right">exitSafe</div>
                      <div className="text-right">regime</div>
                      <div className="text-right">scoreRaw</div>
                      <div className="text-right">weight</div>
                    </div>
                    {/* Table Rows */}
                    <div className="space-y-1 mt-2">
                      {marketDecisions.map((decision: MarketDecision, idx: number) => (
                        <div
                          key={idx}
                          className="grid grid-cols-10 gap-2 py-1 text-xs font-mono text-text/80 border-b border-border/30 last:border-0"
                        >
                          <div className="truncate">{decision.marketLabel}</div>
                          <div className="text-right">
                            {decision.currentAllocationPct !== null
                              ? `${decision.currentAllocationPct.toFixed(1)}%`
                              : "—"}
                          </div>
                          <div className="text-right">
                            {decision.u !== null ? decision.u.toFixed(3) : "—"}
                          </div>
                          <div className="text-right">
                            {decision.apy !== null
                              ? `${(decision.apy * 100).toFixed(2)}%`
                              : "—"}
                          </div>
                          <div className="text-right">
                            {decision.exitRatio !== null
                              ? decision.exitRatio.toFixed(3)
                              : "—"}
                          </div>
                          <div className="text-right">
                            {decision.utilAttr !== null
                              ? decision.utilAttr.toFixed(3)
                              : "—"}
                          </div>
                          <div className="text-right">
                            {decision.exitSafety !== null
                              ? decision.exitSafety.toFixed(3)
                              : "—"}
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={
                                decision.regimeReason === "OK"
                                  ? "success"
                                  : decision.regimeReason === "SAT"
                                  ? "gold"
                                  : "danger"
                              }
                              className="text-[10px]"
                            >
                              {decision.regimeReason}
                            </Badge>
                          </div>
                          <div className="text-right">
                            {decision.scoreRawAfterRegime !== null
                              ? decision.scoreRawAfterRegime.toFixed(6)
                              : "—"}
                          </div>
                          <div className="text-right">
                            {decision.softmaxWeight > 0
                              ? `${(decision.softmaxWeight * 100).toFixed(2)}%`
                              : "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Panel>

            {/* 4. Regime Rules */}
            <Panel title="Regime Rules">
              <div className="space-y-4">
                <div className="text-sm text-text/80 font-mono leading-relaxed">
                  <p className="mb-3">
                    Markets are gated by utilization and exit ratio thresholds. Scores
                    are adjusted based on market regime before softmax weighting.
                  </p>
                </div>

                <div className="bg-bg-base border border-border rounded-md p-4 space-y-2 text-xs font-mono">
                  <div className="flex items-start gap-2">
                    <span className="text-danger font-semibold">•</span>
                    <div>
                      <span className="text-text/70">u ≥ 0.92</span>
                      <span className="text-text/50"> → </span>
                      <span className="text-text">scoreRaw = 0</span>
                      <span className="text-text/50 ml-2">(no deposits, critical)</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-danger font-semibold">•</span>
                    <div>
                      <span className="text-text/70">exitRatio &lt; 0.05</span>
                      <span className="text-text/50"> → </span>
                      <span className="text-text">scoreRaw = 0</span>
                      <span className="text-text/50 ml-2">(no deposits, insufficient exit)</span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-gold font-semibold">•</span>
                    <div>
                      <span className="text-text/70">0.88 ≤ u &lt; 0.92</span>
                      <span className="text-text/50"> → </span>
                      <span className="text-text">scoreRaw *= 0.25</span>
                      <span className="text-text/50 ml-2">(saturated, reduced inflow)</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-text/70 font-mono">
                  <div className="uppercase tracking-wide mb-2">Rebalancing Priority</div>
                  <ul className="list-none space-y-1 text-text/60">
                    <li>1. Critical markets (u ≥ 0.92) — withdraw first</li>
                    <li>2. Low exitSafety markets — reduce exposure</li>
                    <li>3. Low scoreRaw markets — reallocate to higher scores</li>
                  </ul>
                </div>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

