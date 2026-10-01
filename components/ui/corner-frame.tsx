"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useInView } from "@/lib/use-in-view";

/** Gold corner ticks on a bordered panel — CSS-drawn so the frame reflows;
 *  reads as ASCII without living on a character grid. Shared by the landing
 *  sections and the /vaults index.
 *
 *  `reveal` (a delay in ms) plays the expansion once the frame scrolls into
 *  view: the ticks start clustered at the centre and spread to the corners,
 *  then the border and content fade in (`.frame-reveal` in globals.css).
 *  Until then the frame sits collapsed (`.frame-pending`), from SSR on, so
 *  nothing flashes complete first. `onReveal` fires when the expansion
 *  starts, for content that paces itself to it. */
export function CornerFrame({
  children,
  className,
  reveal,
  onReveal,
}: {
  children: ReactNode;
  className?: string;
  reveal?: number;
  onReveal?: () => void;
}) {
  const animate = reveal !== undefined;
  const { ref, inView } = useInView<HTMLDivElement>(animate);
  const go = animate && inView;
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  useEffect(() => {
    if (go) onRevealRef.current?.();
  }, [go]);

  const tick = "absolute w-3 h-3 border-gold/70 pointer-events-none";
  return (
    <div
      ref={ref}
      className={cn(
        "relative border border-border/50 bg-bg-base",
        animate && (go ? "frame-reveal" : "frame-pending"),
        className
      )}
      style={go ? { ["--reveal-delay" as string]: `${reveal}ms` } : undefined}
    >
      <span aria-hidden className={cn(tick, "top-0 left-0 border-t-2 border-l-2")} />
      <span aria-hidden className={cn(tick, "top-0 right-0 border-t-2 border-r-2")} />
      <span aria-hidden className={cn(tick, "bottom-0 left-0 border-b-2 border-l-2")} />
      <span aria-hidden className={cn(tick, "bottom-0 right-0 border-b-2 border-r-2")} />
      {children}
    </div>
  );
}
