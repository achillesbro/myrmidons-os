"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ErebusTerminal } from "@/components/vault/ErebusTerminal";
import { AppShell } from "@/components/chrome/AppShell";
import { AppSidebar } from "@/components/chrome/AppSidebar";
import { GridPanel } from "@/components/ui/grid-panel";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GridTable } from "@/components/ui/grid-table";
import { GlitchTypeText } from "@/components/ui/animated-text";
import { tryParseJsonEvent, type JsonlEvent, getTxExplorerUrl } from "@/lib/logs/jsonl";
import { FlowNodeSvg } from "@/components/ui/flow-node-svg";

// Hook to track events from EREBUS stream for metrics
function useErebusMetrics() {
  const [metrics, setMetrics] = useState({
    ticksPerHour: 0,
    candidatesPerHour: 0,
    sent: 0,
    confirmed: 0,
    failed: 0,
    successRate: 0,
    errorsPerHour: 0,
    lastSkipReason: null as string | null,
    latestLiquidations: [] as Array<{
      txHash: string;
      timestamp: Date;
      market?: string;
      borrower?: string;
      profit?: string;
    }>,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<Array<{ event: JsonlEvent; timestamp: Date }>>([]);
  const tickEndEventsRef = useRef<Array<{ event: JsonlEvent; timestamp: Date }>>([]);
  const txEventsRef = useRef<Array<{ event: JsonlEvent; timestamp: Date }>>([]);
  const errorEventsRef = useRef<Array<{ event: JsonlEvent; timestamp: Date }>>([]);

  // Clean up old events (keep last hour)
  const cleanupOldEvents = useCallback(() => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    eventsRef.current = eventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);
    tickEndEventsRef.current = tickEndEventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);
    txEventsRef.current = txEventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);
    errorEventsRef.current = errorEventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);
  }, []);

  // Compute metrics from events
  const computeMetrics = useCallback(() => {
    cleanupOldEvents();

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    // Filter events from last hour
    const recentTickEnds = tickEndEventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);
    const recentTxs = txEventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);
    const recentErrors = errorEventsRef.current.filter((e) => e.timestamp.getTime() > oneHourAgo);

    // Compute throughput
    const ticksPerHour = recentTickEnds.length;
    const candidatesPerHour = recentTickEnds.reduce((sum, e) => {
      const candidates = e.event.summary?.candidatesTotal || 0;
      return sum + candidates;
    }, 0);

    // Compute tx stats
    const sent = recentTxs.filter((e) => e.event.type === "tx_sent").length;
    const confirmed = recentTxs.filter((e) => e.event.type === "tx_confirmed").length;
    const failed = recentTxs.filter((e) => e.event.type === "error" && e.event.txHash).length;
    const successRate = sent > 0 ? (confirmed / sent) * 100 : 0;

    // Compute errors per hour
    const errorsPerHour = recentErrors.length;

    // Get latest liquidations (last 20 confirmed txs)
    const latestLiquidations = recentTxs
      .filter((e) => e.event.type === "tx_confirmed" && e.event.txHash)
      .slice(-20)
      .reverse()
      .map((e) => ({
        txHash: e.event.txHash!,
        timestamp: e.timestamp,
        market: e.event.summary?.market || undefined,
        borrower: e.event.summary?.borrower || undefined,
        profit: e.event.summary?.profit !== undefined ? String(e.event.summary.profit) : undefined,
      }));

    // Get last skip reason
    const lastSkip = eventsRef.current
      .slice()
      .reverse()
      .find((e) => e.event.type === "tick_skip");
    const lastSkipReason = lastSkip?.event.reason || null;

    setMetrics({
      ticksPerHour,
      candidatesPerHour,
      sent,
      confirmed,
      failed,
      successRate,
      errorsPerHour,
      lastSkipReason,
      latestLiquidations,
    });
  }, [cleanupOldEvents]);

  // Connect to stream
  useEffect(() => {
    const cacheBuster = Date.now();
    const eventSource = new EventSource(`/api/logs/erebus/stream?t=${cacheBuster}`);

    const handleLine = (rawData: string | null) => {
      if (!rawData) return;

      let data = typeof rawData === "string" ? rawData : String(rawData);
      if (data.startsWith("data:")) {
        data = data.slice(5).trim();
      }

      const jsonlResult = tryParseJsonEvent(data.trim());
      if (jsonlResult.ok && jsonlResult.evt) {
        const timestamp = new Date();
        const event = jsonlResult.evt;

        eventsRef.current.push({ event, timestamp });

        if (event.type === "tick_end") {
          tickEndEventsRef.current.push({ event, timestamp });
        }

        if (event.type === "tx_sent" || event.type === "tx_confirmed") {
          txEventsRef.current.push({ event, timestamp });
        }

        if (event.type === "error") {
          errorEventsRef.current.push({ event, timestamp });
        }

        if (event.type === "tick_skip") {
          // Already added to eventsRef above
        }

        // Compute metrics after adding event
        computeMetrics();
      }
    };

    eventSource.addEventListener("log", (event: MessageEvent) => {
      handleLine(event.data);
    });

    eventSource.onmessage = (event) => {
      handleLine(event.data);
    };

    eventSourceRef.current = eventSource;

    // Compute metrics periodically
    const interval = setInterval(computeMetrics, 5000);

    return () => {
      eventSource.close();
      clearInterval(interval);
    };
  }, [computeMetrics]);

  return metrics;
}

// FlowNode Component - Rotated Rectangle Tile
function FlowNode({ primary, secondary, stateLabel }: { primary: string; secondary: string; stateLabel: string }) {
  const STATE_RAIL_WIDTH = 32;
  const CONTENT_PADDING_LEFT = STATE_RAIL_WIDTH + 12; // Rail width + spacing
  
      return (
    <div className="relative w-[150px] h-[120px] md:w-[170px] md:h-[130px] lg:w-[190px] lg:h-[140px] flex items-center justify-center">
      {/* Rotated tile container with SVG background */}
      <div
        className="
          absolute left-1/2 top-1/2
          -translate-x-1/2 -translate-y-1/2
          rotate-[-45deg]
          w-[220px] h-[75px]
          bg-panel
          select-none
          overflow-hidden
        "
      >
        {/* SVG borders matching shard conventions */}
        <FlowNodeSvg stateLabel={stateLabel} />
        
        {/* Text content - rotates with tile, left-aligned layout */}
        <div className="absolute inset-0">
          {/* Rail column - independently centered */}
          <div className="absolute left-0 top-0 bottom-0 w-[32px] flex items-center justify-center font-mono">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-gold leading-none">
              {stateLabel}
            </span>
          </div>
          
          {/* Content lane - left-aligned, independent of rail */}
          <div className="absolute left-[32px] right-0 top-0 bottom-0 pl-3 pr-4 py-2 flex flex-col justify-center font-mono">
            <div className="text-[11px] font-mono uppercase tracking-widest text-text whitespace-nowrap leading-none">
              {primary}
            </div>
            <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-text-dim whitespace-nowrap leading-none">
              {secondary}
            </div>
          </div>
        </div>
      </div>
        </div>
      );
    }

// Execution Flow Schematic Component
function ExecutionFlowSchematic() {
  const nodes = [
    { stateLabel: "S0", primary: "MARKET_SCAN", secondary: "candidates" },
    { stateLabel: "S1", primary: "LIQUIDATABILITY_CHECK", secondary: "oracle + position" },
    { stateLabel: "S2", primary: "ROUTE_DISCOVERY", secondary: "collateral -> loan" },
    { stateLabel: "S3", primary: "SIMULATION", secondary: "dry-run" },
    { stateLabel: "S4", primary: "FLASHLOAN_EXECUTION", secondary: "tx sent" },
    { stateLabel: "S5", primary: "ATOMIC_SETTLEMENT", secondary: "receipt" },
  ];

  return (
    <div className="relative w-full overflow-x-visible">
      {/* Bus connector line - behind nodes */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-0"
        viewBox="0 0 1000 260"
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ shapeRendering: "crispEdges" }}
      >
        {/* Primary bus line - from S0 center to S5 center, through visual midline (55% of 260 = 143) */}
        {/* S0 center: ~10% (accounting for padding/gaps), S5 center: ~90% (accounting for padding/gaps) */}
        <line
          x1="100"
          y1="143"
          x2="900"
          y2="143"
          stroke="color-mix(in oklab, var(--border) 45%, transparent)"
          strokeWidth="1"
        />
        {/* Secondary parallel line - 2px below, lower opacity (143 + 2 = 145) */}
        <line
          x1="100"
          y1="145"
          x2="900"
          y2="145"
          stroke="color-mix(in oklab, var(--border) 25%, transparent)"
          strokeWidth="1"
        />
      </svg>

      {/* Desktop layout: 6-column grid with rotated rectangle nodes */}
      <div className="hidden md:grid grid-cols-6 items-center gap-x-2 md:gap-x-3 lg:gap-x-4 relative min-h-[260px] py-6 px-0 md:px-2 w-full z-10">
        {nodes.map((node, index) => (
          <FlowNode key={index} stateLabel={node.stateLabel} primary={node.primary} secondary={node.secondary} />
        ))}
      </div>

      {/* Mobile layout: vertical flow (non-rotated for mobile) */}
      <div className="md:hidden space-y-4">
        {nodes.map((node, index) => (
          <div key={index} className="relative">
            {/* Node box */}
            <div className="border border-border bg-bg-base px-4 py-2.5 text-center min-w-[180px]">
              <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-text/85 leading-tight whitespace-nowrap">
                {node.primary}
              </div>
              <div className="mt-1 text-[10px] font-mono tracking-[0.12em] text-text-dim/70 leading-tight whitespace-nowrap">
                {node.secondary}
              </div>
            </div>
            {/* Connector arrow (except for last node) */}
            {index < nodes.length - 1 && (
              <div className="flex justify-center py-2">
                <svg
                  className="w-4 h-8"
                  viewBox="0 0 16 32"
                  fill="none"
                >
                  <line
                    x1="8"
                    y1="0"
                    x2="8"
                    y2="24"
                    stroke="var(--border)"
                    strokeWidth="1"
                    opacity="0.5"
                  />
                  <polygon
                    points="8,24 0,28 8,32"
                    fill="var(--border)"
                    opacity="0.5"
                  />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LiquidationModulePage() {
  const metrics = useErebusMetrics();

  return (
    <div className="h-[calc(100vh-3.5rem)] mt-14 flex flex-col overflow-hidden bg-bg-base">
      <AppShell sidebar={<AppSidebar terminal={<ErebusTerminal />} title="EREBUS // LIVE_FEED" />}>
        <div className="flex-1 overflow-y-auto p-0 scroll-smooth">
          <div className="grid grid-cols-4 border-l border-t border-border bg-bg-base min-h-full">
            {/* KPI Row */}
            <GridKpi
              label="Rolling Throughput"
              value={
                <GlitchTypeText
                  loading={false}
                  value={metrics.ticksPerHour > 0 ? `${metrics.ticksPerHour}/h` : "—"}
                  mode="number"
                />
              }
              subValue={
                <>
                  <span className="text-text-dim flex items-center gap-1">
                    {metrics.candidatesPerHour > 0
                      ? `${metrics.candidatesPerHour} candidates/h`
                      : "—"}
                  </span>
                </>
              }
              accent="default"
              cornerIndicator="default"
            />
            <GridKpi
              label="Rolling Results"
              value={
                <GlitchTypeText
                  loading={false}
                  value={
                    metrics.sent > 0
                      ? `${metrics.confirmed}/${metrics.sent}`
                      : "—"
                  }
                  mode="number"
                />
              }
              subValue={
                <>
                  <span className="text-text-dim flex items-center gap-1">
                    {metrics.successRate > 0
                      ? `${metrics.successRate.toFixed(1)}% success`
                      : "—"}
                  </span>
                  {metrics.failed > 0 && (
                    <span className="text-danger flex items-center gap-1">
                      {metrics.failed} fail
                    </span>
                  )}
                </>
              }
              accent={metrics.successRate > 90 ? "success" : "default"}
              cornerIndicator={metrics.successRate > 90 ? "success" : "default"}
            />
            <GridKpi
              label="Profit"
              value={<GlitchTypeText loading={false} value="—" mode="text" />}
              subValue={
                <>
                  <span className="text-text-dim flex items-center gap-1">PLACEHOLDER</span>
                </>
              }
              accent="default"
              cornerIndicator="default"
            />
            <GridKpi
              label="Errors / Skips"
              value={
                <GlitchTypeText
                  loading={false}
                  value={metrics.errorsPerHour > 0 ? `${metrics.errorsPerHour}/h` : "—"}
                  mode="number"
                />
              }
              subValue={
                <>
                  <span className="text-text-dim flex items-center gap-1">
                    {metrics.lastSkipReason || "—"}
                  </span>
                </>
              }
              accent={metrics.errorsPerHour > 0 ? "danger" : "default"}
              cornerIndicator={metrics.errorsPerHour > 0 ? "danger" : "default"}
            />

            {/* Latest Liquidations Table (minimal size) */}
            <GridPanel
              className="col-span-4 border-r border-b border-border"
              title="Latest Liquidations"
            >
              {metrics.latestLiquidations.length === 0 ? (
                <div className="p-2 text-text-dim/50 font-mono text-xs">
                  No liquidations yet
                </div>
              ) : (
                <div className="max-h-[200px] overflow-y-auto">
                <GridTable
                  columns={[
                    { header: "Time", align: "left" },
                      { header: "Tx Hash", align: "left" },
                    { header: "Market", align: "left" },
                    { header: "Borrower", align: "left" },
                    { header: "Profit", align: "right" },
                  ]}
                    rows={metrics.latestLiquidations.slice(0, 10).map((liq) => ({
                    cells: [
                        <span key="time" className="text-text-dim">
                          {liq.timestamp.toLocaleTimeString("en-US", {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                      </span>,
                      <a
                        key="tx"
                          href={getTxExplorerUrl(liq.txHash, 999)}
                        target="_blank"
                        rel="noopener noreferrer"
                          className="text-gold hover:text-gold/80 hover:underline font-mono text-[10px]"
                      >
                          {liq.txHash.slice(0, 6)}…{liq.txHash.slice(-4)}
                      </a>,
                        <span key="market">{liq.market || "—"}</span>,
                        <span key="borrower" className="font-mono text-[10px]">
                          {liq.borrower ? `${liq.borrower.slice(0, 6)}…${liq.borrower.slice(-4)}` : "—"}
                        </span>,
                        <span key="profit" className="text-success">
                          {liq.profit || "—"}
                        </span>,
                    ],
                  }))}
                />
                </div>
              )}
            </GridPanel>

            {/* Strategy Section - Row 1: Narrative */}
            <GridPanel
              className="col-span-4 border-r border-b border-border"
              title="STRATEGY // FLASHLOAN LIQUIDATION ENGINE"
            >
              <div className="flex-1 p-6 font-mono text-xs md:text-sm leading-loose text-text-dim bg-bg-base relative overflow-hidden">
                <div className="relative z-10 space-y-6">
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-text">System role</p>
                    <p className="text-text-dim leading-relaxed">
                      EREBUS is a liquidation engine operating on Morpho Blue. It continuously monitors lending markets, detects unhealthy positions using live on-chain state, and liquidates them when execution is economically viable.
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-text">Execution model</p>
                    <p className="text-text-dim leading-relaxed">
                      Liquidations are executed atomically. Required liquidity is borrowed transiently via flashloans and repaid within the same transaction. No capital is held between cycles, and no funds are managed on behalf of users.
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] uppercase tracking-widest text-text">Operational flow</p>
                    <p className="text-text-dim leading-relaxed">
                      Each cycle evaluates candidates, validates liquidatability on-chain, simulates execution, and submits a transaction only if the outcome is positive. The system is designed around deterministic validation before execution and strict atomic settlement on-chain.
                </p>
              </div>
                </div>
              </div>
            </GridPanel>

            {/* Strategy Section - Row 2: Execution Flow Schematic */}
            <GridPanel
              className="col-span-4 border-r border-b border-border overflow-visible"
              title="EXECUTION FLOW // SCHEMATIC"
            >
              <div className="pl-6 pr-8 pt-6 pb-6 relative min-h-[260px] overflow-visible">
                <ExecutionFlowSchematic />
              </div>
            </GridPanel>
          </div>
        </div>
      </AppShell>
    </div>
  );
}
