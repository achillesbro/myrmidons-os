"use client";

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface TokenEntry {
  symbol: string;
  address: string;
  balanceHuman: string;
  usdValue: number | null;
}

export interface TokenSelectProps {
  tokens: TokenEntry[];
  value: TokenEntry | null;
  onChange: (token: TokenEntry) => void;
  disabled?: boolean;
  placeholder?: string;
}

const ROW_HEIGHT_PX = 36;
const VISIBLE_ROWS = 7;
const PANEL_MAX_HEIGHT = ROW_HEIGHT_PX * VISIBLE_ROWS;

function formatUsd(usdValue: number | null): string {
  if (usdValue == null || !Number.isFinite(usdValue)) return "—";
  return usdValue.toFixed(2);
}

function matchesFilter(token: TokenEntry, filter: string): boolean {
  if (!filter.trim()) return true;
  const q = filter.trim().toLowerCase();
  if (token.symbol.toLowerCase().startsWith(q)) return true;
  if (token.address.toLowerCase().includes(q)) return true;
  return false;
}

export function TokenSelect({
  tokens,
  value,
  onChange,
  disabled = false,
  placeholder = "Select token",
}: TokenSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filter, setFilter] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useRef(`token-select-list-${Math.random().toString(36).slice(2, 9)}`).current;

  // Snapshot when opening only; do not reorder while open
  const [snapshot, setSnapshot] = useState<TokenEntry[]>([]);
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      setSnapshot(tokens);
      setFilter("");
      setHighlightIndex(0);
    }
    prevOpen.current = open;
  }, [open, tokens]);

  // Focus panel when open so keyboard works
  useEffect(() => {
    if (open && panelRef.current) {
      panelRef.current.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return snapshot;
    return snapshot.filter((t) => matchesFilter(t, filter));
  }, [snapshot, filter]);

  const selectByIndex = useCallback(
    (index: number) => {
      const t = filtered[index];
      if (t) {
        onChange(t);
        setOpen(false);
      }
    },
    [filtered, onChange]
  );

  const close = useCallback(() => {
    setOpen(false);
    setFilter("");
    setSnapshot([]);
    triggerRef.current?.focus();
  }, []);

  // Click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const el = e.target as Node;
      if (
        triggerRef.current?.contains(el) ||
        panelRef.current?.contains(el)
      )
        return;
      close();
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, close]);

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      if (e.key === "ArrowDown") setHighlightIndex(0);
    }
  };

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        return;
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % Math.max(1, filtered.length));
        return;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) =>
          i <= 0 ? Math.max(0, filtered.length - 1) : i - 1
        );
        return;
      case "Enter":
        e.preventDefault();
        selectByIndex(highlightIndex);
        return;
      case "Backspace":
        e.preventDefault();
        setFilter((f) => f.slice(0, -1));
        setHighlightIndex(0);
        return;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          setFilter((f) => f + e.key);
          setHighlightIndex(0);
        }
    }
  };

  // Keep highlight in bounds when filter changes
  useEffect(() => {
    if (highlightIndex >= filtered.length)
      setHighlightIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlightIndex]);

  // Scroll highlighted row into view
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const row = panelRef.current.querySelector(
      `[data-index="${highlightIndex}"]`
    );
    row?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [open, highlightIndex]);

  const displayRow = (t: TokenEntry, highlighted: boolean) => (
    <>
      <span
        className={cn(
          "inline-block w-16 text-left truncate",
          highlighted ? "text-gold" : "text-text"
        )}
        title={t.symbol}
      >
        {t.symbol}
      </span>
      <span
        className={cn(
          "flex-1 text-right tabular-nums",
          highlighted ? "text-gold" : "text-text"
        )}
      >
        {t.balanceHuman}
      </span>
      <span
        className={cn(
          "text-right tabular-nums w-20",
          highlighted ? "text-gold/80" : "text-text-dim"
        )}
      >
        (${formatUsd(t.usdValue)})
      </span>
    </>
  );

  return (
    <div className="relative w-full">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
        }}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "flex w-full items-center justify-between gap-2 border border-border bg-bg-base px-3 py-2 text-sm font-mono",
          "focus:outline-none focus:border-gold focus:ring-0 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "text-left"
        )}
      >
        {value ? (
          <span className="flex flex-1 items-center justify-between gap-2 min-w-0">
            <span className="truncate text-text">{value.symbol}</span>
            <span className="flex shrink-0 items-center gap-1 tabular-nums text-text">
              {value.balanceHuman}
              <span className="text-text-dim">(${formatUsd(value.usdValue)})</span>
            </span>
          </span>
        ) : (
          <span className="text-text-dim/70">{placeholder}</span>
        )}
        <span className="shrink-0 text-text-dim ml-1" aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={onPanelKeyDown}
          className="absolute left-0 right-0 top-full z-[100] mt-0.5 border border-border bg-bg-base font-mono text-sm shadow-lg overflow-hidden focus:outline-none"
        >
          {filter.trim() && (
            <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-dim border-b border-border/50">
              FILTER: {filter}
            </div>
          )}
          <div className="overflow-y-auto" style={{ maxHeight: PANEL_MAX_HEIGHT }}>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-text-dim text-center">
                No matches
              </div>
            ) : (
              filtered.map((t, i) => (
                <button
                  key={`${t.address}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === highlightIndex}
                  data-index={i}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left border-b border-border/30 last:border-b-0",
                    "focus:outline-none focus:ring-0",
                    "hover:bg-gold/5 text-text",
                    i === highlightIndex && "text-gold"
                  )}
                  style={{ height: ROW_HEIGHT_PX, minHeight: ROW_HEIGHT_PX }}
                  onClick={() => selectByIndex(i)}
                >
                  <span className="w-4 shrink-0 text-left font-mono">
                    {i === highlightIndex ? ">" : " "}
                  </span>
                  {displayRow(t, i === highlightIndex)}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
