"use client";

import { useState } from "react";
import { shortAddr } from "@/lib/mnemon/format";

// Click-to-copy truncated address — same interaction as the drilldown's
// CopyableId for market ids: click copies the full value, brief "COPIED ✓"
// confirmation, gold hover.
export function CopyableAddr({ addr }: { addr: string | null | undefined }) {
  const [copied, setCopied] = useState(false);
  if (!addr) return <span className="text-text-dim/50">—</span>;
  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation(); // don't toggle the row the address sits in
    try {
      await navigator.clipboard.writeText(addr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) — no-op */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={copied ? "Copied!" : `Click to copy ${addr}`}
      className="font-mono text-text-dim/70 hover:text-gold transition-colors cursor-pointer"
    >
      {copied ? "COPIED ✓" : `${shortAddr(addr)} ⧉`}
    </button>
  );
}
