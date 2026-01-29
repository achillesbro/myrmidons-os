"use client";

import { useEffect, useState, type ReactNode } from "react";

interface ActiveLineGlowProps {
  trigger: string | number;
  children: ReactNode;
  className?: string;
}

export function ActiveLineGlow({
  trigger,
  children,
  className,
}: ActiveLineGlowProps) {
  const [glowKey, setGlowKey] = useState<number | null>(null);

  useEffect(() => {
    if (trigger !== 0 && trigger !== "" && trigger != null) {
      setGlowKey((k) => (typeof trigger === "number" ? trigger : (k ?? 0) + 1));
    } else {
      setGlowKey(null);
    }
  }, [trigger]);

  return (
    <div className={className ?? "relative"}>
      {glowKey != null && (
        <>
          <div
            key={`tint-${glowKey}`}
            className="active-line-glow active-line-glow--tint z-0"
            aria-hidden
          />
          <div
            key={`bloom-${glowKey}`}
            className="active-line-glow active-line-glow--bloom z-0"
            aria-hidden
          />
        </>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
