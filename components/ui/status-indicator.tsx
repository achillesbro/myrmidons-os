import { cn } from "@/lib/utils";
import { GlitchTypeText } from "@/components/ui/animated-text";

interface StatusIndicatorProps {
  status: "live" | "maintenance" | "offline" | "dev";
  className?: string;
  /** When set, the label glitch-types in once true (/vaults tile reveal). */
  reveal?: boolean;
}

/**
 * Status indicator for bot/service status
 * - live: Green dot + "LIVE" (blinking dot with glow)
 * - maintenance: Yellow/gold dot + "MAINTENANCE"
 * - offline: Red dot + "OFFLINE"
 * - dev: Yellow/gold pulsing dot + "IN DEV"
 */
export function StatusIndicator({ status, className, reveal }: StatusIndicatorProps) {
  const variants = {
    live: {
      container: "bg-success/20 border border-success",
      dot: "bg-success animate-pulse-slow",
      text: "text-success",
      glow: "glow-border-green",
    },
    maintenance: {
      container: "bg-gold/20 border border-gold",
      dot: "bg-gold",
      text: "text-gold",
      glow: "glow-border-gold",
    },
    offline: {
      container: "bg-danger/20 border border-danger",
      dot: "bg-danger",
      text: "text-danger",
      glow: "glow-border-red",
    },
    dev: {
      container: "bg-gold/20 border border-gold",
      dot: "bg-gold animate-pulse-slow",
      text: "text-gold",
      glow: "glow-border-gold",
    },
  };

  const variant = variants[status];
  const label =
    status === "live"
      ? "LIVE"
      : status === "maintenance"
      ? "MAINTENANCE"
      : status === "dev"
      ? "IN DEV"
      : "OFFLINE";

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 border rounded",
        variant.container,
        variant.glow,
        className
      )}
    >
      <span
        className={cn("w-1.5 h-1.5 rounded-full shrink-0", variant.dot)}
        style={
          status === "live"
            ? {
                boxShadow:
                  "0 0 6px color-mix(in oklab, var(--success) 55%, transparent), 0 0 12px color-mix(in oklab, var(--success) 30%, transparent)",
              }
            : undefined
        }
      />
      <span className={cn("text-[9px] font-bold uppercase tracking-wider", variant.text)}>
        {reveal === undefined ? label : <GlitchTypeText loading={!reveal} value={label} mode="text" />}
      </span>
    </div>
  );
}
