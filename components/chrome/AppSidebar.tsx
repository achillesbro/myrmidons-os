"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TerminalLog {
  timestamp: string;
  level: "SYS" | "CONN" | "WARN" | "INFO" | "EXEC" | "TX" | "ALRT" | "BOT" | "SYNC";
  message: string;
  highlight?: boolean;
}

interface AppSidebarProps {
  title?: string;
  logs?: TerminalLog[];
  prompt?: string;
  className?: string;
}

const defaultLogs: TerminalLog[] = [
  { timestamp: "00:00:00", level: "SYS", message: "PLACEHOLDER - Terminal logs will be populated from live feed", highlight: false },
  { timestamp: "00:00:00", level: "INFO", message: "PLACEHOLDER - Replace with actual system events", highlight: false },
];

const levelColors: Record<TerminalLog["level"], string> = {
  SYS: "text-text-dim",
  CONN: "text-success font-bold",
  WARN: "text-gold font-bold",
  INFO: "text-border-main font-bold",
  EXEC: "text-success font-bold",
  TX: "text-border-main font-bold",
  ALRT: "text-danger font-bold",
  BOT: "text-border-main font-bold",
  SYNC: "text-success font-bold",
};

export function AppSidebar({
  title = "TERMINAL // LIVE_FEED",
  logs = defaultLogs,
  prompt = "status --usdt0",
  className,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "w-[22%] min-w-[280px] border-r border-border bg-bg-base flex flex-col relative font-mono text-[11px] z-20",
        className
      )}
    >
      <div className="p-2 border-b border-border bg-panel/50 flex justify-between items-center text-border select-none">
        <span className="uppercase font-bold tracking-widest text-[10px]">{title}</span>
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-border/50" />
          <div className="w-2 h-2 bg-border/50" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 font-mono text-[10px] leading-tight text-text-dim">
        {logs.map((log, idx) => (
          <div
            key={idx}
            className={cn(
              "flex gap-2",
              log.highlight === false && "opacity-50"
            )}
          >
            <span className="text-border">{log.timestamp}</span>
            <span className={levelColors[log.level]}>{log.level}</span>
            <span
              className={cn(
                log.level === "WARN" || log.level === "ALRT"
                  ? log.level === "WARN"
                    ? "text-gold"
                    : "text-danger"
                  : log.level === "CONN" || log.level === "EXEC" || log.level === "SYNC"
                  ? "text-white"
                  : ""
              )}
            >
              {log.message}
            </span>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-border bg-bg-base text-[11px] flex items-center gap-2 text-text">
        <span className="text-gold font-bold">&gt;</span>
        <span className="opacity-80">PLACEHOLDER</span>
        <span className="w-2 h-4 bg-gold blink block" />
      </div>
    </aside>
  );
}

