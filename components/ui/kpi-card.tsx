import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const kpiCardVariants = cva(
  "bg-panel border border-border rounded-lg px-4 py-3 relative",
  {
    variants: {
      accent: {
        default: "",
        gold: "border-l-4 border-l-gold",
        success: "border-l-4 border-l-success",
        danger: "border-l-4 border-l-danger",
      },
    },
    defaultVariants: {
      accent: "default",
    },
  }
);

const valueVariants = cva("text-2xl font-bold", {
  variants: {
    accent: {
      default: "text-text",
      gold: "text-gold",
      success: "text-success",
      danger: "text-danger",
    },
  },
  defaultVariants: {
    accent: "default",
  },
});

export interface KpiCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof kpiCardVariants> {
  label: string;
  value: string;
  subValue?: string;
}

export function KpiCard({
  label,
  value,
  subValue,
  accent,
  className,
  ...props
}: KpiCardProps) {
  return (
    <div className={cn(kpiCardVariants({ accent }), className)} {...props}>
      <div className="text-xs uppercase tracking-wide text-text/70 mb-1">
        {label}
      </div>
      <div className={cn(valueVariants({ accent }))}>{value}</div>
      {subValue && (
        <div className="text-xs text-text/60 mt-1 font-mono">{subValue}</div>
      )}
    </div>
  );
}

