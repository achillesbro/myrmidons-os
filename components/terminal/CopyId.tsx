"use client";

import { useState } from "react";
import { playSfx } from "@/lib/terminal/sfx";

/**
 * A 64-hex market id in a report table: shown short so the column stays a column, the
 * full id one click away (clipboard) and in the tooltip. The log's text keeps the full id,
 * so `export` and select-all still carry it.
 */
export function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      playSfx("relay");
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked (insecure context) — the tooltip still shows the id */
    }
  };
  return (
    <button
      type="button"
      onClick={onCopy}
      title={`${id}\nclick to copy`}
      className={copied ? "text-success" : "text-text-dim hover:text-gold transition-colors underline decoration-dotted underline-offset-2"}
    >
      {copied ? "COPIED       " : `${id.slice(0, 12)}…`}
    </button>
  );
}
