"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Click-to-copy inline text for the docs: addresses, hosts, endpoint URLs.
 * `children` is what the reader sees; `value` is what lands on the
 * clipboard (an endpoint shows host + path but copies the full URL).
 */
export function CopyText({
  value,
  children,
  className,
  title,
}: {
  value: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (insecure context) - no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={title ?? (copied ? "Copied" : `Copy ${value}`)}
      className={cn(
        "group inline-flex max-w-full items-baseline gap-1 text-left font-mono transition-colors hover:text-gold",
        className
      )}
    >
      <span className="min-w-0 break-all">{children ?? value}</span>
      <span
        aria-hidden
        className={cn(
          "shrink-0 text-[9px] transition-opacity",
          copied ? "text-success opacity-100" : "text-text-dim/40 opacity-0 group-hover:opacity-100"
        )}
      >
        {copied ? "✓" : "⧉"}
      </span>
    </button>
  );
}

/**
 * Copyable code block: a bordered <pre> with a copy affordance in the top
 * right corner. Used for curl commands and example responses.
 */
export function CopyBlock({
  value,
  label,
  maxHeight,
}: {
  value: string;
  label?: string;
  maxHeight?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - no-op */
    }
  };
  return (
    <div className="relative border border-border/60 bg-panel/40">
      {label && (
        <div className="border-b border-border/40 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-text-dim/60">
          {label}
        </div>
      )}
      <button
        type="button"
        onClick={onCopy}
        title={copied ? "Copied" : "Copy"}
        className={cn(
          "absolute right-1.5 top-1 px-1 font-mono text-[10px] transition-colors",
          copied ? "text-success" : "text-text-dim/50 hover:text-gold"
        )}
      >
        {copied ? "✓" : "⧉"}
      </button>
      <pre
        className="overflow-x-auto overflow-y-auto px-2.5 py-2 font-mono text-[10px] leading-relaxed text-text-dim"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {value}
      </pre>
    </div>
  );
}
