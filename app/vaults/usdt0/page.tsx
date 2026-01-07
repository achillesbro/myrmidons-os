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
} from "@/lib/morpho/queries";
import { pickKpis, pickAllocations } from "@/lib/morpho/view";

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

  // Fetch vault data
  const metadataQuery = useVaultMetadata(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const apyQuery = useVaultApy(USDT0_VAULT_ADDRESS, USDT0_VAULT_CHAIN_ID);
  const allocationsQuery = useVaultAllocations(
    USDT0_VAULT_ADDRESS,
    USDT0_VAULT_CHAIN_ID
  );

  // Extract KPIs (pass allocations for utilization calculation)
  const kpis = pickKpis(metadataQuery.data, apyQuery.data, allocationsQuery.data);
  const allocations = pickAllocations(allocationsQuery.data);

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
                  {/* Chart Placeholder */}
                  <div className="h-[360px] border border-border/50 rounded-md bg-bg-base/50 flex items-center justify-center">
                    <div className="text-text/50 font-mono text-sm text-center">
                      Chart placeholder
                      <br />
                      <span className="text-xs">Timeframe: {selectedTimeframe}</span>
                    </div>
                  </div>
                </Panel>
              </div>

              {/* Deposit Panel (30% width) */}
              <div className="lg:col-span-3">
                <Panel title="DEPOSIT">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-text/70 mb-2 block">
                        Amount
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="0.00"
                          className="w-full bg-bg-base border border-border rounded-md px-3 py-2 pr-16 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-border"
                          disabled
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text/70 font-mono">
                          USDT0
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="gold" className="w-full" disabled>
                        Deposit
                      </Button>
                      <Button variant="outline" className="w-full" disabled>
                        Withdraw
                      </Button>
                    </div>
                    <p className="text-xs text-text/60 font-mono text-center">
                      Transactions executed on-chain
                    </p>
                  </div>
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

          <TabsContent value="strategy" className="mt-6">
            <Panel title="STRATEGY OVERVIEW">
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-text/90">
                    Objective
                  </h3>
                  <p className="font-mono text-xs text-text/70">
                    Automatically reallocate USDT0 deposits across Morpho markets
                    to maximize yield while maintaining risk constraints.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-text/90">
                    Reallocation Rules
                  </h3>
                  <div className="font-mono text-xs text-text/70 space-y-1">
                    <div>• Minimum improvement threshold: 50 bps</div>
                    <div>• Only reallocate if new APY exceeds current by threshold</div>
                    <div>• Respect maximum allocation per market limits</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-text/90">
                    Risk Constraints
                  </h3>
                  <div className="font-mono text-xs text-text/70 space-y-1">
                    <div>• Maximum slippage: 0.5%</div>
                    <div>• Maximum single market allocation: 50%</div>
                    <div>• Minimum liquidity requirement: $100k per market</div>
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide mb-3 text-text/90">
                    Execution Frequency
                  </h3>
                  <p className="font-mono text-xs text-text/70">
                    Reallocation checks run every 5 minutes. Executions occur
                    only when improvement threshold is met.
                  </p>
                </div>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

