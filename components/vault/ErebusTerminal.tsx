"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { tryParseJsonEvent, formatEvent, getTxExplorerUrl, isLegacyNoiseLine } from "@/lib/logs/jsonl";

export interface LogEntry {
  ts: Date; // Receive timestamp (always set)
  level: "INFO" | "WARN" | "ERROR" | "DEBUG" | "SUCCESS" | "TICK" | "PHASE" | "BATCH" | "SUMMARY" | "CACHE";
  message: string;
  txHashes: string[];
  raw: string;
  mode?: string; // BASE or FAST from tick line
  compressedOriginal?: string; // Original line before compression (for hover tooltip)
  isBatchProgress?: boolean; // Mark batch progress lines for replacement
  isStructured?: boolean; // True if this is a JSONL structured event
  structuredTitle?: string; // Title for structured events
  structuredSubtitle?: string; // Subtitle for structured events
  structuredTickId?: string; // Tick ID for structured events
}

type ConnectionStatus = "CONNECTING" | "LIVE" | "RECONNECTING" | "ERROR";

const MAX_LINES = 200;

// Reconnect-replay dedupe: the upstream log streamer replays its recent
// backlog on every SSE (re)connection (silent reconnects happen constantly),
// so duplicates arrive minutes apart. Identity — the event's own ts + tickId
// + formatted text — drops replays exactly; LRU-bounded, far larger than any
// replayed backlog. Mirrors ReallocatorTerminal.
const DEDUPE_CAP = 2000;

// EREBUS tick reorder: flush when tick_start arrives or after TICK_FLUSH_SAFETY_MS
const TICK_FLUSH_SAFETY_MS = 500;
// Order: tick_start → tx_sent → tx_confirmed → error → tick_skip → tick_end
const TICK_TYPE_ORDER: Record<string, number> = {
  tick_start: 0,
  tx_sent: 1,
  tx_confirmed: 2,
  error: 3,
  tick_skip: 4,
  tick_end: 5,
};
function tickTypeOrder(t: string): number {
  return TICK_TYPE_ORDER[t] ?? 6;
}

// Strip ANSI escape codes
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

// Check if line is empty or whitespace-only
function isEmptyLine(line: string): boolean {
  return !line.trim();
}

// Compress long cache market lines
function compressCacheLine(line: string): { compressed: string; original?: string } {
  // Check if it's a cache line with markets (HIT or MISS)
  const isCacheLine = line.includes("[Cache]") && line.includes("markets:");
  if (!isCacheLine) {
    return { compressed: line };
  }

  // If line is already short, return as-is
  if (line.length <= 180) {
    return { compressed: line };
  }

  // Extract HIT or MISS
  const isHit = line.includes("[Cache] HIT:");
  const isMiss = line.includes("[Cache] MISS:");
  
  // Pattern: [Cache] HIT: markets:999:market1,market2,... (expires in NNs)
  // Or: [Cache] MISS: markets:999:market1,market2,... - fetching...
  // Try with chainId first: markets:999:
  let marketsMatch = line.match(/markets:\d+:(.+?)(?:\s*\(expires in (\d+)s\)|\s*- fetching|$)/);
  
  // If no match, try without chainId: markets:
  if (!marketsMatch) {
    marketsMatch = line.match(/markets:(.+?)(?:\s*\(expires in (\d+)s\)|\s*- fetching|$)/);
  }
  
  if (marketsMatch) {
    const marketList = marketsMatch[1].trim();
    const expires = marketsMatch[2];
    const hasFetching = line.includes(" - fetching");
    
    // Count markets: split by comma and filter empty
    let marketCount = 0;
    if (marketList.length > 0) {
      marketCount = marketList.split(",").filter(x => x.trim().length > 0).length;
    }
    
    // Build compressed line
    let compressed: string;
    if (isHit) {
      compressed = `[Cache] HIT: markets: ${marketCount} markets`;
      if (expires) {
        compressed += ` (expires in ${expires}s)`;
      }
    } else if (isMiss) {
      compressed = `[Cache] MISS: markets: ${marketCount} markets`;
      if (hasFetching) {
        compressed += " - fetching...";
      }
    } else {
      compressed = `[Cache] markets: ${marketCount} markets`;
    }
    
    return { compressed, original: line };
  }

  // Fallback: truncate if parsing fails
  const truncated = line.length > 180 ? line.slice(0, 177) + "..." : line;
  return { compressed: `[Cache] (markets) ${truncated}`, original: line };
}

// Extract all tx hashes from a line (0x followed by 64 hex chars)
function extractTxHashes(line: string): string[] {
  const matches = line.match(/0x[a-fA-F0-9]{64}/g);
  return matches || [];
}

// Classify EREBUS log line type
function classifyErebusLine(line: string): LogEntry["level"] {
  const upper = line.toUpperCase();
  
  // Tick header: [T40] BASE(30s) ...
  if (/^\[T\d+\]\s+(BASE|FAST)/i.test(line)) {
    return "TICK";
  }
  
  // Cache lines
  if (line.includes("[Cache]")) {
    return "CACHE";
  }
  
  // Phase indicators
  if (upper.includes("CHECKING") && upper.includes("CANDIDATES")) {
    return "PHASE";
  }
  
  // Batch indicators
  if (/^Batch \d+\/\d+/i.test(line)) {
    return "BATCH";
  }
  
  // Summary/confirmation lines
  if (upper.includes("SUMMARY") || upper.includes("CONFIRMED") || upper.includes("COMPLETE")) {
    return "SUMMARY";
  }
  
  // Success indicators (liquidations)
  if (
    upper.includes("LIQUIDATED") ||
    upper.includes("LIQUIDATION OK") ||
    (upper.includes("TX:") && !upper.includes("FAILED"))
  ) {
    return "SUCCESS";
  }
  
  // Check for "Errors: N" pattern - only ERROR if N > 0
  const errorsMatch = line.match(/^\s*Errors:\s*(\d+)/i);
  if (errorsMatch) {
    const errorCount = parseInt(errorsMatch[1], 10);
    if (errorCount > 0) {
      return "ERROR";
    } else {
      return "INFO"; // "Errors: 0" is INFO, not ERROR
    }
  }
  
  // [DUST] should be INFO, not ERROR
  if (line.includes("[DUST]")) {
    return "INFO";
  }
  
  // "✓ Liquidatable:" should be SUCCESS or PHASE, not ERROR
  if (line.includes("✓") && upper.includes("LIQUIDATABLE")) {
    return "SUCCESS";
  }
  
  // Errors (but not "Errors: 0" which is handled above)
  if (
    (upper.includes("ERROR:") || (upper.includes("ERROR") && !upper.includes("ERRORS:"))) ||
    upper.includes("FAILED") ||
    line.includes("❌") ||
    upper.includes("REVERT") ||
    upper.includes("TRANSACTION FAILED") ||
    upper.includes('STATUS !== "SUCCESS"')
  ) {
    return "ERROR";
  }
  
  // Warnings
  if (upper.includes("WARN")) {
    return "WARN";
  }
  
  return "INFO";
}

// Extract mode from tick line (BASE or FAST)
function extractMode(line: string): string | undefined {
  const match = line.match(/\[T\d+\]\s+(BASE|FAST)/i);
  return match ? match[1].toUpperCase() : undefined;
}

// Extract tick ID from line
function extractTickId(line: string): string | null {
  const match = line.match(/^\[T(\d+)\]/);
  return match ? match[1] : null;
}

// Tick aggregation state
interface TickState {
  tickId: string | null;
  candidatesN: number | null;
  batchesTotal: number | null;
  batchesDone: number | null;
  checkedN: number | null;
  liquidatableN: number | null;
  healthyN: number | null;
  errorsN: number | null;
  elapsedSec: number | null;
  filterPassed: number | null;
  filterCooldown: number | null;
  filterCap: number | null;
  filterDust: number | null;
  liquidatableUsers: string[];
  droppedDust: number;
  droppedCap: number;
  droppedCooldown: number;
  batchProgressLineIndex: number | null; // Index of the batch progress line in the buffer
  summaryDebounceTimer: NodeJS.Timeout | null;
}

// Process log line with compression logic
function processLogLine(
  logEntry: LogEntry,
  verbose: boolean,
  tickState: { current: TickState },
  setLines: (updater: (prev: LogEntry[]) => LogEntry[]) => void
): LogEntry[] | null {
  const line = logEntry.raw;
  const upper = line.toUpperCase();
  
  // Detect new tick
  const tickId = extractTickId(line);
  if (tickId && tickId !== tickState.current.tickId) {
    // Emit any pending aggregated lines before resetting
    const pendingLines: LogEntry[] = [];
    
    // Emit dropped counts if any
    if (!verbose && (tickState.current.droppedDust > 0 || tickState.current.droppedCap > 0 || tickState.current.droppedCooldown > 0)) {
      const droppedParts: string[] = [];
      if (tickState.current.droppedDust > 0) droppedParts.push(`dust=${tickState.current.droppedDust}`);
      if (tickState.current.droppedCap > 0) droppedParts.push(`cap=${tickState.current.droppedCap}`);
      if (tickState.current.droppedCooldown > 0) droppedParts.push(`cooldown=${tickState.current.droppedCooldown}`);
      if (droppedParts.length > 0) {
        pendingLines.push({
          ...logEntry,
          level: "INFO",
          message: `Dropped: ${droppedParts.join(" ")}`,
          txHashes: [],
        });
      }
    }
    
    // Reset tick state
    tickState.current = {
      tickId,
      candidatesN: null,
      batchesTotal: null,
      batchesDone: null,
      checkedN: null,
      liquidatableN: null,
      healthyN: null,
      errorsN: null,
      elapsedSec: null,
      filterPassed: null,
      filterCooldown: null,
      filterCap: null,
      filterDust: null,
      liquidatableUsers: [],
      droppedDust: 0,
      droppedCap: 0,
      droppedCooldown: 0,
      batchProgressLineIndex: null,
      summaryDebounceTimer: null,
    };
    
    // Emit tick line
    return [...pendingLines, logEntry];
  }
  
  // Drop cache lines when not verbose
  if (!verbose && logEntry.level === "CACHE") {
    return null;
  }
  
  // Handle "Checking N candidates..."
  if (upper.includes("CHECKING") && upper.includes("CANDIDATES")) {
    const match = line.match(/Checking\s+(\d+)\s+candidates/i);
    if (match) {
      tickState.current.candidatesN = parseInt(match[1], 10);
    }
    return verbose ? [logEntry] : [logEntry]; // Always show
  }
  
  // Handle batch progress
  const batchMatch = line.match(/^Batch\s+(\d+)\/(\d+)/i);
  if (batchMatch) {
    tickState.current.batchesDone = parseInt(batchMatch[1], 10);
    tickState.current.batchesTotal = parseInt(batchMatch[2], 10);
    
    if (!verbose) {
      // Create/update batch progress line
      const batchProgressEntry: LogEntry = {
        ...logEntry,
        level: "PHASE",
        message: `Batches: ${tickState.current.batchesDone}/${tickState.current.batchesTotal}`,
        isBatchProgress: true,
      };
      
      // Replace existing batch progress line or add new one
      setLines((prev) => {
        const newLines = [...prev];
        if (tickState.current.batchProgressLineIndex !== null && 
            tickState.current.batchProgressLineIndex < newLines.length &&
            newLines[tickState.current.batchProgressLineIndex].isBatchProgress) {
          // Replace existing
          newLines[tickState.current.batchProgressLineIndex] = batchProgressEntry;
          return newLines;
        } else {
          // Add new and track index
          newLines.push(batchProgressEntry);
          tickState.current.batchProgressLineIndex = newLines.length - 1;
          return newLines.slice(-MAX_LINES);
        }
      });
      return null; // Don't add the original batch line
    }
    return [logEntry]; // Verbose mode: show original
  }
  
  // Handle confirmation summary fields
  const checkedMatch = line.match(/Checked:\s*(\d+)\/(\d+)/i);
  if (checkedMatch) {
    tickState.current.checkedN = parseInt(checkedMatch[1], 10);
  }
  
  const liquidatableMatch = line.match(/Liquidatable:\s*(\d+)/i);
  if (liquidatableMatch) {
    tickState.current.liquidatableN = parseInt(liquidatableMatch[1], 10);
  }
  
  const healthyMatch = line.match(/Healthy:\s*(\d+)/i);
  if (healthyMatch) {
    tickState.current.healthyN = parseInt(healthyMatch[1], 10);
  }
  
  const errorsMatch = line.match(/Errors:\s*(\d+)/i);
  if (errorsMatch) {
    tickState.current.errorsN = parseInt(errorsMatch[1], 10);
  }
  
  const elapsedMatch = line.match(/in\s+([\d.]+)s/i);
  if (elapsedMatch) {
    tickState.current.elapsedSec = parseFloat(elapsedMatch[1]);
  }
  
  // Emit aggregated summary when we have all fields or after debounce
  if (tickState.current.checkedN !== null && 
      tickState.current.liquidatableN !== null && 
      tickState.current.healthyN !== null && 
      tickState.current.errorsN !== null &&
      tickState.current.elapsedSec !== null) {
    
    if (tickState.current.summaryDebounceTimer) {
      clearTimeout(tickState.current.summaryDebounceTimer);
    }
    
    tickState.current.summaryDebounceTimer = setTimeout(() => {
      const summaryParts: string[] = [];
      if (tickState.current.checkedN !== null) summaryParts.push(`Checked ${tickState.current.checkedN}`);
      if (tickState.current.liquidatableN !== null) summaryParts.push(`Liquidatable ${tickState.current.liquidatableN}`);
      if (tickState.current.healthyN !== null) summaryParts.push(`Healthy ${tickState.current.healthyN}`);
      if (tickState.current.errorsN !== null) summaryParts.push(`Errors ${tickState.current.errorsN}`);
      if (tickState.current.elapsedSec !== null) summaryParts.push(`${tickState.current.elapsedSec.toFixed(1)}s`);
      
      const summaryEntry: LogEntry = {
        ...logEntry,
        level: "SUMMARY",
        message: summaryParts.join(" · "),
        txHashes: [],
      };
      
      setLines((prev) => {
        const newLines = [...prev, summaryEntry];
        return newLines.slice(-MAX_LINES);
      });
    }, 100);
    
    // Don't emit individual summary lines in non-verbose mode
    if (!verbose && (checkedMatch || liquidatableMatch || healthyMatch || errorsMatch || elapsedMatch)) {
      return null;
    }
  }
  
  // Handle filter summary
  const filterMatch = line.match(/\[Filter\]\s*Summary:/i);
  if (filterMatch) {
    const passedMatch = line.match(/passed\s*(\d+)/i);
    const cooldownMatch = line.match(/cooldown\s*(\d+)/i);
    const capMatch = line.match(/cap\s*(\d+)/i);
    const dustMatch = line.match(/dust\s*(\d+)/i);
    
    if (passedMatch) tickState.current.filterPassed = parseInt(passedMatch[1], 10);
    if (cooldownMatch) tickState.current.filterCooldown = parseInt(cooldownMatch[1], 10);
    if (capMatch) tickState.current.filterCap = parseInt(capMatch[1], 10);
    if (dustMatch) tickState.current.filterDust = parseInt(dustMatch[1], 10);
    
    if (!verbose) {
      const filterParts: string[] = [];
      if (tickState.current.filterPassed !== null) filterParts.push(`passed ${tickState.current.filterPassed}`);
      if (tickState.current.filterCooldown !== null) filterParts.push(`cooldown ${tickState.current.filterCooldown}`);
      if (tickState.current.filterCap !== null) filterParts.push(`cap ${tickState.current.filterCap}`);
      if (tickState.current.filterDust !== null) filterParts.push(`dust ${tickState.current.filterDust}`);
      
      return [{
        ...logEntry,
        level: "SUMMARY",
        message: `Filter: ${filterParts.join(" · ")}`,
        txHashes: [],
      }];
    }
  }
  
  // Handle liquidatable users (always show)
  if (line.includes("✓") && upper.includes("LIQUIDATABLE")) {
    tickState.current.liquidatableUsers.push(line);
    return [logEntry];
  }
  
  // Handle dropped reasons (aggregate in non-verbose)
  if (!verbose) {
    if (line.includes("[DUST]")) {
      tickState.current.droppedDust++;
      return null;
    }
    if (upper.includes("CAP") && (upper.includes("EXCEEDED") || upper.includes("LIMIT"))) {
      tickState.current.droppedCap++;
      return null;
    }
    if (upper.includes("COOLDOWN")) {
      tickState.current.droppedCooldown++;
      return null;
    }
  }
  
  // Always show tx actions
  if (upper.includes("SENT") || upper.includes("SUCCESS") || upper.includes("FAIL") || logEntry.txHashes.length > 0) {
    return [logEntry];
  }
  
  // Default: show in verbose, drop in non-verbose for unknown lines
  return verbose ? [logEntry] : null;
}

function parseLogLine(line: string, receiveTime: Date): LogEntry {
  let message = line;
  let mode: string | undefined;
  let compressedOriginal: string | undefined;

  // Extract timestamp (ISO format: 2026-01-10T...)
  // If present, use it; otherwise use receiveTime
  let ts = receiveTime;
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\s+/);
  if (timestampMatch) {
    try {
      ts = new Date(timestampMatch[1]);
      message = line.slice(timestampMatch[0].length);
    } catch {
      // If parsing fails, use receiveTime
      ts = receiveTime;
    }
  }

  // Compress cache lines
  const compressionResult = compressCacheLine(message);
  message = compressionResult.compressed;
  if (compressionResult.original && compressionResult.original !== compressionResult.compressed) {
    compressedOriginal = compressionResult.original;
  }

  // Extract mode from tick lines (use original message before compression for mode detection)
  mode = extractMode(line);

  // Extract tx hashes (from compressed message)
  const txHashes = extractTxHashes(message);

  // Classify line type (use original line for classification to avoid false positives)
  const level = classifyErebusLine(line);

  return {
    ts,
    level,
    message,
    txHashes,
    raw: line,
    mode,
    compressedOriginal,
  };
}

function formatTimestamp(ts: Date): string {
  try {
    const hours = ts.getHours().toString().padStart(2, "0");
    const minutes = ts.getMinutes().toString().padStart(2, "0");
    const seconds = ts.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  } catch {
    return "--:--:--";
  }
}

function getLevelColor(level: LogEntry["level"]): string {
  switch (level) {
    case "SUCCESS":
      return "text-success";
    case "ERROR":
      return "text-danger";
    case "WARN":
      return "text-gold";
    case "DEBUG":
      return "text-text-dim";
    case "TICK":
      return "text-gold font-bold";
    case "PHASE":
      return "text-text";
    case "BATCH":
      return "text-text";
    case "SUMMARY":
      return "text-success";
    case "CACHE":
      return "text-text-dim";
    case "INFO":
    default:
      return "text-text";
  }
}

function getStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case "LIVE":
      return "text-success";
    case "ERROR":
      return "text-danger";
    case "RECONNECTING":
      return "text-gold";
    case "CONNECTING":
    default:
      return "text-text-dim";
  }
}

interface ErebusTerminalProps {
  className?: string;
}

export function ErebusTerminal({ className }: ErebusTerminalProps) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>("CONNECTING");
  const [hasStructuredEvents, setHasStructuredEvents] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorCountRef = useRef(0);
  const pausedRef = useRef(paused);
  // LRU of structured-event identity keys; presence = reconnect-replay dupe.
  const seenKeysRef = useRef<Map<string, number>>(new Map());
  const tickStateRef = useRef<TickState>({
    tickId: null,
    candidatesN: null,
    batchesTotal: null,
    batchesDone: null,
    checkedN: null,
    liquidatableN: null,
    healthyN: null,
    errorsN: null,
    elapsedSec: null,
    filterPassed: null,
    filterCooldown: null,
    filterCap: null,
    filterDust: null,
    liquidatableUsers: [],
    droppedDust: 0,
    droppedCap: 0,
    droppedCooldown: 0,
    batchProgressLineIndex: null,
    summaryDebounceTimer: null,
  });
  // Per-tick reorder buffer: tickId -> [{ entry, type, ts }]; tick_end before tick_start is buffered until tick_start or 500ms
  const tickBufferRef = useRef<Map<string, Array<{ entry: LogEntry; type: string; ts: string }>>>(new Map());
  const tickTimerRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Keep pausedRef in sync
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoscroll && !paused && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines, autoscroll, paused]);

  // Connect to SSE stream
  const connect = useCallback(() => {
    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setStatus("CONNECTING");
    // Add cache-busting query param to force fresh connection
    const cacheBuster = Date.now();
    const eventSource = new EventSource(`/api/logs/erebus/stream?t=${cacheBuster}`);

    eventSource.onopen = () => {
      setStatus("LIVE");
      errorCountRef.current = 0;
    };

    // Shared handler for all event types
    const handleLine = (rawData: string | null) => {
      if (pausedRef.current || !rawData) return;

      // Defensive: strip leading "data:" if present
      let data = typeof rawData === "string" ? rawData : String(rawData);
      if (data.startsWith("data:")) {
        data = data.slice(5).trim();
      }

      // Strip ANSI codes
      const stripped = stripAnsi(data.trim());
      
      // Drop empty lines
      if (isEmptyLine(stripped)) {
        return;
      }

      // Try to parse as JSONL structured event
      const jsonlResult = tryParseJsonEvent(stripped);
      if (jsonlResult.ok && jsonlResult.evt) {
        const evt = jsonlResult.evt;
        const formatted = formatEvent(evt);

        // Drop reconnect-replayed events before they reach the tick buffers.
        const dedupeKey = [
          evt.type,
          evt.ts || "",
          evt.txHash || "",
          evt.tickId || "",
          formatted.title,
          formatted.subtitle || "",
        ]
          .join("|")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 300);
        if (seenKeysRef.current.has(dedupeKey)) {
          // refresh recency so a long replay can't evict its own head
          seenKeysRef.current.delete(dedupeKey);
          seenKeysRef.current.set(dedupeKey, Date.now());
          return;
        }
        seenKeysRef.current.set(dedupeKey, Date.now());
        if (seenKeysRef.current.size > DEDUPE_CAP) {
          const first = seenKeysRef.current.keys().next();
          if (!first.done) seenKeysRef.current.delete(first.value);
        }

        const receiveTime = new Date(evt.ts);

        const structuredEntry: LogEntry = {
          ts: receiveTime,
          level: formatted.level,
          message: formatted.title,
          txHashes: formatted.txHash ? [formatted.txHash] : [],
          raw: stripped,
          isStructured: true,
          structuredTitle: formatted.title,
          structuredSubtitle: formatted.subtitle,
          structuredTickId: formatted.tickId,
        };

        const tickId = evt.tickId;
        const type = evt.type;
        const ts = evt.ts;

        // No tickId: pass through (legacy or unkeyed)
        if (!tickId) {
          setHasStructuredEvents(true);
          setLines((prev) => [...prev, structuredEntry].slice(-MAX_LINES));
          return;
        }

        if (type === "tick_start") {
          // Clear safety timer; add tick_start, sort, flush, clear buffer
          const t = tickTimerRef.current.get(tickId);
          if (t) {
            clearTimeout(t);
            tickTimerRef.current.delete(tickId);
          }
          let buf = tickBufferRef.current.get(tickId) ?? [];
          buf = [...buf, { entry: structuredEntry, type, ts }];
          buf.sort((a, b) => tickTypeOrder(a.type) - tickTypeOrder(b.type) || (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
          setLines((prev) => [...prev, ...buf.map((b) => b.entry)].slice(-MAX_LINES));
          tickBufferRef.current.delete(tickId);
          setHasStructuredEvents(true);
          return;
        }

        // Buffer tick_end / tx_sent / tx_confirmed / error / tick_skip until tick_start or 500ms
        let buf = tickBufferRef.current.get(tickId) ?? [];
        const wasEmpty = buf.length === 0;
        buf = [...buf, { entry: structuredEntry, type, ts }];
        tickBufferRef.current.set(tickId, buf);

        if (wasEmpty) {
          const tm = setTimeout(() => {
            const b = tickBufferRef.current.get(tickId) ?? [];
            tickBufferRef.current.delete(tickId);
            tickTimerRef.current.delete(tickId);
            if (b.length === 0) return;
            const sorted = [...b].sort(
              (a, b) => tickTypeOrder(a.type) - tickTypeOrder(b.type) || (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)
            );
            setLines((prev) => [...prev, ...sorted.map((s) => s.entry)].slice(-MAX_LINES));
          }, TICK_FLUSH_SAFETY_MS);
          tickTimerRef.current.set(tickId, tm);
        }

        setHasStructuredEvents(true);
        return;
      }

      // Legacy text processing
      // Suppress noise lines if structured events have been seen
      if (hasStructuredEvents && isLegacyNoiseLine(stripped)) {
        return;
      }

      // Parse the line with receive timestamp
      const receiveTime = new Date();
      const logEntry = parseLogLine(stripped, receiveTime);
      
      // Process with compression logic
      const processedLines = processLogLine(logEntry, false, tickStateRef, setLines);
      if (processedLines && processedLines.length > 0) {
        setLines((prev) => {
          const newLines = [...prev, ...processedLines];
          // Keep only last MAX_LINES
          return newLines.slice(-MAX_LINES);
        });
      }
    };

    // Handle 'hello' event (connection status)
    eventSource.addEventListener("hello", (event: MessageEvent) => {
      setStatus("LIVE");
      errorCountRef.current = 0;
      
      // Optionally show connection message
      const helloData = event.data?.trim();
      if (helloData) {
        const receiveTime = new Date();
        const helloEntry: LogEntry = {
          ts: receiveTime,
          level: "INFO",
          message: `connected: ${helloData}`,
          txHashes: [],
          raw: helloData,
        };
        setLines((prev) => {
          const newLines = [...prev, helloEntry];
          return newLines.slice(-MAX_LINES);
        });
      }
    });

    // Handle 'log' event type (primary for our streamers)
    eventSource.addEventListener("log", (event: MessageEvent) => {
      handleLine(event.data);
    });

    // Handle default 'message' events as fallback
    eventSource.onmessage = (event) => {
      handleLine(event.data);
    };

    eventSource.onerror = () => {
      errorCountRef.current += 1;
      
      // If multiple errors, treat as ERROR, otherwise RECONNECTING
      if (errorCountRef.current > 3) {
        setStatus("ERROR");
        eventSource.close();
      } else {
        setStatus("RECONNECTING");
        // EventSource will auto-reconnect, but we can also manually trigger
        reconnectTimeoutRef.current = setTimeout(() => {
          if (eventSource.readyState === EventSource.CLOSED) {
            connect();
          }
        }, 1000);
      }
    };

    eventSourceRef.current = eventSource;

    return () => {
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Initialize connection
  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  const handlePause = () => {
    setPaused((prev) => !prev);
  };

  const handleClear = () => {
    setLines([]);
  };

  const handleToggleAutoscroll = () => {
    setAutoscroll((prev) => !prev);
  };

  // Get current mode from latest tick line
  const currentMode = lines
    .slice()
    .reverse()
    .find((line) => line.mode)?.mode;

  return (
    <div className={cn("bg-bg-base/50 flex flex-col overflow-hidden h-full", className)}>
      {/* Header with controls */}
      <div className="border-b border-border/50 px-2 py-1 flex items-center justify-between bg-panel/30">
        <div className="flex items-center gap-2">
          <span className={cn("text-[8px] uppercase tracking-wider font-mono", getStatusColor(status))}>
            {status}
          </span>
          {currentMode && (
            <>
              <span className="text-text-dim">|</span>
              <span className="text-[8px] uppercase tracking-wider font-mono text-gold">
                {currentMode}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePause}
            className="text-[8px] uppercase tracking-wider font-mono text-text-dim hover:text-text transition-colors"
            type="button"
          >
            {paused ? "Resume" : "Pause"}
          </button>
          <span className="text-text-dim">|</span>
          <button
            onClick={handleClear}
            className="text-[8px] uppercase tracking-wider font-mono text-text-dim hover:text-text transition-colors"
            type="button"
          >
            Clear
          </button>
          <span className="text-text-dim">|</span>
          <button
            onClick={handleToggleAutoscroll}
            className={cn(
              "text-[8px] uppercase tracking-wider font-mono transition-colors",
              autoscroll ? "text-success" : "text-text-dim hover:text-text"
            )}
            type="button"
          >
            Auto-scroll
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-[10px] leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-text-dim/50">Waiting for logs...</div>
        ) : (
          lines.map((log, idx) => {
            // Render structured events differently
            if (log.isStructured) {
              return (
                <div key={idx} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                  <span className="text-text-dim shrink-0">{formatTimestamp(log.ts)}</span>
                  <span className={cn("shrink-0 font-bold", getLevelColor(log.level))}>
                    [{log.level}]
                  </span>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="text-text break-words min-w-0">{log.structuredTitle}</span>
                    {log.structuredSubtitle && (
                      <span className="text-text-dim text-[9px] break-words min-w-0">
                        {log.structuredSubtitle}
                      </span>
                    )}
                  </div>
                  {log.txHashes.length > 0 && (
                    <div className="flex flex-wrap gap-x-1 shrink-0">
                      {log.txHashes.map((hash, hashIdx) => (
                        <a
                          key={hashIdx}
                          href={getTxExplorerUrl(hash, 999)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[9px] text-gold hover:text-gold/80 hover:underline"
                        >
                          {hash.slice(0, 6)}…{hash.slice(-4)}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Legacy text rendering
            return (
              <div key={idx} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                <span className="text-text-dim shrink-0">{formatTimestamp(log.ts)}</span>
                <span className={cn("shrink-0 font-bold", getLevelColor(log.level))}>
                  [{log.level}]
                </span>
                <span 
                  className="text-text break-words min-w-0 whitespace-pre-wrap"
                  title={log.compressedOriginal || undefined}
                >
                  {log.message}
                </span>
                {log.txHashes.length > 0 && (
                  <div className="flex flex-wrap gap-x-1 shrink-0">
                    {log.txHashes.map((hash, hashIdx) => (
                      <a
                        key={hashIdx}
                        href={getTxExplorerUrl(hash, 999)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[9px] text-gold hover:text-gold/80 hover:underline"
                      >
                        {hash.slice(0, 6)}…{hash.slice(-4)}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
