import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GridPanelProps {
  title?: ReactNode;
  headerLeft?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
  scrollable?: boolean;
}

export function GridPanel({
  title,
  headerLeft,
  headerRight,
  footer,
  className,
  children,
  scrollable = false,
}: GridPanelProps) {
  return (
    <div
      className={cn(
        "border-l border-t border-border bg-bg-base flex flex-col",
        className
      )}
    >
      {(title || headerLeft || headerRight) && (
        <div className="h-12 px-3 border-b border-border bg-panel flex justify-between items-center shrink-0">
          {title && (
            <h3 className="font-mono font-bold text-white text-xs uppercase tracking-widest flex items-center gap-2">
              {title}
            </h3>
          )}
          <div className="flex items-center gap-3 ml-auto">
            {headerLeft && <div>{headerLeft}</div>}
            {headerRight && <div>{headerRight}</div>}
          </div>
        </div>
      )}
      <div className={cn("flex-1", scrollable ? "min-h-0 overflow-y-auto" : "overflow-hidden")}>
        {children}
      </div>
      {footer && (
        <div className="p-2 border-t border-border bg-panel/50 text-[9px] text-text-dim flex justify-between font-mono uppercase shrink-0">
          {footer}
        </div>
      )}
    </div>
  );
}

