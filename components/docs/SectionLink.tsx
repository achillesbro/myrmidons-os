"use client";

import type { ReactNode } from "react";

/**
 * Sub-section nav link that scrolls ONLY the docs article's scroll container.
 * Native fragment navigation (a bare href="#id") makes the browser scroll
 * every scrollable ancestor — including the console's overflow-hidden frame
 * wrappers, which get shifted out of bounds and never scroll back. The href
 * is kept for middle-click / copy-link semantics; a plain click is handled
 * manually.
 */
export function SectionLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${id}`}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        const el = document.getElementById(id);
        const container = el?.closest<HTMLElement>(".overflow-y-auto");
        if (!el || !container) return;
        container.scrollTo({
          top:
            container.scrollTop +
            el.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            12,
          behavior: "smooth",
        });
      }}
    >
      {children}
    </a>
  );
}
