"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
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
import { TransactionTerminal, type TransactionLog } from "@/components/vault/TransactionTerminal";
import { AppShell } from "@/components/chrome/AppShell";
import { AppHeader } from "@/components/chrome/AppHeader";
import { AppSidebar } from "@/components/chrome/AppSidebar";
import { AppSubnav } from "@/components/chrome/AppSubnav";
import { GridPanel } from "@/components/ui/grid-panel";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GridTable } from "@/components/ui/grid-table";
import { cn } from "@/lib/utils";
import { useAccount } from "wagmi";

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
      <div className="h-full border border-border/50 bg-bg-base/50 flex items-center justify-center">
        <div className="text-text-dim/50 font-mono text-sm">Loading chart…</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-full border border-border/50 bg-bg-base/50 flex flex-col items-center justify-center gap-2">
        <Badge variant="danger" className="text-xs">
          History unavailable
        </Badge>
        <div className="text-text-dim/50 font-mono text-xs">
          Unable to load chart data
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-full border border-border/50 bg-bg-base/50 flex items-center justify-center">
        <div className="text-text-dim/50 font-mono text-sm">No data available</div>
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
        <div className="bg-panel border border-border p-2 shadow-sm">
          <p className="text-xs font-mono text-text-dim/70 mb-1">{data.date}</p>
          <p className="text-xs font-mono text-text">
            APY: {data.apy !== null ? `${data.apy.toFixed(2)}%` : "—"}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div 
      className="h-full w-full outline-none select-none"
      tabIndex={-1}
      onMouseDown={(e) => e.preventDefault()}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
          <defs>
            <filter id="glow-gold-line">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
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
            type="linear"
            dataKey="apy"
            stroke="var(--gold)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "var(--gold)" }}
            connectNulls={false}
            style={{
              filter: "drop-shadow(0 0 6px color-mix(in oklab, var(--gold) 55%, transparent)) drop-shadow(0 0 14px color-mix(in oklab, var(--gold) 30%, transparent))"
            }}
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
    <div className="text-xs font-mono text-text-dim/50 space-x-4">
      <span>metadata: {metadataStatus}</span>
      <span>apy: {apyStatus}</span>
      <span>allocations: {allocationsStatus}</span>
    </div>
  );
}

export default function Usdt0VaultPage() {
  const [selectedTimeframe, setSelectedTimeframe] = useState("7D");
  const [activeTab, setActiveTab] = useState("overview");
  const [mounted, setMounted] = useState(false);
  const [transactionLogs, setTransactionLogs] = useState<TransactionLog[]>([]);
  const { address } = useAccount();
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
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

  // Get markets data for liquidity and utilization
  const marketsData = marketsQuery.data?.markets || [];
  
  // Create a map of market label to market data for quick lookup
  const marketMap = new Map(
    marketsData.map((m) => [m.marketLabel, m])
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

  const addressDisplay = mounted && address ? `[ ${address.slice(0, 4)}...${address.slice(-4)} ]` : "[ NOT CONNECTED ]";

  // Compute 24h variations from history data
  const historyData = historyQuery.data || [];
  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  
  // Find closest historical points
  const currentTvl = metadataQuery.data?.vaultByAddress?.state?.totalAssetsUsd 
    ? parseFloat(String(metadataQuery.data.vaultByAddress.state.totalAssetsUsd))
    : null;
  const currentApy = kpis.netApyPct 
    ? parseFloat(kpis.netApyPct.replace('%', ''))
    : null;
  
  // Find historical values from 24h ago
  let historicalTvl: number | null = null;
  let historicalApy: number | null = null;
  
  // Find the closest point to 24h ago
  let closestPoint: { t: number; tvlUsd?: number | null; apy?: number | null } | null = null;
  let minDiff = Infinity;
  
  for (const point of historyData) {
    const diff = Math.abs(point.t - twentyFourHoursAgo);
    if (diff < minDiff) {
      minDiff = diff;
      closestPoint = point;
    }
  }
  
  if (closestPoint) {
    historicalTvl = closestPoint.tvlUsd !== null && closestPoint.tvlUsd !== undefined 
      ? closestPoint.tvlUsd 
      : null;
    historicalApy = closestPoint.apy !== null && closestPoint.apy !== undefined 
      ? closestPoint.apy * 100 // Convert to percentage
      : null;
  }
  
  // Calculate variations
  const tvlVariation = currentTvl !== null && historicalTvl !== null && historicalTvl > 0
    ? ((currentTvl - historicalTvl) / historicalTvl) * 100
    : null;
  const apyVariation = currentApy !== null && historicalApy !== null && historicalApy > 0
    ? ((currentApy - historicalApy) / historicalApy) * 100 // Relative percentage change
    : null;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg-base">
      <AppShell
        sidebar={<AppSidebar />}
        >
        <AppSubnav
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "strategy", label: "Strategy" },
          ]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
            />
        <div className="flex-1 overflow-y-auto p-0 scroll-smooth">
          {activeTab === "overview" && (
            <div className="grid grid-cols-4 border-l border-t border-border bg-bg-base min-h-full">
              {/* KPI Row */}
              <GridKpi
                label="Total TVL"
                value={isLoading ? "Loading…" : kpis.tvlUsd || "—"}
                subValue={
                  <>
                    {tvlVariation !== null ? (
                      <span className={tvlVariation >= 0 ? "text-success flex items-center gap-1 glow-green" : "text-danger flex items-center gap-1 glow-red"}>
                        {tvlVariation >= 0 ? "▲" : "▼"} {Math.abs(tvlVariation).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-text-dim flex items-center gap-1">—</span>
                    )}
                    <span className="text-text-dim font-mono">24H</span>
                  </>
                }
                accent={kpis.tvlUsd ? "default" : "default"}
                cornerIndicator="default"
              />
              <GridKpi
                label="Net APY"
                value={isLoading ? "Loading…" : kpis.netApyPct || "—"}
                subValue={
                  <>
                    {apyVariation !== null ? (
                      <span className={apyVariation >= 0 ? "text-success flex items-center gap-1" : "text-danger flex items-center gap-1"}>
                        {apyVariation >= 0 ? "▲" : "▼"} {Math.abs(apyVariation).toFixed(2)}%
                      </span>
                    ) : (
                      <span className="text-text-dim flex items-center gap-1">—</span>
                    )}
                    <span className="text-text-dim font-mono">24H</span>
                  </>
                }
                accent={kpis.netApyPct ? "gold" : "default"}
                cornerIndicator="gold"
              />
              <GridKpi
                label="Utilisation"
                value={isLoading ? "Loading…" : kpis.utilizationPct || "—"}
                subValue={
                  <>
                    <span className="text-text-dim flex items-center gap-1">AVERAGE</span>
                    <span className="text-text-dim font-mono">ACROSS MARKETS</span>
                  </>
                }
                accent="default"
                cornerIndicator="default"
              />
              <GridKpi
                label="Risk Factor"
                value={isLoading ? "Loading…" : kpis.riskScore || "LOW"}
                subValue={
                  <>
                    <span className="text-border flex items-center gap-1">SCORE: 1.2/10</span>
                    <span className="text-text-dim font-mono">AUDITED</span>
                  </>
                }
                accent="default"
                cornerIndicator="default"
              />

              {/* Chart Panel (3 cols) */}
              <GridPanel
                className="col-span-3 border-r border-b border-border h-[430px] flex flex-col"
                title="Performance // NAV"
                headerRight={
                  <div className="flex gap-2">
                    {["1D", "7D", "30D", "ALL"].map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setSelectedTimeframe(tf)}
                        className={cn(
                          "w-8 h-6 flex items-center justify-center text-[9px] font-bold border transition-all",
                          selectedTimeframe === tf
                            ? "border-gold bg-gold/10 text-gold glow-gold glow-border-gold"
                            : "border-border/30 text-text-dim hover:text-white hover:bg-border hover:border-border"
                        )}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="relative h-[360px] w-full p-2 bg-panel/10">
                  <ChartContent
                    data={historyQuery.data || []}
                    isLoading={historyQuery.isLoading}
                    isError={historyQuery.isError}
                  />
                </div>
                <div className="px-2 py-px border-t border-border/30 bg-bg-base flex justify-between text-[10px] leading-3 tracking-wide text-white/70 uppercase font-mono">
                  <span>
                    Last Update: {historyQuery.data && historyQuery.data.length > 0
                      ? (() => {
                          const latestPoint = historyQuery.data[historyQuery.data.length - 1];
                          const date = new Date(latestPoint.t);
                          return date.toLocaleTimeString('en-US', { 
                            hour12: false, 
                            hour: '2-digit', 
                            minute: '2-digit', 
                            second: '2-digit' 
                          });
                        })()
                      : "—"}
                  </span>
                  <span>SRC: ONCHAIN</span>
                </div>
              </GridPanel>

              {/* Current Position Panel (1 col) */}
              <GridPanel
                className="col-span-1 border-r border-b border-border h-[430px] flex flex-col"
                title={
                  <>
                    <span className="icon-slot w-[14px] h-[14px] border border-gold mr-2 glow-gold-icon" />
                    Current Position
                  </>
                }
              >
                <div className="flex-1 min-h-0 overflow-auto">
                  <div className="p-4 border-b border-border bg-bg-base">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-[9px] text-text-dim font-bold uppercase tracking-wider mb-1">
                          Vault Shares
                        </div>
                        <div className="text-lg text-white font-mono">1,677.3766</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-dim font-bold uppercase tracking-wider mb-1">
                          USD Value
                            </div>
                        <div className="text-lg text-white font-mono">$1,733.92</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <DepositPanel 
                      vaultAddress={USDT0_VAULT_ADDRESS}
                      onTransactionLogsChange={setTransactionLogs}
                    />
                  </div>
                </div>
              </GridPanel>

              {/* Allocation Snapshot (3 cols, below Current Position) */}
              <GridPanel
                className="col-span-3 border-r border-b border-border"
                title={
                  <>
                    <span className="icon-slot w-[14px] h-[14px] border border-text mr-2" />
                    Allocation Snapshot
                  </>
                }
                headerRight={
                  <div className="text-[9px] text-text-dim font-mono tracking-wider">
                    TOTAL WEIGHT: 100%
                  </div>
                }
              >
                {isLoading ? (
                  <div className="p-4 text-text-dim/50 font-mono text-sm">
                    Loading…
                  </div>
                ) : allocations.length === 0 ? (
                  <div className="p-4 text-text-dim/50 font-mono text-sm">
                    No allocation data available
                  </div>
                ) : (
                  <GridTable
                    columns={[
                      { header: "Market", align: "left" },
                      { header: "Weight", align: "right" },
                      { header: "APY", align: "right" },
                      { header: "Liquidity", align: "right" },
                      { header: "Status", align: "center" },
                    ]}
                    rows={allocations.map((row, idx) => {
                      const marketData = marketMap.get(row.market);
                      const utilization = marketData?.u ?? null;
                      const liquidity = marketData?.availableLiquidity ?? null;
                      
                      // Determine status based on utilization (from strategy constants)
                      let statusLabel = "STABLE";
                      let statusColor = "text-text-dim border-border";
                      if (utilization !== null) {
                        if (utilization >= 0.92) {
                          statusLabel = "CRITICAL";
                          statusColor = "text-danger border-danger";
                        } else if (utilization >= 0.88) {
                          statusLabel = "SATURATED";
                          statusColor = "text-gold border-gold";
                        } else if (utilization >= 0.75 && utilization < 0.88) {
                          statusLabel = "OPTIMAL";
                          statusColor = "text-success border-success";
                        }
                      }
                      
                      // Format liquidity - API returns liquidity with 6 decimals (micro-units), convert to USDT0
                      let liquidityDisplay = "—";
                      if (liquidity !== null && liquidity > 0) {
                        // API returns values with 6 decimals, divide by 1e6 to get actual USDT0
                        const liquidityInUsdt0 = liquidity / 1e6;
                        // Format with commas and 2 decimal places
                        const formatted = new Intl.NumberFormat('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(liquidityInUsdt0);
                        liquidityDisplay = `${formatted} USD₮0`;
                      }
                      
                      const isIdleMarket = row.market === "USD₮0";
                      
                      return {
                        cells: [
                          <span key="market" className={isIdleMarket ? "font-bold text-gold" : "font-bold"}>
                            {row.market}
                          </span>,
                          <span key="weight">{row.allocationPct !== undefined ? `${row.allocationPct.toFixed(1)}%` : "—"}</span>,
                          <span key="apy" className="text-success">
                            {row.apyPct !== undefined ? `${row.apyPct.toFixed(2)}%` : "—"}
                          </span>,
                          <span key="liquidity" className="text-text-dim">{liquidityDisplay}</span>,
                          <span key="status">
                            <span className={cn(
                              "text-[9px] border px-1",
                              statusColor,
                              statusColor.includes("border-gold") && "glow-border-gold glow-gold",
                              statusColor.includes("border-success") && "glow-border-green glow-green",
                              statusColor.includes("border-danger") && "glow-border-red glow-red"
                            )}>
                              {statusLabel}
                            </span>
                          </span>,
                        ],
                        highlight: isIdleMarket,
                      };
                    })}
                  />
                )}
              </GridPanel>

              {/* Transaction Terminal (1 col, right side) */}
              <GridPanel
                className="col-span-1 border-r border-b border-border"
                title="Transaction Logs"
              >
                <TransactionTerminal logs={transactionLogs} />
              </GridPanel>

              {/* Execution History (4 cols) */}
              <GridPanel
                className="col-span-4 border-r border-b border-border"
                title={
                  <>
                    <span className="icon-slot w-[14px] h-[14px] border border-text mr-2" />
                    Execution History
                  </>
                }
                headerRight={
                  <button className="flex items-center gap-1 text-[9px] font-bold uppercase text-border border border-border px-2 py-1 hover:bg-border hover:text-white transition-all">
                    Export_CSV <span className="icon-slot w-[10px] h-[10px] border border-border" />
                  </button>
                }
              >
                <GridTable
                  columns={[
                    { header: "Timestamp", align: "left" },
                    { header: "Action", align: "left" },
                    { header: "Result", align: "left" },
                    { header: "Tx Hash", align: "left" },
                  ]}
                  rows={[
                    {
                      cells: [
                        <span key="timestamp" className="text-text-dim">PLACEHOLDER</span>,
                        <span key="action" className="text-white font-bold">PLACEHOLDER</span>,
                        <span key="result" className="text-text-dim">PLACEHOLDER</span>,
                        <span key="hash" className="font-mono text-[10px] text-text-dim">PLACEHOLDER</span>,
                      ],
                    },
                  ]}
                />
              </GridPanel>
              </div>
            )}

          {activeTab === "strategy" && (
            <div className="grid grid-cols-4 border-l border-t border-border bg-bg-base min-h-full">
              {/* Formulas Panel (3 cols) */}
              <GridPanel
                className="col-span-3 border-r border-b border-border"
                title={
                  <>
                    <span className="icon-slot w-[14px] h-[14px] border border-text mr-2" />
                    Formulas // Core_Logic
                  </>
                }
                headerRight={
                  <div className="text-[9px] text-text-dim font-mono tracking-wider">
                    READ_ONLY
                  </div>
                }
                footer={
                  <>
                    <span>Hash: 0x8f...2a1</span>
                    <span>Last Compiled: 14m ago</span>
                  </>
                }
              >
                <div className="flex-1 p-6 font-mono text-xs md:text-sm leading-loose text-text-dim bg-bg-base relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-10 font-mono text-[6rem] leading-none text-border select-none pointer-events-none">
                    ∫
                  </div>
                  <div className="relative z-10">
                    <p><span className="text-border">// Calculate target exposure based on volatility index</span></p>
                    <p className="mt-2">
                      <span className="text-gold">const</span> <span className="text-white">target_exposure</span> = (<span className="text-white">volatility_idx</span>) =&gt; {"{"}
                    </p>
                    <p className="pl-6">
                      <span className="text-gold">let</span> <span className="text-white">base_factor</span> = <span className="text-success">0.85</span>;
                    </p>
                    <p className="pl-6">
                      <span className="text-gold">if</span> (volatility_idx &gt; <span className="text-danger">THRESHOLD_HIGH</span>) {"{"}
                    </p>
                    <p className="pl-12">
                      base_factor = <span className="text-success">0.50</span>; <span className="text-border">// Reduce risk exposure</span>
                    </p>
                    <p className="pl-6">
                      {"}"} <span className="text-gold">else if</span> (volatility_idx &lt; <span className="text-success">THRESHOLD_LOW</span>) {"{"}
                    </p>
                    <p className="pl-12">
                      base_factor = <span className="text-success">0.95</span>; <span className="text-border">// Maximize capital efficiency</span>
                    </p>
                    <p className="pl-6">
                      {"}"}
                    </p>
                    <p className="pl-6">
                      <span className="text-gold">return</span> Math.min(base_factor * <span className="text-white">pool_depth</span>, <span className="text-white">MAX_CAP</span>);
                    </p>
                    <p>{"};"}</p>
                    <p className="mt-6"><span className="text-border">// Delta Neutral Rebalancing Trigger</span></p>
                    <p>
                      <span className="text-white">delta_check</span> = abs(<span className="text-gold">long_pos</span> - <span className="text-gold">short_pos</span>) / <span className="text-white">total_collateral</span>;
                    </p>
                    <p>
                      <span className="text-gold">should_rebalance</span> = delta_check &gt; <span className="text-danger">0.025</span> ? <span className="text-success">TRUE</span> : <span className="text-danger">FALSE</span>;
                    </p>
                  </div>
                </div>
              </GridPanel>

              {/* Variables Panel (1 col) */}
              <GridPanel
                className="col-span-1 border-r border-b border-border"
                title={
                  <>
                    <span className="icon-slot w-[14px] h-[14px] border border-text mr-2" />
                    Variables
                  </>
                }
              >
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-border/20 text-[10px] font-mono">
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Max Leverage</td>
                        <td className="p-3 text-right text-gold font-bold">4.50x</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Target LTV</td>
                        <td className="p-3 text-right text-white">75.0%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Liq. Buffer</td>
                        <td className="p-3 text-right text-success">5.0%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Slippage Tol.</td>
                        <td className="p-3 text-right text-white">0.5%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Rebal Thresh.</td>
                        <td className="p-3 text-right text-white">2.5%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Harvest Int.</td>
                        <td className="p-3 text-right text-white">4 Hrs</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Flashloan Provider</td>
                        <td className="p-3 text-right text-gold">AAVE</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">Emergency Halt</td>
                        <td className="p-3 text-right text-danger font-bold">OFF</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div className="p-3 border-t border-border bg-bg-base">
                  <button className="w-full border border-border hover:bg-border text-text-dim hover:text-white text-[10px] py-2 font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
                    <span className="icon-slot w-[14px] h-[14px] border border-text-dim" />
                    Edit Params
                  </button>
                </div>
              </GridPanel>

              {/* Strategy Distribution Panel (4 cols) */}
              <GridPanel
                className="col-span-4 border-r border-b border-border min-h-[350px]"
                title={
                  <>
                    <span className="icon-slot w-[14px] h-[14px] border border-text mr-2" />
                    Strategy // Distribution
                  </>
                }
                headerRight={
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-text-dim">
                      <span className="w-2 h-2 rounded-full bg-gold" />
                      Expected
                    </div>
                    <div className="flex items-center gap-1 text-[9px] uppercase font-bold text-text-dim">
                      <span className="w-2 h-2 rounded-full bg-border" />
                      Realized
                    </div>
                  </div>
                }
              >
                <div className="flex-1 relative p-6 flex flex-col justify-center">
                  <div className="absolute inset-0 bg-[linear-gradient(rgba(69,127,196,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(69,127,196,0.05)_1px,transparent_1px)] bg-[size:40px_40px]" />
                  <div className="w-full h-64 relative">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 1000 300">
                      <line stroke="#457fc4" strokeOpacity="0.3" strokeWidth="1" x1="0" x2="1000" y1="250" y2="250" />
                      <line stroke="#457fc4" strokeDasharray="4 4" strokeOpacity="0.3" strokeWidth="1" x1="500" x2="500" y1="0" y2="300" />
                      <path d="M0,250 C200,250 300,250 400,150 C450,100 480,20 500,20 C520,20 550,100 600,150 C700,250 800,250 1000,250" fill="none" stroke="#a98629" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      <path d="M100,250 C250,250 350,240 420,180 C460,140 490,80 520,80 C550,80 580,140 620,180 C690,240 790,250 900,250" fill="none" opacity="0.6" stroke="#457fc4" strokeDasharray="4 2" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                      <circle cx="500" cy="20" fill="#0a1b34" r="4" stroke="#a98629" strokeWidth="2" />
                      <text fill="#a98629" fontFamily="monospace" fontSize="10" x="510" y="20">MEAN RETURN</text>
                    </svg>
                    <div className="absolute bottom-[-20px] left-0 w-full flex justify-between text-[9px] font-mono text-text-dim uppercase">
                      <span>-15% ROI</span>
                      <span>-5%</span>
                      <span>0%</span>
                      <span>+5%</span>
                      <span>+15% ROI</span>
                    </div>
                  </div>
                  <div className="mt-8 border-l-2 border-gold pl-4 max-w-2xl">
                    <h4 className="text-white text-xs font-bold uppercase mb-1">Statistical Analysis</h4>
                    <p className="text-text-dim text-[10px] leading-relaxed max-w-prose">
                      The strategy exhibits a leptokurtic distribution, indicating a higher probability of results clustered around the mean (14.2% APY) with occasional tail events managed by the liquidation buffer. The positive skew reflects the asymmetric upside from yield farming incentives versus capped downside risk via stop-loss triggers.
                    </p>
                  </div>
                </div>
              </GridPanel>
                </div>
          )}
              </div>
      </AppShell>
    </div>
  );
}
