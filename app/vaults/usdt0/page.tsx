"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
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
  utilAttractiveness,
  type MarketDecision,
} from "@/lib/strategy/adaptiveCurve";
import { pickKpis, pickAllocations, formatApy, formatDateShort, formatDateShortWithTime } from "@/lib/morpho/view";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { HistoryPoint } from "@/lib/morpho/schemas";
import { DepositPanel } from "@/components/vault/DepositPanel";
import { TransactionTerminal, type TransactionLog } from "@/components/vault/TransactionTerminal";
import { ReallocatorTerminal } from "@/components/vault/ReallocatorTerminal";
import { AppShell } from "@/components/chrome/AppShell";
import { AppHeader } from "@/components/chrome/AppHeader";
import { AppSidebar } from "@/components/chrome/AppSidebar";
import { AppSubnav } from "@/components/chrome/AppSubnav";
import { GridPanel } from "@/components/ui/grid-panel";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GridTable } from "@/components/ui/grid-table";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { TerminalScrollLoader } from "@/components/ui/terminal-scroll-loader";
import { cn } from "@/lib/utils";
import { useAccount, usePublicClient, useChainId } from "wagmi";
import { Wallet, PieChart, Code2, Sliders, TrendingUp, Landmark } from "lucide-react";
import { readVaultDecimals } from "@/lib/web3/vault";
import { formatAmount } from "@/lib/web3/format";
import { formatUsd } from "@/lib/morpho/view";
import { ERC20_ABI } from "@/lib/web3/abis/erc20";
import { LastReallocKpiCard } from "@/lib/logs/last-realloc-context";

function ChartContent({
  data,
  isLoading,
  isError,
  timeframe,
}: {
  data: HistoryPoint[];
  isLoading: boolean;
  isError: boolean;
  timeframe: string;
}) {
  if (isLoading) {
    // Inline values use GlitchTypeText; heavy components use TerminalScrollLoader to avoid jank
    return (
      <TerminalScrollLoader
        variant="chart"
        className="h-full w-full border-0"
        seed="chart-history"
      />
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

  // Prepare chart data - convert APY from decimal to percentage; 1D/7D show hh:mm for precision
  const fmt = timeframe === "1D" || timeframe === "7D" ? formatDateShortWithTime : formatDateShort;
  const chartData = data.map((point) => ({
    t: point.t,
    date: fmt(point.t),
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
            style={{ fontSize: "11px", fontFamily: "var(--font-body)" }}
          />
          <YAxis
            stroke="var(--text)"
            opacity={0.7}
            style={{ fontSize: "11px", fontFamily: "var(--font-body)" }}
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

function Usdt0VaultPageContent() {
  const [selectedTimeframe, setSelectedTimeframe] = useState("7D");
  const [activeTab, setActiveTab] = useState("overview");
  const [mounted, setMounted] = useState(false);
  const [transactionLogs, setTransactionLogs] = useState<TransactionLog[]>([]);
  const [userVaultShares, setUserVaultShares] = useState<bigint | null>(null);
  const [vaultDecimals, setVaultDecimals] = useState<number | null>(null);
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const chainId = useChainId();
  const searchParams = useSearchParams();
  const initialDeposit = searchParams.get("deposit");
  const initialWithdraw = searchParams.get("withdraw");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle hash-based tab navigation
  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const hash = window.location.hash.slice(1);
    if (hash === "strategy") {
      setActiveTab("strategy");
    }
    
    const handleHashChange = () => {
      const newHash = window.location.hash.slice(1);
      if (newHash === "strategy") {
        setActiveTab("strategy");
      } else if (newHash === "" || newHash === "overview") {
        setActiveTab("overview");
      }
    };
    
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Handle tab change and update hash
  const handleTabChange = (tabValue: string) => {
    setActiveTab(tabValue);
    if (typeof window !== "undefined") {
      if (tabValue === "strategy") {
        window.location.hash = "#strategy";
      } else {
        window.location.hash = "";
      }
    }
  };
  
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

  // Fetch user vault share balance
  useEffect(() => {
    if (!publicClient || !address || chainId !== USDT0_VAULT_CHAIN_ID) {
      setUserVaultShares(null);
      setVaultDecimals(null);
      return;
    }

    let cancelled = false;
    const client = publicClient; // Store in const for type narrowing
    const userAddress = address; // Store in const for type narrowing

    async function fetchUserBalance() {
      try {
        // Fetch vault decimals and user balance in parallel
        const [decimals, balance] = await Promise.all([
          readVaultDecimals(USDT0_VAULT_ADDRESS, client),
          client.readContract({
            address: USDT0_VAULT_ADDRESS,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [userAddress],
          }),
        ]);

        if (!cancelled) {
          setVaultDecimals(decimals);
          setUserVaultShares(balance as bigint);
        }
      } catch (error) {
        console.error("Failed to fetch user vault balance:", error);
        if (!cancelled) {
          setUserVaultShares(null);
          setVaultDecimals(null);
        }
      }
    }

    fetchUserBalance();

    return () => {
      cancelled = true;
    };
  }, [publicClient, address, chainId]);

  // Extract KPIs (pass allocations for utilization calculation)
  const kpis = pickKpis(
    metadataQuery.data ?? null,
    apyQuery.data ?? null,
    allocationsQuery.data ?? null
  );
  const allocations = pickAllocations(
    (allocationsQuery.data ?? null) as Parameters<typeof pickAllocations>[0]
  );
  const activeMarketCount = allocations.filter((a) => a.market !== "USD₮0").length;

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

  // Canonical utilization: allocation-weighted average (markets API, u normalized 0–1). Used for KPI and Strategy chart; fallback to simple average when no allocation weights.
  const weightedUtilization = (() => {
    if (marketDecisions.length === 0) return null;
    let totalWeight = 0;
    let weightedSum = 0;
    const utils: number[] = [];
    marketDecisions.forEach((decision) => {
      if (decision.u !== null) utils.push(decision.u);
      if (decision.u !== null && decision.currentAllocationPct !== null) {
        const weight = decision.currentAllocationPct / 100;
        weightedSum += decision.u * weight;
        totalWeight += weight;
      }
    });
    if (totalWeight > 0) return weightedSum / totalWeight;
    if (utils.length > 0) return utils.reduce((a, b) => a + b, 0) / utils.length;
    return null;
  })();

  // Generate bell curve data points, centered on U0
  const bellCurveData = (() => {
    const points: Array<{ utilization: number; attractiveness: number }> = [];
    const step = 0.01; // 1% steps
    const minUtil = Math.max(0, STRATEGY_CONSTANTS.U0 - 0.18);
    const maxUtil = Math.min(1, STRATEGY_CONSTANTS.U0 + 0.18);
    for (let u = minUtil; u <= maxUtil; u += step) {
      points.push({
        utilization: u * 100, // Convert to percentage for display
        attractiveness: utilAttractiveness(u),
      });
    }
    return points;
  })();

  // X domain for bell curve (fixed; current utilization below left limit is shown at the limit with "Current<64%")
  const bellCurveXMin = (STRATEGY_CONSTANTS.U0 - 0.18) * 100;
  const bellCurveXMax = Math.min(100, (STRATEGY_CONSTANTS.U0 + 0.18) * 100);
  const bellCurveXDomain: [number, number] = [bellCurveXMin, bellCurveXMax];

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
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base">
      <AppShell
        sidebar={<AppSidebar terminal={<ReallocatorTerminal />} />}
        >
        <AppSubnav
          tabs={[
            { value: "overview", label: "Overview" },
            { value: "strategy", label: "Strategy" },
          ]}
          activeTab={activeTab}
          onTabChange={handleTabChange}
            />
        <div className="flex-1 overflow-y-auto p-0 scroll-smooth">
          {activeTab === "overview" && (
            <div className="grid grid-cols-4 border-l border-t border-border bg-bg-base min-h-full">
              {/* KPI Row */}
              <GridKpi
                label="Total TVL"
                value={<GlitchTypeText loading={isLoading} value={kpis.tvlUsd || "—"} mode="auto" />}
                subValue={
                  <>
                    {tvlVariation !== null ? (
                      <span className={tvlVariation >= 0 ? "text-success flex items-center gap-1 glow-green" : "text-danger flex items-center gap-1 glow-red"}>
                        {tvlVariation >= 0 ? "▲" : "▼"} <GlitchTypeText loading={false} value={`${Math.abs(tvlVariation).toFixed(2)}%`} mode="number" />
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
                value={<GlitchTypeText loading={isLoading} value={kpis.netApyPct || "—"} mode="auto" />}
                subValue={
                  <>
                    {apyVariation !== null ? (
                      <span className={apyVariation >= 0 ? "text-success flex items-center gap-1" : "text-danger flex items-center gap-1"}>
                        {apyVariation >= 0 ? "▲" : "▼"} <GlitchTypeText loading={false} value={`${Math.abs(apyVariation).toFixed(2)}%`} mode="number" />
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
                value={
                  <GlitchTypeText
                    loading={isLoading}
                    value={
                      weightedUtilization !== null
                        ? `${(weightedUtilization * 100).toFixed(2)}%`
                        : (kpis.utilizationPct || "—")
                    }
                    mode="auto"
                  />
                }
                subValue={
                  <>
                    <span className="text-text-dim flex items-center gap-1 font-mono">
                      {weightedUtilization !== null ? "WEIGHTED BY ALLOCATION ACROSS " : "AVERAGE ACROSS "}
                      <span className="text-gold">{activeMarketCount}</span>
                      {" MARKETS"}
                    </span>
                  </>
                }
                accent="default"
                cornerIndicator="default"
              />
              <LastReallocKpiCard />

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
                    timeframe={selectedTimeframe}
                  />
                </div>
                <div className="px-2 py-px border-t border-border/30 bg-bg-base flex justify-between text-[10px] leading-3 tracking-wide text-white/70 uppercase font-mono">
                  <span>
                    Last Update:{" "}
                    <GlitchTypeText
                      loading={historyQuery.isLoading}
                      value={
                        historyQuery.data && historyQuery.data.length > 0
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
                          : "—"
                      }
                      mode="text"
                    />
                  </span>
                  <span>SRC: ONCHAIN</span>
                </div>
              </GridPanel>

              {/* Current Position Panel (1 col) */}
              <GridPanel
                className="col-span-1 border-r border-b border-border h-[430px] flex flex-col"
                title={
                  <>
                    <Wallet className="w-[14px] h-[14px] mr-2 text-gold glow-gold-icon" strokeWidth={2} />
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
                        <div className="text-lg text-white font-mono">
                          <GlitchTypeText
                            loading={userVaultShares === null || vaultDecimals === null}
                            value={
                              userVaultShares !== null && vaultDecimals !== null
                                ? formatAmount(userVaultShares, vaultDecimals, 4)
                                : "—"
                            }
                            mode="number"
                          />
                        </div>
                      </div>
                      <div>
                        <div className="text-[9px] text-text-dim font-bold uppercase tracking-wider mb-1">
                          USD Value
                        </div>
                        <div className="text-lg text-white font-mono">
                          <GlitchTypeText
                            loading={
                              userVaultShares === null ||
                              vaultDecimals === null ||
                              (!metadataQuery.data?.vaultByAddress?.state?.sharePriceUsd &&
                                !apyQuery.data?.vaultByAddress?.state?.sharePriceUsd)
                            }
                            value={(() => {
                              if (userVaultShares === null || vaultDecimals === null) return "—";
                              
                              // Try sharePriceUsd from metadata or apy query
                              const sharePriceUsd = 
                                metadataQuery.data?.vaultByAddress?.state?.sharePriceUsd ||
                                apyQuery.data?.vaultByAddress?.state?.sharePriceUsd;
                              if (!sharePriceUsd) return "—";
                              
                              const sharePriceNum = typeof sharePriceUsd === "string" ? parseFloat(sharePriceUsd) : sharePriceUsd;
                              const sharesNum = parseFloat(formatAmount(userVaultShares, vaultDecimals, 18));
                              const usdValue = sharesNum * sharePriceNum;
                              
                              return formatUsd(usdValue);
                            })()}
                            mode="auto"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <DepositPanel 
                      vaultAddress={USDT0_VAULT_ADDRESS}
                      onTransactionLogsChange={setTransactionLogs}
                      initialAmount={initialDeposit ?? initialWithdraw ?? undefined}
                      initialMode={initialDeposit != null ? "deposit" : initialWithdraw != null ? "withdraw" : undefined}
                    />
                  </div>
                </div>
              </GridPanel>

              {/* Allocation Snapshot (3 cols, below Current Position) */}
              <GridPanel
                className="col-span-3 border-r border-b border-border"
                title={
                  <>
                    <PieChart className="w-[14px] h-[14px] mr-2 text-text" strokeWidth={2} />
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
                  // Inline values use GlitchTypeText; heavy components use TerminalScrollLoader to avoid jank
                  <TerminalScrollLoader
                    variant="table"
                    className="h-[220px] w-full border-0"
                    seed="allocations-table"
                  />
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
              </div>
            )}

          {activeTab === "strategy" && (
            <div className="grid grid-cols-4 border-l border-t border-border bg-bg-base min-h-full">
              {/* Formulas Panel (3 cols) */}
              <GridPanel
                className="col-span-3 border-r border-b border-border"
                title={
                  <>
                    <Code2 className="w-[14px] h-[14px] mr-2 text-text" strokeWidth={2} />
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
                    <p className="mb-2"><span className="text-border">{"//"} HEGEMON Allocation Policy (overview)</span></p>
                    <p className="mb-1"><span className="text-border">{"//"} Goal: place capital where [1] yield is good, [2] utilization is in a healthy zone, [3] exits look safe.</span></p>
                    <p className="mb-4"><span className="text-border">{"//"} Then compute target weights and decide if a rebalance is worth doing.</span></p>
                    <p className="mb-2"><span className="text-gold">[1] MARKET SCORE</span> <span className="text-border">(per market)</span></p>
                    <p className="pl-6 mb-1"><span className="text-white">utilScore</span> = bellCurve(<span className="text-white">u</span>; center=<span className="text-white">U0</span>, width=<span className="text-white">SIGMA</span>) <span className="text-border">{"//"} prefers u near U0</span></p>
                    <p className="pl-6 mb-1"><span className="text-white">exitScore</span> = clamp01(<span className="text-white">exitRatio</span>) ^ <span className="text-white">EXIT_POWER</span> <span className="text-border">{"//"} penalizes poor exits</span></p>
                    <p className="pl-6 mb-4"><span className="text-white">score</span> = <span className="text-white">apy</span> × <span className="text-white">utilScore</span> × <span className="text-white">exitScore</span></p>
                    <p className="mb-2"><span className="text-gold">[2] DEPOSIT GATES</span> <span className="text-border">(per market, evaluated in this order)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">if</span> <span className="text-white">availableLiquidityUsd</span> &lt; <span className="text-white">MIN_AVAILABLE_LIQUIDITY_USD</span> {"  -> "}<span className="text-danger">BLOCK (LOW_LIQUIDITY)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">if</span> now &lt; <span className="text-white">cooldownUntil</span>[m] {"  -> "}<span className="text-danger">BLOCK (COOLDOWN)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">if</span> <span className="text-white">u</span> &gt;= <span className="text-danger">U_CRIT</span> {"  -> "}<span className="text-danger">BLOCK (CRITICAL)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">if</span> <span className="text-white">exitRatio</span> &lt; <span className="text-danger">EXIT_MIN</span> {"  -> "}<span className="text-danger">BLOCK (LOW_EXIT)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">if</span> <span className="text-white">U_SAT</span> &lt;= <span className="text-white">u</span> &lt; <span className="text-danger">U_CRIT</span> {"  -> "}<span className="text-success">THROTTLE</span>: score ×= <span className="text-white">SAT_INFLOW_MULT</span></p>
                    <p className="pl-6 mb-4"><span className="text-gold">else</span> {"  -> "}<span className="text-success">ALLOW</span></p>
                    <p className="mb-2"><span className="text-gold">[3] TARGET WEIGHTS</span> <span className="text-border">(portfolio)</span></p>
                    <p className="pl-6 mb-1"><span className="text-white">effectiveScore</span>[m] = score after gates (0 <span className="text-gold">if</span> <span className="text-danger">BLOCK</span>)</p>
                    <p className="pl-6 mb-1"><span className="text-white">weights</span> = softmax(<span className="text-white">effectiveScore</span> / <span className="text-white">SOFTMAX_T</span>)</p>
                    <p className="pl-6 mb-1">apply <span className="text-white">MAX_CONCENTRATION</span> cap + renormalize</p>
                    <p className="pl-6 mb-4">enforce <span className="text-white">MIN_ACTIVE_MARKETS</span> (keep top-N by effectiveScore)</p>
                    <p className="mb-2"><span className="text-gold">[4] SHOULD WE REALLOCATE?</span> <span className="text-border">(two-lane trigger)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">Lane A — YIELD:</span></p>
                    <p className="pl-10 mb-1"><span className="text-gold">if</span> <span className="text-white">improvementBps</span> &gt;= <span className="text-white">MIN_IMPROVEMENT_BPS</span> {"-> "}<span className="text-success">REALLOCATE (YIELD)</span></p>
                    <p className="pl-6 mb-2">&nbsp;</p>
                    <p className="pl-6 mb-1"><span className="text-gold">Lane B — RISK OVERRIDE:</span></p>
                    <p className="pl-10 mb-1"><span className="text-white">riskOn</span> <span className="text-gold">if</span> <span className="text-white">weightedAvgUtil</span> &gt;= <span className="text-white">U_SAT</span> <span className="text-gold">OR</span> <span className="text-white">critWeight</span> &gt;= <span className="text-white">CRIT_WEIGHT_RISK</span></p>
                    <p className="pl-10 mb-1"><span className="text-gold">if</span> <span className="text-white">riskOn</span> <span className="text-gold">AND</span> <span className="text-white">meaningfulRiskImprovement</span> {"-> "}<span className="text-success">REALLOCATE (RISK)</span></p>
                    <p className="pl-6 mb-2">&nbsp;</p>
                    <p className="pl-6 mb-1"><span className="text-gold">Churn filter:</span></p>
                    <p className="pl-10 mb-1">ignore moves where |<span className="text-white">weightDeltaBps</span>| &lt; <span className="text-white">MIN_REALLOC_BPS_DELTA</span> <span className="text-border">(per market)</span></p>
                    <p className="pl-6 mb-2">&nbsp;</p>
                    <p className="pl-6 mb-1"><span className="text-gold">Cooldown rule:</span></p>
                    <p className="pl-10 mb-1"><span className="text-gold">if</span> RISK move deallocates &gt; 50% from a market {"-> "}set <span className="text-white">cooldownUntil</span>[m] = now + <span className="text-white">MARKET_COOLDOWN_MS</span></p>
                    <p className="pl-10 mb-4">risk clears when <span className="text-white">weightedAvgUtil</span> &lt; <span className="text-white">U_RECOVERY</span> <span className="text-gold">AND</span> <span className="text-white">exitRatio</span> &gt;= <span className="text-white">EXIT_RECOVERY</span></p>
                    <p className="mb-0"><span className="text-border">Glossary: u=utilization, exitRatio=available liquidity / vault position size, critWeight=% of portfolio in CRIT markets</span></p>
                  </div>
                </div>
              </GridPanel>

              {/* Variables Panel (1 col) */}
              <GridPanel
                className="col-span-1 border-r border-b border-border"
                title={
                  <>
                    <Sliders className="w-[14px] h-[14px] mr-2 text-text" strokeWidth={2} />
                    Variables
                  </>
                }
              >
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <tbody className="divide-y divide-border/20 text-[10px] font-mono">
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U_SAT</td>
                        <td className="p-3 text-right text-white">{(STRATEGY_CONSTANTS.U_SAT * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U_CRIT</td>
                        <td className="p-3 text-right text-danger font-bold">{(STRATEGY_CONSTANTS.U_CRIT * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U0</td>
                        <td className="p-3 text-right text-gold font-bold">{(STRATEGY_CONSTANTS.U0 * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">EXIT_MIN</td>
                        <td className="p-3 text-right text-success">{(STRATEGY_CONSTANTS.EXIT_MIN * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">MIN_AVAILABLE_LIQUIDITY_USD</td>
                        <td className="p-3 text-right text-white">10000</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">MAX_CONCENTRATION</td>
                        <td className="p-3 text-right text-gold font-bold">{(STRATEGY_CONSTANTS.MAX_CONCENTRATION_BPS / 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">MIN_IMPROVEMENT_BPS</td>
                        <td className="p-3 text-right text-white">30</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">CRIT_WEIGHT_RISK</td>
                        <td className="p-3 text-right text-white">25%</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="border-t border-border/20 mt-0" />
                </div>
              </GridPanel>

              {/* Strategy Distribution Panel (4 cols) */}
              <GridPanel
                className="col-span-4 border-r border-b border-border min-h-[350px]"
                title={
                  <>
                    <TrendingUp className="w-[14px] h-[14px] mr-2 text-text" strokeWidth={2} />
                    Strategy // Distribution
                  </>
                }
              >
                <div className="flex-1 relative p-6 flex flex-col">
                  {/* Bell Curve Chart */}
                  <div 
                    className="flex-1 flex items-center justify-center min-h-[400px] outline-none select-none"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <div className="w-full" style={{ height: '400px' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={bellCurveData} margin={{ top: 50, right: 20, bottom: 10, left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.3} />
                          <XAxis
                            dataKey="utilization"
                            type="number"
                            domain={bellCurveXDomain}
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
                            x={STRATEGY_CONSTANTS.U0 * 100}
                            stroke="#a98629"
                            strokeDasharray="2 2"
                            strokeOpacity={0.5}
                            label={{ value: "U0", position: "top", fill: "#a98629", fontSize: 9 }}
                          />
                          <ReferenceLine
                            x={STRATEGY_CONSTANTS.U_SAT * 100}
                            stroke="#a98629"
                            strokeDasharray="2 2"
                            strokeOpacity={0.3}
                            label={{ value: "U_SAT", position: "top", fill: "#a98629", fontSize: 9 }}
                          />
                          <ReferenceLine
                            x={STRATEGY_CONSTANTS.U_CRIT * 100}
                            stroke="#dc2626"
                            strokeDasharray="2 2"
                            strokeOpacity={0.5}
                            label={{ value: "U_CRIT", position: "top", fill: "#dc2626", fontSize: 9 }}
                          />
                          {/* Current vault utilization; when below left limit, show at limit with "Current<64%" */}
                          {weightedUtilization !== null && (() => {
                            const currentPct = weightedUtilization * 100;
                            const belowMin = currentPct < bellCurveXMin;
                            return (
                              <ReferenceLine
                                x={belowMin ? bellCurveXMin : currentPct}
                                stroke="#a98629"
                                strokeWidth={2}
                                label={{
                                  value: belowMin ? `Current<${Math.round(bellCurveXMin)}%` : `Current: ${currentPct.toFixed(1)}%`,
                                  position: "top",
                                  fill: "#a98629",
                                  fontSize: 10,
                                  fontWeight: "bold",
                                }}
                              />
                            );
                          })()}
                          <Line
                            type="monotone"
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

function Usdt0VaultPageFallback() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base items-center justify-center">
      <div className="font-mono text-text-dim text-sm">Loading…</div>
    </div>
  );
}

export default function Usdt0VaultPage() {
  return (
    <Suspense fallback={<Usdt0VaultPageFallback />}>
      <Usdt0VaultPageContent />
    </Suspense>
  );
}
