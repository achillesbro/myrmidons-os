"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface LogEntry {
  timestamp: string | null;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG" | "SUCCESS";
  message: string;
  txHash: string | null;
  raw: string;
}

type ConnectionStatus = "CONNECTING" | "LIVE" | "RECONNECTING" | "ERROR";

const MAX_LINES = 500;

// Strip ANSI escape codes
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

// Check if line is empty or whitespace-only
function isEmptyLine(line: string): boolean {
  return !line.trim();
}

// Check if line is pure box/table drawing
function isBoxDrawingLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[╔╗╚╝║═─]+$/.test(trimmed);
}

// Check if line is a separator (runs of = or -)
function isSeparatorLine(line: string): boolean {
  const trimmed = line.trim();
  return /^=+$/.test(trimmed) || /^-+$/.test(trimmed) || /[─═]{10,}/.test(line);
}

// Check if line is a table header/separator
function isTableLine(line: string): boolean {
  const upper = line.toUpperCase();
  return (
    (upper.includes("MARKET") && upper.includes("|")) ||
    line.includes("|------------|") ||
    line.includes("Alloc %")
  );
}

// Check if line should be kept (ops + decisions view)
function shouldKeepLine(line: string): boolean {
  const upper = line.toUpperCase();
  
  // Always keep errors and warnings
  if (upper.includes("ERROR") || upper.includes("WARN")) {
    return true;
  }
  
  // A) Tick / phase (ops)
  if (
    upper.includes("TICK ") ||
    line.startsWith("PHASES:") ||
    line.startsWith("PHASE:") ||
    upper.includes("WAITING FOR NEXT TICK") ||
    line.startsWith("intervalSec:") ||
    line.startsWith("Timestamp:") ||
    line.startsWith("Chain:") ||
    line.startsWith("Vault:") ||
    line.startsWith("Mode:")
  ) {
    return true;
  }
  
  // B) Key metrics (ops)
  if (
    line.startsWith("TVL:") ||
    line.startsWith("Idle:") ||
    line.startsWith("Current Weighted APY:") ||
    line.startsWith("Coverage") ||
    line.startsWith("Idle Target:")
  ) {
    return true;
  }
  
  // C) Decisions / outcomes (decisions)
  if (
    line.startsWith("setSupplyQueue:") ||
    line.startsWith("updateWithdrawQueue:") ||
    line.startsWith("reallocate:") ||
    line.startsWith("Expected Weighted APY:") ||
    line.startsWith("Expected Idle:") ||
    line.startsWith("Tick Duration:") ||
    line.startsWith("Next Scheduled Run:") ||
    line.startsWith("Reallocation Cooldown:")
  ) {
    return true;
  }
  
  return false;
}

// Check if line is a continuation line (2+ leading spaces or tab)
function isContinuationLine(line: string): boolean {
  return line.startsWith("  ") || line.startsWith("\t") || /^\s{2,}/.test(line);
}

function parseLogLine(line: string): LogEntry {
  let timestamp: string | null = null;
  let level: LogEntry["level"] = "INFO";
  let message = line;
  let txHash: string | null = null;

  // Extract timestamp (ISO format: 2026-01-10T...)
  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)\s+/);
  if (timestampMatch) {
    timestamp = timestampMatch[1];
    message = line.slice(timestampMatch[0].length);
  }

  // Extract txHash (64-character hex after 0x)
  const txHashMatch = message.match(/0x[a-fA-F0-9]{64}/);
  if (txHashMatch) {
    txHash = txHashMatch[0];
  }

  // Detect level (case-insensitive, after ANSI stripping)
  const upperLine = message.toUpperCase();
  if (upperLine.includes("ERROR")) {
    level = "ERROR";
  } else if (upperLine.includes("WARN")) {
    level = "WARN";
  } else if (upperLine.includes("DEBUG")) {
    level = "DEBUG";
  } else if (upperLine.includes("APPLY") || upperLine.includes("✓")) {
    level = "SUCCESS";
  } else {
    level = "INFO";
  }

  return {
    timestamp,
    level,
    message,
    txHash,
    raw: line,
  };
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return "--:--:--";
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
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

interface ReallocatorTerminalProps {
  className?: string;
}

export function ReallocatorTerminal({ className }: ReallocatorTerminalProps) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [autoscroll, setAutoscroll] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus>("CONNECTING");
  const eventSourceRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorCountRef = useRef(0);
  const pausedRef = useRef(paused);

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
    const eventSource = new EventSource(`/api/logs/stream?t=${cacheBuster}`);

    eventSource.onopen = () => {
      setStatus("LIVE");
      errorCountRef.current = 0;
    };

    eventSource.onmessage = (event) => {
      if (pausedRef.current) return;

      // Strip ANSI codes first
      const stripped = stripAnsi(event.data);
      
      // Drop empty lines
      if (isEmptyLine(stripped)) {
        return;
      }
      
      // Drop noise lines
      if (isBoxDrawingLine(stripped) || isSeparatorLine(stripped) || isTableLine(stripped)) {
        return;
      }
      
      // Only keep ops + decisions signals
      if (!shouldKeepLine(stripped)) {
        return;
      }

      // Parse the line
      const logEntry = parseLogLine(stripped);
      
      setLines((prev) => {
        let newLines = [...prev];
        
        // Check if this is a continuation line
        if (isContinuationLine(stripped) && newLines.length > 0) {
          // Merge with previous entry
          const lastEntry = newLines[newLines.length - 1];
          newLines[newLines.length - 1] = {
            ...lastEntry,
            message: lastEntry.message + "\n" + stripped.trim(),
            // Keep the original timestamp from the first line
          };
        } else {
          // New entry
          newLines.push(logEntry);
        }
        
        // Keep only last MAX_LINES
        return newLines.slice(-MAX_LINES);
      });
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

  return (
    <div className={cn("bg-bg-base/50 flex flex-col overflow-hidden h-full", className)}>
      {/* Header with controls */}
      <div className="border-b border-border/50 px-2 py-1 flex items-center justify-between bg-panel/30">
        <div className="flex items-center gap-2">
          <span className={cn("text-[8px] uppercase tracking-wider font-mono", getStatusColor(status))}>
            {status}
          </span>
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
          lines.map((log, idx) => (
            <div key={idx} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
              <span className="text-text-dim shrink-0">{formatTimestamp(log.timestamp)}</span>
              <span className={cn("shrink-0 font-bold", getLevelColor(log.level))}>
                [{log.level}]
              </span>
              <span className="text-text break-words min-w-0 whitespace-pre-wrap">{log.message}</span>
              {log.txHash && (
                <span className="font-mono text-[9px] text-gold shrink-0">
                  {log.txHash.slice(0, 6)}…{log.txHash.slice(-4)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
