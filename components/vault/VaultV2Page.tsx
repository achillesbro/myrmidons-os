"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState, useEffect } from "react";
import {
  useVaultMetadata,
  useVaultAllocations,
  useVaultApy,
  useVaultHistory,
  useVaultMarkets,
} from "@/lib/morpho/queries";
import { computeMarketDecisions, type MarketDecision } from "@/lib/strategy/adaptiveCurve";
import { HEGEMON_V2_CONSTANTS, effectiveUtilAttractivenessV2 } from "@/lib/strategy/hegemonV2";
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
import { ReallocatorTerminal } from "@/components/vault/ReallocatorTerminal";
import { TransactionTerminal, type TransactionLog } from "@/components/vault/TransactionTerminal";

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
import { useMarketHealth, useUtilSpells } from "@/lib/mnemon/queries";
import { computeMarketStats, isRealMarket } from "@/lib/mnemon/aggregate";
import { MnemonMarketDrilldown } from "@/components/tools/mnemon/MnemonMarketDrilldown";

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
            minTickGap={40}
            interval="preserveStartEnd"
            tickMargin={6}
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

export interface VaultV2PageProps {
  /** The Morpho Vault V2 address this page renders. */
  vaultAddress: `0x${string}`;
  vaultChainId: number;
  /** Asset symbol as the Morpho API renders it (idle-row label + liquidity unit), e.g. "USD₮0" or "USDC". */
  assetSymbol: string;
  /** Deposit-panel token icon; omit for the USDT0 default, null for the generic icon-slot. */
  assetLogoSrc?: string | null;
}

function VaultV2PageContent({ vaultAddress, vaultChainId, assetSymbol, assetLogoSrc }: VaultV2PageProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState("7D");
  const [activeTab, setActiveTab] = useState("overview");
  const [mounted, setMounted] = useState(false);
  // MNEMON per-market drill-down for allocation rows.
  const [expandedAllocId, setExpandedAllocId] = useState<string | null>(null);
  const mnemonHealthQuery = useMarketHealth();
  const mnemonSpellsQuery = useUtilSpells();
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
  const metadataQuery = useVaultMetadata(vaultAddress, vaultChainId, true);
  const apyQuery = useVaultApy(vaultAddress, vaultChainId, true);
  const allocationsQuery = useVaultAllocations(
    vaultAddress,
    vaultChainId,
    true
  );
  const historyQuery = useVaultHistory(
    vaultAddress,
    currentRange,
    vaultChainId,
    true
  );
  const marketsQuery = useVaultMarkets(vaultAddress, vaultChainId, true);

  // Fetch user vault share balance
  useEffect(() => {
    if (!publicClient || !address || chainId !== vaultChainId) {
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
          readVaultDecimals(vaultAddress, client),
          client.readContract({
            address: vaultAddress,
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
  }, [publicClient, address, chainId, vaultAddress, vaultChainId]);

  // Extract KPIs (pass allocations for utilization calculation)
  const kpis = pickKpis(
    metadataQuery.data ?? null,
    apyQuery.data ?? null,
    allocationsQuery.data ?? null
  );
  const allocations = pickAllocations(
    (allocationsQuery.data ?? null) as Parameters<typeof pickAllocations>[0]
  );
  const activeMarketCount = allocations.filter((a) => a.market !== assetSymbol).length;

  // Collapse low-concentration markets into a single "OTHERS" row for display.
  // Keeper caps active markets at 6; the rest are dust positions draining over
  // time. allocations is already sorted by concentration desc.
  const TOP_MARKETS_TO_SHOW = 6;
  const allocationRows =
    allocations.length <= TOP_MARKETS_TO_SHOW
      ? allocations
      : (() => {
          const top = allocations.slice(0, TOP_MARKETS_TO_SHOW);
          const rest = allocations.slice(TOP_MARKETS_TO_SHOW);
          const restPct = rest.reduce((s, r) => s + (r.allocationPct ?? 0), 0);
          const restWeight = rest.reduce(
            (s, r) => s + (r.allocationPct ?? 0),
            0
          );
          const weightedApy =
            restWeight > 0
              ? rest.reduce(
                  (s, r) => s + (r.apyPct ?? 0) * (r.allocationPct ?? 0),
                  0
                ) / restWeight
              : undefined;
          return [
            ...top,
            { market: "OTHERS", allocationPct: restPct, apyPct: weightedApy },
          ];
        })();

  // Get markets data for liquidity and utilization
  const marketsData = marketsQuery.data?.markets || [];
  
  // Create a map of market label to market data for quick lookup
  // Keyed by market id: labels collide when a vault holds the same
  // collateral at two LLTVs (e.g. the USDC vault's two kHYPE markets).
  const marketMap = new Map(
    marketsData.map((m) => [m.marketId, m])
  );

  // MNEMON market data, keyed by market id, for the allocation drill-down.
  const mnemonMarkets = mnemonHealthQuery.data?.markets ?? [];
  const mnemonByMarketId = new Map(
    mnemonMarkets.map((m) => [m.market_id.toLowerCase(), m])
  );
  const mnemonBestInvestableApy = computeMarketStats(
    mnemonMarkets.filter(isRealMarket)
  ).bestDeployableApy;

  // Compute market decisions for strategy tab
  const marketDecisions: MarketDecision[] = marketsQuery.data?.markets
    ? computeMarketDecisions(marketsQuery.data.markets)
    : [];
  
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

  // Effective attractiveness curve, on an x-range symmetric around U0 so the
  // peak sits at the chart's center. Plots what the scorer actually applies:
  // the bell, cut to 40% (SAT_INFLOW_MULT) at U_SAT and to zero at U_CRIT —
  // explicit pre/post points at both thresholds keep the cliffs vertical.
  const BELL_HALF_WIDTH = Math.min(0.18, 1 - HEGEMON_V2_CONSTANTS.U0, HEGEMON_V2_CONSTANTS.U0);
  const bellCurveData = (() => {
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

  // X domain for bell curve (fixed; current utilization below left limit is shown at the limit)
  const bellCurveXMin = (HEGEMON_V2_CONSTANTS.U0 - BELL_HALF_WIDTH) * 100;
  const bellCurveXMax = (HEGEMON_V2_CONSTANTS.U0 + BELL_HALF_WIDTH) * 100;
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
        sidebar={
          <AppSidebar
            terminal={
              <ReallocatorTerminal
                streamPath="/api/logs/hegemon-v2/stream"
                vaultFilter={vaultAddress}
              />
            }
          />
        }
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 content-start border-l border-t border-border bg-bg-base min-h-full">
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
              <GridKpi
                label="Status"
                value={<GlitchTypeText loading={isLoading} value="IN DEV" mode="text" />}
                subValue={<span className="text-text-dim font-mono">TEST PHASE — UNAUDITED</span>}
                accent="gold"
                cornerIndicator="gold"
              />

              {/* Chart Panel (3 cols) */}
              <GridPanel
                className="col-span-1 sm:col-span-2 lg:col-span-3 border-r border-b border-border h-[300px] sm:h-[430px] flex flex-col"
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
                className="col-span-1 sm:col-span-2 lg:col-span-1 border-r border-b border-border h-auto lg:h-[430px] flex flex-col"
                title={
                  <>
                    <Wallet className="w-[14px] h-[14px] mr-2 text-gold glow-gold-icon" strokeWidth={2} />
                    Current Position
                  </>
                }
              >
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-border bg-bg-base shrink-0">
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
                  <div className="p-4 min-h-0 flex-1 flex flex-col">
                    <DepositPanel 
                      vaultAddress={vaultAddress}
                      v2
                      assetSymbol={assetSymbol}
                      assetLogoSrc={assetLogoSrc}
                      onTransactionLogsChange={setTransactionLogs}
                      initialAmount={initialDeposit ?? initialWithdraw ?? undefined}
                      initialMode={initialDeposit != null ? "deposit" : initialWithdraw != null ? "withdraw" : undefined}
                    />
                  </div>
                </div>
              </GridPanel>

              {/* Allocation Snapshot (3 cols, below Current Position) */}
              <GridPanel
                className="col-span-1 sm:col-span-2 lg:col-span-3 border-r border-b border-border"
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
                    rows={allocationRows.map((row, idx) => {
                      const isIdleMarket = row.market === assetSymbol;
                      const isOthers = row.market === "OTHERS";
                      const marketData =
                        isOthers || !row.marketId ? undefined : marketMap.get(row.marketId);
                      const utilization = marketData?.u ?? null;
                      const liquidity = marketData?.availableLiquidity ?? null;

                      // MNEMON drill-down: expand real markets that MNEMON tracks.
                      const marketId = marketData?.marketId ?? null;
                      const mnemonMarket = marketId
                        ? mnemonByMarketId.get(marketId.toLowerCase())
                        : undefined;
                      const expandable = !isIdleMarket && !isOthers && mnemonMarket != null;
                      const isExpanded = expandable && expandedAllocId === marketId;

                      // Determine status based on utilization (from strategy constants)
                      let statusLabel = "STABLE";
                      let statusColor = "text-text-dim border-border";
                      if (isOthers) {
                        statusLabel = "DUST";
                        statusColor = "text-text-dim border-border";
                      } else if (utilization !== null) {
                        if (utilization >= HEGEMON_V2_CONSTANTS.U_CRIT) {
                          statusLabel = "CRITICAL";
                          statusColor = "text-danger border-danger";
                        } else if (utilization >= HEGEMON_V2_CONSTANTS.U_SAT) {
                          statusLabel = "SATURATED";
                          statusColor = "text-gold border-gold";
                        } else if (
                          utilization >= HEGEMON_V2_CONSTANTS.U_OPT_LOW &&
                          utilization < HEGEMON_V2_CONSTANTS.U_SAT
                        ) {
                          statusLabel = "OPTIMAL";
                          statusColor = "text-success border-success";
                        }
                      }

                      // Format liquidity - API returns liquidity with 6 decimals (micro-units), convert to asset units
                      let liquidityDisplay = "—";
                      if (liquidity !== null && liquidity > 0) {
                        // API returns values with 6 decimals, divide by 1e6 to get actual asset units
                        const liquidityInAsset = liquidity / 1e6;
                        // Format with commas and 2 decimal places
                        const formatted = new Intl.NumberFormat('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        }).format(liquidityInAsset);
                        liquidityDisplay = `${formatted} ${assetSymbol}`;
                      }

                      const marketClass = isIdleMarket
                        ? "font-bold text-gold"
                        : isOthers
                          ? "font-bold text-text-dim italic"
                          : "font-bold";

                      return {
                        onClick: expandable
                          ? () => setExpandedAllocId(isExpanded ? null : marketId)
                          : undefined,
                        expandedContent:
                          isExpanded && mnemonMarket ? (
                            <MnemonMarketDrilldown
                              market={mnemonMarket}
                              spells={mnemonSpellsQuery.data?.spells ?? []}
                              bestInvestableApy={mnemonBestInvestableApy}
                              hegemonStatus={statusLabel}
                            />
                          ) : undefined,
                        cells: [
                          <span key="market" className={marketClass}>
                            {expandable && (
                              <span
                                aria-hidden
                                className={cn(
                                  "inline-block mr-1.5 text-[10px] text-text-dim/60 transition-transform",
                                  isExpanded && "rotate-90"
                                )}
                              >
                                ▸
                              </span>
                            )}
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
                className="col-span-1 sm:col-span-2 lg:col-span-1 border-r border-b border-border"
                title="Transaction Logs"
              >
                <TransactionTerminal logs={transactionLogs} />
              </GridPanel>
              </div>
            )}

          {activeTab === "strategy" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 content-start border-l border-t border-border bg-bg-base min-h-full">
              {/* Formulas Panel (3 cols) */}
              <GridPanel
                className="col-span-1 sm:col-span-2 lg:col-span-3 border-r border-b border-border"
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
                    <p className="mb-2"><span className="text-border">{"//"} HEGEMON_V2 Allocation Policy (overview — Vault V2)</span></p>
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
                    <p className="pl-6 mb-1"><span className="text-white">sNorm</span>[m] = <span className="text-white">effectiveScore</span>[m] / max(<span className="text-white">effectiveScore</span>) <span className="text-border">{"//"} scale-free, in (0, 1]</span></p>
                    <p className="pl-6 mb-1"><span className="text-white">weights</span> = softmax((<span className="text-white">sNorm</span> − 1) / <span className="text-white">SOFTMAX_T</span>) <span className="text-border">{"//"} normalized softmax: every eligible market gets weight</span></p>
                    <p className="pl-6 mb-4">per-market limits come from <span className="text-white">on-chain caps</span> (absolute + relative), enforced by the vault — no planner-side concentration cap or min-active</p>
                    <p className="mb-2"><span className="text-gold">[3.5] LIQUIDITY MARKET</span> <span className="text-border">(vault liquidityAdapter)</span></p>
                    <p className="pl-6 mb-1">instant exits are served from one designated market; rotate only <span className="text-gold">if</span> a challenger beats the incumbent by <span className="text-white">LIQUIDITY_ROTATION_FACTOR</span>×</p>
                    <p className="pl-6 mb-4">floor <span className="text-white">LIQUIDITY_BUFFER_BPS</span> of totalAssets there (capped at half the market&apos;s available liquidity)</p>
                    <p className="mb-2"><span className="text-gold">[4] BUILD THE PLAN</span> <span className="text-border">(delta-based, one atomic multicall)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">Risk lane (checked first):</span> <span className="text-gold">if</span> <span className="text-white">critWeight</span> &gt;= <span className="text-white">CRIT_WEIGHT_RISK</span> {"-> "}<span className="text-danger">deallocate-only plan</span>, skip normal allocation this tick</p>
                    <p className="pl-6 mb-1"><span className="text-gold">Diff:</span> targets vs current position per market {"-> "}<span className="text-white">deallocations[]</span> + <span className="text-white">allocations[]</span>, feasibility-clamped (never below <span className="text-white">U_OPT_LOW</span> on deposit, never above <span className="text-danger">U_CRIT</span> on withdrawal)</p>
                    <p className="pl-6 mb-1"><span className="text-gold">Haircut:</span> withdrawals sized at <span className="text-white">DEALLOC_HAIRCUT_BPS</span> of the computed max <span className="text-border">{"//"} survives state drift before inclusion</span></p>
                    <p className="pl-6 mb-2"><span className="text-gold">Churn filter:</span> drop the whole plan <span className="text-gold">if</span> no per-market delta &gt;= <span className="text-white">MIN_REALLOC_BPS_DELTA</span> of totalAssets <span className="text-border">(unless risk lane fired)</span></p>
                    <p className="pl-6 mb-1"><span className="text-gold">Cooldowns (deposits only):</span></p>
                    <p className="pl-10 mb-1">risk exits {"-> "}<span className="text-white">RISK_COOLDOWN</span> (2h); thin-liquidity exits {"-> "}<span className="text-white">LIQUIDITY_COOLDOWN</span> (30m)</p>
                    <p className="pl-10 mb-4">early release when <span className="text-white">u</span> &lt; <span className="text-white">U_RECOVERY</span> <span className="text-gold">AND</span> <span className="text-white">exitRatio</span> &gt;= <span className="text-white">EXIT_RECOVERY</span></p>
                    <p className="mb-0"><span className="text-border">Glossary: u=utilization, exitRatio=available liquidity / vault position size, critWeight=% of portfolio in CRIT markets. Execution: deallocate → setLiquidityAdapterAndData → allocate, one multicall, simulated before send.</span></p>
                  </div>
                </div>
              </GridPanel>

              {/* Variables Panel (1 col) */}
              <GridPanel
                className="col-span-1 sm:col-span-2 lg:col-span-1 border-r border-b border-border"
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
                        <td className="p-3 text-text-dim uppercase tracking-wider">U0</td>
                        <td className="p-3 text-right text-gold font-bold">{(HEGEMON_V2_CONSTANTS.U0 * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">SIGMA</td>
                        <td className="p-3 text-right text-white">{(HEGEMON_V2_CONSTANTS.SIGMA * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U_OPT_LOW</td>
                        <td className="p-3 text-right text-white">{(HEGEMON_V2_CONSTANTS.U_OPT_LOW * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U_SAT</td>
                        <td className="p-3 text-right text-white">{(HEGEMON_V2_CONSTANTS.U_SAT * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U_CRIT</td>
                        <td className="p-3 text-right text-danger font-bold">{(HEGEMON_V2_CONSTANTS.U_CRIT * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">EXIT_MIN</td>
                        <td className="p-3 text-right text-success">{(HEGEMON_V2_CONSTANTS.EXIT_MIN * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">EXIT_POWER</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.EXIT_POWER}</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">SAT_INFLOW_MULT</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.SAT_INFLOW_MULT}</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">SOFTMAX_T</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.SOFTMAX_T.toFixed(2)}</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">MIN_REALLOC_BPS_DELTA</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.MIN_REALLOC_BPS_DELTA} bps</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">CRIT_WEIGHT_RISK</td>
                        <td className="p-3 text-right text-white">{(HEGEMON_V2_CONSTANTS.CRIT_WEIGHT_RISK * 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">DEALLOC_HAIRCUT</td>
                        <td className="p-3 text-right text-white">{(HEGEMON_V2_CONSTANTS.DEALLOC_HAIRCUT_BPS / 100).toFixed(2)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">LIQUIDITY_BUFFER</td>
                        <td className="p-3 text-right text-gold font-bold">{(HEGEMON_V2_CONSTANTS.LIQUIDITY_BUFFER_BPS / 100).toFixed(0)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">LIQUIDITY_ROTATION_FACTOR</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.LIQUIDITY_ROTATION_FACTOR}x</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">RISK_COOLDOWN</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.RISK_COOLDOWN_HOURS}h</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">LIQUIDITY_COOLDOWN</td>
                        <td className="p-3 text-right text-white">{HEGEMON_V2_CONSTANTS.LIQUIDITY_COOLDOWN_MINUTES}m</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">U_RECOVERY</td>
                        <td className="p-3 text-right text-white">{(HEGEMON_V2_CONSTANTS.U_RECOVERY * 100).toFixed(1)}%</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">MIN_AVAILABLE_LIQUIDITY</td>
                        <td className="p-3 text-right text-white">$10k</td>
                      </tr>
                      <tr className="hover:bg-white/5 transition-colors">
                        <td className="p-3 text-text-dim uppercase tracking-wider">PER-MARKET CAPS</td>
                        <td className="p-3 text-right text-gold font-bold">ON-CHAIN</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="border-t border-border/20 mt-0" />
                </div>
              </GridPanel>

              {/* Strategy Distribution Panel (4 cols) */}
              <GridPanel
                className="col-span-1 sm:col-span-2 lg:col-span-4 border-r border-b border-border min-h-[350px]"
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

function VaultV2PageFallback() {
  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base items-center justify-center">
      <div className="font-mono text-text-dim text-sm">Loading…</div>
    </div>
  );
}

export function VaultV2Page(props: VaultV2PageProps) {
  return (
    <Suspense fallback={<VaultV2PageFallback />}>
      <VaultV2PageContent {...props} />
    </Suspense>
  );
}
