import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  status: "live" | "maintenance" | "offline";
  className?: string;
}

/**
 * Status indicator for bot/service status
 * - live: Green dot + "LIVE" (blinking dot with glow)
 * - maintenance: Yellow/gold dot + "MAINTENANCE" 
 * - offline: Red dot + "OFFLINE"
 */
export function StatusIndicator({ status, className }: StatusIndicatorProps) {
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
  };

  const variant = variants[status];

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
        {status === "live" ? "LIVE" : status === "maintenance" ? "MAINTENANCE" : "OFFLINE"}
      </span>
    </div>
  );
}
