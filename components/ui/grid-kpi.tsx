import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GridKpiProps {
  label: string;
  value: ReactNode;
  subValue?: ReactNode;
  accent?: "default" | "gold" | "success" | "danger";
  cornerIndicator?: "default" | "gold" | "success" | "danger";
  className?: string;
}

const accentColors = {
  default: "text-text",
  gold: "text-gold",
  success: "text-success",
  danger: "text-danger",
};

export function GridKpi({
  label,
  value,
  subValue,
  accent = "default",
  cornerIndicator,
  className,
}: GridKpiProps) {
  return (
    <div
      className={cn(
        "bg-bg-base border-r border-b border-border p-4 relative group hover:bg-white/5 transition-colors",
        accent === "gold" && "shadow-[inset_0_0_15px_rgba(169,134,41,0.1)]",
        className
      )}
    >
      {cornerIndicator && (
        <div className="absolute top-0 right-0 p-1">
          <div
            className={cn(
              "w-1.5 h-1.5",
              cornerIndicator === "gold" && "bg-gold",
              cornerIndicator === "success" && "bg-success",
              cornerIndicator === "danger" && "bg-danger",
              cornerIndicator === "default" && "bg-border"
            )}
          />
        </div>
      )}
      <h3
        className={cn(
          "text-[10px] uppercase tracking-widest mb-1 font-mono",
          accent === "gold" ? "text-gold" : "text-text-dim"
        )}
      >
        {label}
      </h3>
      <div
        className={cn(
          "text-xl md:text-2xl font-bold tracking-tight",
          accentColors[accent]
        )}
      >
        {value}
      </div>
      {subValue && (
        <div className="mt-2 flex items-center justify-between text-[10px]">
          {subValue}
        </div>
      )}
    </div>
  );
}

