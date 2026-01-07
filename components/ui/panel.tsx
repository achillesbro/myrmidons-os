import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PanelProps {
  title?: string;
  rightSlot?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Panel({ title, rightSlot, className, children }: PanelProps) {
  return (
    <div
      className={cn(
        "bg-panel border border-border rounded-lg px-6 py-4 shadow-sm",
        className
      )}
    >
      {title && (
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <h3 className="text-sm font-semibold uppercase tracking-wide">
            {title}
          </h3>
          {rightSlot && <div>{rightSlot}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}

