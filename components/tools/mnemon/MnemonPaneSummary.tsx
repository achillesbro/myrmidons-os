"use client";

import { useMarketHealth } from "@/lib/mnemon/queries";
import { fmtAge, ageMinutes, reasonLabel, STALE_MINUTES } from "@/lib/mnemon/format";

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "danger" | "success" | "gold";
}) {
  const color =
    tone === "danger"
      ? "text-danger"
      : tone === "success"
        ? "text-success"
        : tone === "gold"
          ? "text-gold"
          : "text-text";
  return (
    <div className="p-2 bg-bg-base">
      <div className="text-[9px] uppercase tracking-widest text-text-dim font-mono">{label}</div>
      <div className={`text-sm font-mono ${color}`}>{value}</div>
    </div>
  );
}

export function MnemonPaneSummary() {
  const { data, isLoading, isError } = useMarketHealth();
  const markets = data?.markets ?? [];
  const broken = markets.filter((m) => m.is_broken);
  const reasons = broken.reduce<Record<string, number>>((acc, m) => {
    const r = m.broken_reason ?? "unknown";
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  const min = ageMinutes(data?.generated_at);
  const stale = min != null && min > STALE_MINUTES;

  return (
    <div className="space-y-3">
      <div className="text-xs text-text-dim font-mono leading-relaxed">
        HyperEVM Morpho market observatory — supply/borrow APY, liquidity, and a
        broken-market classifier, sampled every 15 min from the MNEMON archive.
      </div>
      <div className="grid grid-cols-2 gap-px bg-border border border-border">
        <Stat label="MARKETS" value={isLoading ? "…" : String(markets.length)} />
        <Stat
          label="BROKEN"
          value={isLoading ? "…" : String(broken.length)}
          tone={broken.length ? "danger" : "success"}
        />
        <Stat
          label="DATA_AGE"
          value={isLoading ? "…" : fmtAge(data?.generated_at)}
          tone={stale ? "gold" : undefined}
        />
        <Stat label="CHAIN" value="HyperEVM" />
      </div>
      {broken.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(reasons).map(([r, n]) => (
            <span
              key={r}
              className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 border border-danger/50 text-danger"
            >
              {reasonLabel(r)} ×{n}
            </span>
          ))}
        </div>
      )}
      {isError && (
        <div className="text-xs text-danger font-mono">DATA_UNAVAILABLE // retrying…</div>
      )}
    </div>
  );
}
