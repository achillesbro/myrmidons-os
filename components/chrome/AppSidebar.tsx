"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ReallocatorTerminal } from "@/components/vault/ReallocatorTerminal";

interface AppSidebarProps {
  title?: string;
  terminal?: ReactNode;
  className?: string;
}

export function AppSidebar({
  title = "TERMINAL // LIVE_FEED",
  terminal,
  className,
}: AppSidebarProps) {
  return (
    <aside
      className={cn(
        "w-full h-[280px] border-t md:w-[22%] md:min-w-[280px] md:h-auto md:border-t-0 md:border-r border-border bg-bg-base flex flex-col relative font-mono text-[11px] z-20 shrink-0",
        className
      )}
    >
      <div className="p-2 border-b border-border bg-panel/50 flex justify-between items-center text-border select-none">
        <span className="uppercase font-bold tracking-widest text-[10px]">{title}</span>
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-border/50" />
          <div className="w-2 h-2 bg-border/50" />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {terminal ?? <ReallocatorTerminal className="h-full border-0" />}
      </div>
    </aside>
  );
}

