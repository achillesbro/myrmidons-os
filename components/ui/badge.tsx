import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default: "bg-panel border border-border text-text",
        gold: "bg-gold/20 border border-gold text-gold",
        success: "bg-success/20 border border-success text-success",
        danger: "bg-danger/20 border border-danger text-danger",
        outline: "border border-border text-text bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

