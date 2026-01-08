"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { BlinkCaret } from "@/components/ui/animated-text";

export interface TransactionLog {
  timestamp: string;
  level: "INFO" | "SUCCESS" | "ERROR" | "WARN";
  message: string;
  txHash?: `0x${string}`;
  explorerUrl?: string;
}

interface TransactionTerminalProps {
  logs: TransactionLog[];
  className?: string;
}

export function TransactionTerminal({ logs, className }: TransactionTerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs are added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getLevelColor = (level: TransactionLog["level"]) => {
    switch (level) {
      case "SUCCESS":
        return "text-success";
      case "ERROR":
        return "text-danger";
      case "WARN":
        return "text-gold";
      case "INFO":
      default:
        return "text-text";
    }
  };

  const formatTimestamp = (timestamp: string) => {
    // timestamp is already formatted as HH:MM:SS
    return timestamp;
  };

  if (logs.length === 0) {
    return (
      <div
        className={cn(
          "bg-bg-base/50 p-2 h-[120px] flex flex-col overflow-hidden",
          className
        )}
      >
        <div className="flex-1 overflow-y-auto space-y-1 font-mono text-[10px]">
          <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
            <span className="text-text-dim shrink-0">--:--:--</span>
            <span className="text-text-dim shrink-0 font-bold">[WAIT]</span>
            <span className="text-text break-words min-w-0">
              Waiting for transactions<BlinkCaret />
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-bg-base/50 p-2 h-[120px] flex flex-col overflow-hidden",
        className
      )}
    >
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-1 font-mono text-[10px]"
      >
        {logs.map((log, idx) => (
          <div key={idx} className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
            <span className="text-text-dim shrink-0">{formatTimestamp(log.timestamp)}</span>
            <span className={cn("shrink-0 font-bold", getLevelColor(log.level))}>
              [{log.level}]
            </span>
            <span className="text-text break-words min-w-0">{log.message}</span>
            {log.explorerUrl && log.txHash && (
              <a
                href={log.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold hover:text-gold/80 hover:underline shrink-0"
              >
                {log.txHash.slice(0, 4)}...{log.txHash.slice(-4)}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

