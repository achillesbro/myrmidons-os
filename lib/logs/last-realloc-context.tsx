"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import { getTxExplorerUrl, tryParseJsonEvent } from "@/lib/logs/jsonl";
import { GridKpi } from "@/components/ui/grid-kpi";
import { GlitchTypeText } from "@/components/ui/animated-text";

export interface LastReallocTx {
  ts: string;
  txHash: string;
  chainId?: number;
}

type LastReallocTxValue = LastReallocTx | null;

interface LastReallocTxContextValue {
  lastReallocTx: LastReallocTxValue;
  setLastReallocTx: (tx: LastReallocTxValue) => void;
}

const LastReallocTxContext = createContext<LastReallocTxContextValue | null>(
  null
);

const STORAGE_KEY = "myrmidons_lastReallocTx";

/** Strip HEGEMON docker-log RFC3339 prefix so line starts with JSON (same as ReallocatorTerminal) */
function normalizeHegemonLine(rawLine: string): string | null {
  let cleaned = rawLine.trim();
  if (!cleaned || cleaned.startsWith(":")) return null;
  const timestampPrefix = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z?\s+/;
  cleaned = cleaned.replace(timestampPrefix, "").trim();
  return cleaned || null;
}

function hydrateLastReallocTx(): LastReallocTxValue {
  if (typeof window === "undefined") return null;
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const parsed = JSON.parse(s) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "ts" in parsed &&
      "txHash" in parsed &&
      typeof (parsed as LastReallocTx).ts === "string" &&
      typeof (parsed as LastReallocTx).txHash === "string"
    ) {
      return parsed as LastReallocTx;
    }
  } catch {
    // ignore
  }
  return null;
}

function persistLastReallocTx(tx: LastReallocTxValue): void {
  if (typeof window === "undefined") return;
  try {
    if (tx) localStorage.setItem(STORAGE_KEY, JSON.stringify(tx));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Background listener for HEGEMON realloc stream; updates context so shard viewport has data without mounting ReallocatorTerminal */
function LastReallocStreamListener() {
  const { setLastReallocTx } = useLastReallocTx();
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const cacheBuster = Date.now();
    const es = new EventSource(`/api/logs/stream?t=${cacheBuster}`);
    eventSourceRef.current = es;

    const processOneLine = (line: string) => {
      const stripped = line.replace(/\x1b\[[0-9;]*m/g, "").trim();
      const cleaned = normalizeHegemonLine(stripped);
      if (!cleaned || !cleaned.startsWith("{")) return;
      const result = tryParseJsonEvent(cleaned);
      if (!result.ok || !result.evt) return;
      const evt = result.evt;
      const txHash = evt.txHash || evt.tx?.hash || "";
      const isReallocTx =
        (evt.type === "tx_confirmed" || evt.type === "tx_sent") &&
        txHash &&
        evt.plan != null &&
        (evt.plan.actionsCount != null ||
          evt.plan.movedUsd != null ||
          evt.plan.marketsTouched != null ||
          evt.plan.withdrawCount != null ||
          evt.plan.depositCount != null ||
          evt.plan.expectedApyBefore != null ||
          evt.plan.expectedApyAfter != null);
      if (isReallocTx) {
        setLastReallocTx({ ts: evt.ts, txHash, chainId: evt.chainId });
      }
    };

    const handlePayload = (rawData: string | null) => {
      if (!rawData) return;
      let data = typeof rawData === "string" ? rawData : String(rawData);
      if (data.startsWith("data:")) data = data.slice(5).trim();
      const lines = data.split("\n");
      for (const line of lines) {
        processOneLine(line);
      }
    };

    es.addEventListener("log", (e: MessageEvent) => handlePayload(e.data));
    es.onmessage = (e) => handlePayload(e.data);

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [setLastReallocTx]);

  return null;
}

export function LastReallocTxProvider({ children }: { children: ReactNode }) {
  const [lastReallocTx, setLastReallocTxState] = useState<LastReallocTxValue>(
    hydrateLastReallocTx
  );
  const setLastReallocTx = useCallback((tx: LastReallocTxValue) => {
    setLastReallocTxState(tx);
    persistLastReallocTx(tx);
  }, []);

  return (
    <LastReallocTxContext.Provider value={{ lastReallocTx, setLastReallocTx }}>
      <LastReallocStreamListener />
      {children}
    </LastReallocTxContext.Provider>
  );
}

export function useLastReallocTx() {
  const ctx = useContext(LastReallocTxContext);
  if (!ctx) {
    return {
      lastReallocTx: null as LastReallocTxValue,
      setLastReallocTx: (_: LastReallocTxValue) => {},
    };
  }
  return ctx;
}

/** Format ISO ts as relative time: "45m ago", "2h 15m ago", "1d 3h ago" */
export function formatLastReallocTime(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    const diffMs = Date.now() - d.getTime();
    const diffM = Math.floor(diffMs / 60_000);
    const diffH = Math.floor(diffMs / 3_600_000);
    const diffD = Math.floor(diffMs / 86_400_000);
    if (diffM < 1) return "<1m ago";
    if (diffM < 60) return `${diffM}m ago`;
    if (diffH < 24) {
      const m = diffM % 60;
      return m > 0 ? `${diffH}h ${m}m ago` : `${diffH}h ago`;
    }
    const h = diffH % 24;
    return h > 0 ? `${diffD}d ${h}h ago` : `${diffD}d ago`;
  } catch {
    return ts;
  }
}

/** Short hash for display: 0x1234…abcd */
export function shortTxHash(hash: string): string {
  if (!hash || hash.length < 10) return hash || "";
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/** KPI value + subValue for "Last realloc" card; use in GridKpi value/subValue when replacing Risk Factor */
export function useLastReallocKpiContent(loading?: boolean): {
  value: ReactNode;
  subValue: ReactNode;
} {
  const { lastReallocTx } = useLastReallocTx();
  const [, setTick] = useState(0);
  const isLoading = loading ?? false;
  useEffect(() => {
    if (!lastReallocTx) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastReallocTx]);

  if (!lastReallocTx) {
    return {
      value: <GlitchTypeText loading={isLoading} value="—" mode="text" />,
      subValue: (
        <span className="text-text-dim font-mono text-[9px] uppercase tracking-wider">
          NO REALLOCATION DATA
        </span>
      ),
    };
  }

  const explorerUrl = getTxExplorerUrl(lastReallocTx.txHash, lastReallocTx.chainId);
  const relativeTime = formatLastReallocTime(lastReallocTx.ts);
  return {
    value: <GlitchTypeText loading={isLoading} value={relativeTime} mode="text" />,
    subValue: (
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-gold hover:text-gold/80 hover:underline font-mono text-[10px]"
      >
        <GlitchTypeText
          loading={isLoading}
          value={shortTxHash(lastReallocTx.txHash)}
          mode="text"
        />
      </a>
    ),
  };
}

/** GridKpi card for "Last realloc" (timestamp + tx hash); use in place of Risk Factor KPI */
export function LastReallocKpiCard({
  className,
  loading,
}: { className?: string; loading?: boolean } = {}) {
  const { value, subValue } = useLastReallocKpiContent(loading);
  return (
    <GridKpi
      label="LAST REALLOC"
      value={value}
      subValue={subValue}
      accent="default"
      cornerIndicator="default"
      className={className}
    />
  );
}
