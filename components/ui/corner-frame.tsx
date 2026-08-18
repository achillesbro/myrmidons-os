import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Gold corner ticks on a bordered panel — CSS-drawn so the frame reflows;
 *  reads as ASCII without living on a character grid. Shared by the landing
 *  sections and the /vaults index. */
export function CornerFrame({ children, className }: { children: ReactNode; className?: string }) {
  const tick = "absolute w-3 h-3 border-gold/70 pointer-events-none";
  return (
    <div className={cn("relative border border-border/50 bg-bg-base", className)}>
      <span aria-hidden className={cn(tick, "top-0 left-0 border-t-2 border-l-2")} />
      <span aria-hidden className={cn(tick, "top-0 right-0 border-t-2 border-r-2")} />
      <span aria-hidden className={cn(tick, "bottom-0 left-0 border-b-2 border-l-2")} />
      <span aria-hidden className={cn(tick, "bottom-0 right-0 border-b-2 border-r-2")} />
      {children}
    </div>
  );
}
