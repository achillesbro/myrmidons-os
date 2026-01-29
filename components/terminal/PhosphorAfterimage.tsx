"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PhosphorAfterimageProps {
  trigger: string | number;
  children: ReactNode;
  ghostClassName?: string;
}

export function PhosphorAfterimage({
  trigger,
  children,
  ghostClassName,
}: PhosphorAfterimageProps) {
  const [ghostKey, setGhostKey] = useState<number | null>(null);

  useEffect(() => {
    if (trigger !== 0 && trigger !== "" && trigger != null) {
      setGhostKey((prev) => (typeof trigger === "number" ? trigger : (prev ?? 0) + 1));
    } else {
      setGhostKey(null);
    }
  }, [trigger]);

  return (
    <div className="relative">
      {ghostKey != null && (
        <div
          key={ghostKey}
          className={cn("phosphor-afterimage", ghostClassName)}
          aria-hidden
        >
          {children}
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
