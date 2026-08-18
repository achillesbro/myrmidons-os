"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { tryParseJsonEvent, formatEvent, type FormattedEvent } from "@/lib/logs/jsonl";

/**
 * Read-only strip of the HEGEMON_V2 keeper stream for the landing's
 * OBSERVABILITY section. Deliberately much smaller than ReallocatorTerminal:
 * structured JSONL events only (raw keeper text and legacy lines are
 * dropped), no pause/expand controls, last few events, newest at the bottom.
 * Both V2 vaults ride the same stream, so no vault filter — every event on
 * it is ours.
 */

interface FeedLine {
  key: string;
  ts: string | null;
  formatted: FormattedEvent;
}

type FeedStatus = "CONNECTING" | "LIVE" | "RECONNECTING";

const MAX_LINES = 6;
const DEDUPE_CAP = 500;

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
// HEGEMON docker-log RFC3339 prefix ("2026-01-16T13:15:35.918534290Z ")
const DOCKER_TS_RE = /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z?\s+/;

const LEVEL_CLASS: Record<FormattedEvent["level"], string> = {
  ERROR: "text-danger",
  WARN: "text-gold",
  SUCCESS: "text-success",
  TICK: "text-text-dim",
  PHASE: "text-text-dim",
  DEBUG: "text-text-dim",
  INFO: "text-text",
  BATCH: "text-text",
  SUMMARY: "text-text",
};

function fmtClock(ts: string | null): string {
  if (!ts) return "--:--:--";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toISOString().slice(11, 19);
}

export function LandingFeed({ className }: { className?: string }) {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const [status, setStatus] = useState<FeedStatus>("CONNECTING");
  // The upstream streamer replays its backlog on every (re)connection, so
  // dedupe by event identity, same idea as ReallocatorTerminal.
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const source = new EventSource(`/api/logs/hegemon-v2/stream?t=${Date.now()}`);

    const handleLine = (raw: string) => {
      const cleaned = raw.replace(ANSI_RE, "").replace(DOCKER_TS_RE, "").trim();
      if (!cleaned) return;
      const parsed = tryParseJsonEvent(cleaned);
      if (!parsed.ok || !parsed.evt) return;
      const evt = parsed.evt;
      // Per-tick shadow dataset for downstream ingestion — never for humans.
      if (evt.type === "scores") return;
      const formatted = formatEvent(evt);
      const key = [evt.type, evt.ts ?? "", evt.tickId ?? "", formatted.title, formatted.subtitle ?? ""]
        .join("|")
        .slice(0, 300);
      if (seenRef.current.has(key)) return;
      seenRef.current.add(key);
      if (seenRef.current.size > DEDUPE_CAP) {
        const first = seenRef.current.values().next();
        if (!first.done) seenRef.current.delete(first.value);
      }
      setLines((prev) => [...prev, { key, ts: evt.ts ?? null, formatted }].slice(-MAX_LINES));
    };

    source.onopen = () => setStatus("LIVE");
    source.addEventListener("hello", () => setStatus("LIVE"));
    source.addEventListener("log", (e: MessageEvent) => handleLine(String(e.data)));
    source.onmessage = (e) => handleLine(String(e.data));
    source.onerror = () => setStatus("RECONNECTING");

    return () => source.close();
  }, []);

  return (
    <div className={cn("border border-border/60 bg-bg-base", className)}>
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
          TERMINAL // LIVE_FEED — HEGEMON_V2
        </span>
        <span
          className={cn(
            "flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest font-mono",
            status === "LIVE" ? "text-success" : "text-gold"
          )}
        >
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              status === "LIVE" ? "bg-success animate-pulse-slow" : "bg-gold"
            )}
          />
          {status}
        </span>
      </div>
      <div className="px-3 py-2 font-mono text-[11px] leading-relaxed min-h-[9.5rem]">
        {lines.length === 0 ? (
          <p className="text-text-dim">
            {status === "RECONNECTING"
              ? "feed unreachable — retrying…"
              : "waiting for keeper events…"}
          </p>
        ) : (
          lines.map((line) => (
            <div key={line.key} className="flex gap-2 items-baseline overflow-hidden">
              <span className="text-text-dim shrink-0 tabular-nums">{fmtClock(line.ts)}</span>
              <span className="truncate">
                <span className={LEVEL_CLASS[line.formatted.level]}>{line.formatted.title}</span>
                {line.formatted.subtitle && (
                  <span className="text-text-dim"> · {line.formatted.subtitle}</span>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
