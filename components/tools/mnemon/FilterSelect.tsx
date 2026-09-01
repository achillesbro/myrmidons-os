"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Searchable filter dropdown for the MNEMON chain/loan filters — the pill
// rows stopped scaling once the archive went multi-chain (60+ loan tokens).
// Interaction and styling follow components/tools/swap/TokenSelect.tsx.

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

const ROW_HEIGHT_PX = 30;
const PANEL_MAX_HEIGHT = ROW_HEIGHT_PX * 8;

export function FilterSelect({
  label,
  options,
  totalCount,
  value,
  onChange,
}: {
  label: string; // micro-label, e.g. "CHAIN"
  options: FilterOption[];
  totalCount: number; // count shown on the built-in ALL row
  value: string | null; // null = ALL
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const all: FilterOption = { value: "\0all", label: "ALL", count: totalCount };
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return q ? rows : [all, ...rows];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, query, totalCount]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHighlightIndex(0);
  }, []);

  const select = useCallback(
    (opt: FilterOption | undefined) => {
      if (!opt) return;
      onChange(opt.value === "\0all" ? null : opt.value);
      close();
      triggerRef.current?.focus();
    },
    [onChange, close]
  );

  // Focus the search input on open; close on outside click.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (triggerRef.current?.contains(el) || panelRef.current?.contains(el)) return;
      close();
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open, close]);

  // Keep highlight in bounds as the query narrows the list.
  useEffect(() => {
    if (highlightIndex >= filtered.length) setHighlightIndex(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlightIndex]);

  useEffect(() => {
    if (!open || !panelRef.current) return;
    panelRef.current
      .querySelector(`[data-index="${highlightIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, highlightIndex]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        close();
        triggerRef.current?.focus();
        return;
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % Math.max(1, filtered.length));
        return;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) => (i <= 0 ? Math.max(0, filtered.length - 1) : i - 1));
        return;
      case "Enter":
        e.preventDefault();
        select(filtered[highlightIndex]);
        return;
    }
  };

  const selected = value == null ? null : options.find((o) => o.value === value);

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-text-dim font-mono">
        {label}
      </span>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => (open ? close() : setOpen(true))}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "Enter") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={cn(
            "flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border transition-colors cursor-pointer min-w-[110px] justify-between",
            selected
              ? "border-gold text-gold bg-gold/10"
              : "border-border text-text-dim hover:text-white hover:border-text-dim"
          )}
        >
          <span>
            {(selected ?? all).label}{" "}
            <span className="opacity-50">{(selected ?? all).count}</span>
          </span>
          <span aria-hidden className="opacity-60">
            ▾
          </span>
        </button>

        {open && (
          <div
            ref={panelRef}
            role="listbox"
            className="absolute left-0 top-full z-[100] mt-0.5 min-w-[180px] border border-border bg-bg-base font-mono shadow-lg"
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightIndex(0);
              }}
              onKeyDown={onInputKeyDown}
              placeholder={`SEARCH ${label}`}
              className="w-full bg-transparent px-2 py-1.5 text-[10px] uppercase tracking-wider text-text placeholder:text-text-dim/50 border-b border-border/50 focus:outline-none"
            />
            <div className="overflow-y-auto" style={{ maxHeight: PANEL_MAX_HEIGHT }}>
              {filtered.length === 0 ? (
                <div className="px-2 py-3 text-[10px] uppercase tracking-wider text-text-dim text-center">
                  No matches
                </div>
              ) : (
                filtered.map((o, i) => (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={
                      o.value === "\0all" ? value === null : o.value === value
                    }
                    data-index={i}
                    onClick={() => select(o)}
                    onMouseEnter={() => setHighlightIndex(i)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-2 text-left text-[10px] uppercase tracking-wider border-b border-border/30 last:border-b-0",
                      i === highlightIndex ? "text-gold bg-gold/5" : "text-text"
                    )}
                    style={{ height: ROW_HEIGHT_PX, minHeight: ROW_HEIGHT_PX }}
                  >
                    <span>
                      <span className="inline-block w-3">{i === highlightIndex ? ">" : ""}</span>
                      {o.label}
                    </span>
                    <span className="opacity-50 tabular-nums">{o.count}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
