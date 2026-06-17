"use client";

import { useEffect, useState } from "react";

// Matches Tailwind's `md` breakpoint: < 768px is treated as mobile.
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * SSR-safe media-query hook for mobile layout branching.
 * Returns false during SSR / first paint, then resolves on mount.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);

    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
