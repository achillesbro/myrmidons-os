"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  title?: ReactNode;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  className?: string;
}

export function AppHeader({
  title,
  leftSlot,
  rightSlot,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "h-14 border-b border-border bg-bg-base flex items-center justify-between px-4 shrink-0 z-20 relative shadow-crt",
        className
      )}
    >
      <div className="flex items-center gap-6">
        {title && <div className="flex flex-col leading-none">{title}</div>}
        {leftSlot && <div className="hidden md:flex items-center gap-3">{leftSlot}</div>}
      </div>
      {rightSlot && <div className="flex items-center gap-4">{rightSlot}</div>}
    </header>
  );
}

