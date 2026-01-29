import { cn } from "@/lib/utils";

interface CrtOverlayProps {
  showGrid?: boolean;
  showScanlines?: boolean;
  className?: string;
}

export function CrtOverlay({
  showGrid = true,
  showScanlines = true,
  className,
}: CrtOverlayProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 pointer-events-none z-[99999]",
        className
      )}
    >
      {showGrid && (
        <div className="absolute inset-0 bg-grid-pattern opacity-10 bg-grid" />
      )}
      {showScanlines && (
        <>
          <div className="absolute inset-0 bg-scanlines bg-scanlines opacity-10 crt-scanlines-animate" />
          <div className="crt-roll-band opacity-[0.5] relative z-10" />
          <div className="crt-rgb-mask opacity-[0.45] relative z-10" />
        </>
      )}
    </div>
  );
}

