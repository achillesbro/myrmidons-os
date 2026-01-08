"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Simple seeded PRNG (xorshift32) for deterministic randomness
 */
class SeededRNG {
  private state: number;

  constructor(seed: number | string) {
    // Convert string seed to number
    if (typeof seed === "string") {
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      this.state = hash || 1;
    } else {
      this.state = seed || 1;
    }
  }

  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x;
    return (x >>> 0) / 0xffffffff; // Convert to [0, 1)
  }

  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice<T>(arr: T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }
}

interface TerminalScrollLoaderProps {
  height?: number;
  className?: string;
  linesVisible?: number;
  speedMs?: number;
  jitter?: boolean;
  title?: string;
  seed?: string | number;
  variant?: "chart" | "table" | "panel";
}

// Line templates for different variants
const LINE_TEMPLATES = {
  chart: [
    "> fetch vault metrics --source api --ok",
    "> index snapshots ... done",
    "> compute weights ... {ms}ms",
    "> hydrate chart series ... {pts} pts",
    "> normalize decimals ... USDT0={decimals}",
    "> verify checksum ... ok",
    "> rpc_call eth_call ... {code}",
    "> parse allocations ... {count} markets",
    "> render chart ... columns={cols}",
    "> cache hit ... ttl={ttl}s",
    "> aggregate timeseries ... {pts} points",
    "> transform data ... {ms}ms",
  ],
  table: [
    "> fetch allocations --source api --ok",
    "> parse market data ... {count} rows",
    "> compute weights ... {ms}ms",
    "> normalize decimals ... done",
    "> verify checksum ... ok",
    "> render table ... columns={cols}",
    "> cache hit ... ttl={ttl}s",
    "> sort rows ... {ms}ms",
    "> format values ... done",
    "> index snapshots ... done",
    "> compute utilization ... {ms}ms",
    "> hydrate table data ... {rows} rows",
  ],
  panel: [
    "> fetch panel data --source api --ok",
    "> index snapshots ... done",
    "> compute metrics ... {ms}ms",
    "> normalize data ... done",
    "> verify checksum ... ok",
    "> render panel ... components={count}",
    "> cache hit ... ttl={ttl}s",
    "> aggregate data ... {ms}ms",
    "> transform values ... done",
    "> hydrate components ... done",
  ],
};

// Token generators
function generateTokens(rng: SeededRNG): Record<string, string> {
  const hexChars = "0123456789abcdef";
  const hex = () => {
    let result = "0x";
    for (let i = 0; i < rng.int(4, 8); i++) {
      result += rng.choice(hexChars.split(""));
    }
    return result;
  };

  return {
    ms: rng.int(0, 500).toString() + "." + rng.int(0, 99).toString().padStart(2, "0"),
    pts: rng.int(50, 500).toString(),
    decimals: rng.int(6, 18).toString(),
    code: rng.int(200, 299).toString(),
    count: rng.int(1, 20).toString(),
    cols: rng.int(4, 8).toString(),
    ttl: rng.int(10, 60).toString(),
    rows: rng.int(5, 50).toString(),
    id: rng.int(1000, 9999).toString(),
    block: rng.int(1000000, 9999999).toString(),
    bps: rng.int(100, 10000).toString(),
  };
}

function generateLine(rng: SeededRNG, variant: "chart" | "table" | "panel"): string {
  const templates = LINE_TEMPLATES[variant];
  const template = rng.choice(templates);
  const tokens = generateTokens(rng);
  
  // Replace tokens in template
  return template.replace(/\{(\w+)\}/g, (_, key) => tokens[key] || "");
}

/**
 * Terminal scroll loader for heavy components (charts, tables, panels).
 * 
 * Usage:
 * - Replace loading placeholders in chart/table/panel containers
 * - Do NOT use for inline text values (use GlitchTypeText instead)
 * 
 * Behavior:
 * - Scrolls terminal-like lines upward continuously
 * - Uses seeded PRNG for deterministic randomness
 * - Respects prefers-reduced-motion (shows static lines)
 * - Fixed height to prevent layout shift
 */
export function TerminalScrollLoader({
  height,
  className,
  linesVisible = 9,
  speedMs = 100,
  jitter = true,
  title = "TERMINAL",
  seed = "default",
  variant = "chart",
}: TerminalScrollLoaderProps) {
  const [lines, setLines] = useState<string[]>([]);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const rngRef = useRef<SeededRNG | null>(null);
  const bufferRef = useRef<string[]>([]);

  // Initialize RNG and detect reduced motion
  useEffect(() => {
    rngRef.current = new SeededRNG(seed);
    
    // Check for reduced motion preference
    let shouldReduceMotion = false;
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      shouldReduceMotion = mediaQuery.matches;
      setPrefersReducedMotion(shouldReduceMotion);
    }

    // Initialize buffer with some lines
    const initialLines: string[] = [];
    const bufferSize = Math.max(30, linesVisible * 3);
    
    for (let i = 0; i < bufferSize; i++) {
      initialLines.push(generateLine(rngRef.current, variant));
    }
    bufferRef.current = initialLines;
    setLines(initialLines.slice(-linesVisible));

    // If reduced motion, stop here (no animation)
    if (shouldReduceMotion) {
      return;
    }

    // Start scrolling animation
    intervalRef.current = setInterval(() => {
      if (!rngRef.current) return;

      // Jitter: occasionally skip a tick
      if (jitter && rngRef.current.next() < 0.1) {
        return;
      }

      // Generate new line and add to buffer
      const newLine = generateLine(rngRef.current, variant);
      bufferRef.current.push(newLine);

      // Keep buffer size manageable (ring buffer behavior)
      if (bufferRef.current.length > 50) {
        bufferRef.current.shift();
      }

      // Update displayed lines (last N lines)
      setLines(bufferRef.current.slice(-linesVisible));
    }, speedMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [seed, variant, linesVisible, speedMs, jitter]);

  return (
    <div
      className={cn(
        "border border-border bg-bg-base/50 flex flex-col overflow-hidden",
        className
      )}
      style={height ? { height: `${height}px` } : undefined}
    >
      {/* Terminal header */}
      <div className="border-b border-border/50 px-2 py-1 flex items-center justify-between bg-panel/30">
        <span className="text-[9px] uppercase tracking-wider font-mono text-text-dim">
          [{title}]
        </span>
        <span className="text-[8px] uppercase tracking-wider font-mono text-success">
          {prefersReducedMotion ? "READY" : "RUNNING"}
        </span>
      </div>

      {/* Terminal body */}
      <div className="flex-1 overflow-hidden p-2 font-mono text-[10px] leading-relaxed">
        <div className="h-full flex flex-col justify-end">
          {lines.map((line, idx) => (
            <div
              key={`${line}-${idx}`}
              className="text-text-dim/70 whitespace-pre"
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
