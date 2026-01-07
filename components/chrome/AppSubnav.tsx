"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  value: string;
  label: ReactNode;
}

interface AppSubnavProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (value: string) => void;
  className?: string;
}

export function AppSubnav({
  tabs,
  activeTab,
  onTabChange,
  className,
}: AppSubnavProps) {
  return (
    <nav
      className={cn(
        "flex border-b border-border bg-bg-base z-10 shrink-0",
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value;
        return (
          <button
            key={tab.value}
            onClick={() => onTabChange(tab.value)}
            className={cn(
              "px-6 py-2 border-r border-border text-[11px] font-bold uppercase tracking-widest transition-colors relative",
              isActive
                ? "bg-panel text-white after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-gold"
                : "bg-bg-base text-text-dim hover:text-white hover:bg-white/5"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

