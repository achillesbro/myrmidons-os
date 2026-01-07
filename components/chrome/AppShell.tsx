"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CrtOverlay } from "./CrtOverlay";

interface AppShellProps {
  sidebar?: ReactNode;
  children: ReactNode;
  showOverlay?: boolean;
  className?: string;
}

export function AppShell({
  sidebar,
  children,
  showOverlay = true,
  className,
}: AppShellProps) {
  return (
    <div className={cn("flex flex-1 overflow-hidden relative", className)}>
      {showOverlay && <CrtOverlay />}
      {sidebar}
      <main className="flex-1 flex flex-col bg-panel overflow-hidden relative">
        <div className="absolute inset-0 bg-grid-pattern opacity-10 pointer-events-none" />
        {children}
      </main>
    </div>
  );
}

