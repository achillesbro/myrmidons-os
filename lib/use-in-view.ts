"use client";

import { useEffect, useRef, useState } from "react";

/** Fire once when the element scrolls into view — drives the landing's
 *  reveals and the CornerFrame expansion. `enabled=false` never observes. */
export function useInView<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin: "-40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [enabled]);
  return { ref, inView };
}
