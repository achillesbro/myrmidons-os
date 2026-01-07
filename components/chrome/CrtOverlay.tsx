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
        "absolute inset-0 pointer-events-none z-50",
        className
      )}
    >
      {showGrid && (
        <div className="absolute inset-0 bg-grid-pattern opacity-10 bg-grid" />
      )}
      {showScanlines && (
        <div className="absolute inset-0 bg-scanlines bg-scanlines opacity-10" />
      )}
    </div>
  );
}

