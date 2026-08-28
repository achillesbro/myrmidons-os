"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Blinking caret component for loading states.
 * Uses CSS animation for performance.
 */
const CARET_WIDTH = 4; // px — increase for a thicker caret

export function BlinkCaret({ className }: { className?: string }) {
  return (
    <span
      className={cn("caret-with-trace", className)}
      style={{ ["--caret-width" as string]: `${CARET_WIDTH}px` }}
    >
      <span
        className="inline-block animate-caret-blink align-middle bg-current"
        style={{ width: CARET_WIDTH, height: "1em" }}
        aria-hidden
      />
    </span>
  );
}

/**
 * Helper to check if a value is animatable (string or number).
 * Rejects React nodes, arrays, objects, etc.
 */
function isAnimatableValue(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Shared rAF ticker: every animating GlitchTypeText subscribes to ONE
 * requestAnimationFrame loop instead of spawning its own setIntervals.
 * All setState calls inside a single frame callback are auto-batched by
 * React 18, so N animating cells cost one render pass per frame instead
 * of 2N uncoordinated timer callbacks.
 */
type TickFn = (now: number) => void;
const tickSubscribers = new Set<TickFn>();
let tickRafId: number | null = null;

function runTick(now: number) {
  tickSubscribers.forEach((fn) => fn(now));
  tickRafId =
    tickSubscribers.size > 0 ? requestAnimationFrame(runTick) : null;
}

function subscribeTick(fn: TickFn): () => void {
  tickSubscribers.add(fn);
  if (tickRafId === null) tickRafId = requestAnimationFrame(runTick);
  return () => {
    tickSubscribers.delete(fn);
    if (tickSubscribers.size === 0 && tickRafId !== null) {
      cancelAnimationFrame(tickRafId);
      tickRafId = null;
    }
  };
}

interface GlitchTypeTextProps {
  loading: boolean;
  value: string | number | null | undefined;
  className?: string;
  mode?: "auto" | "text" | "number";
  revealMs?: number;
  charset?: string;
  placeholderWidth?: number | "auto";
}

/**
 * CLI-style animated text component with type-in and scramble effects.
 * 
 * Usage:
 * - For inline metrics: <GlitchTypeText loading={isLoading} value={value} />
 * - Do NOT wrap tables, charts, or large components
 * 
 * Behavior:
 * - While loading or value is null/undefined: shows blinking caret only
 * - On reveal: animates with type-in + scramble effect
 * - Respects prefers-reduced-motion (shows final value immediately)
 * - Only animates strings and numbers (rejects React nodes, objects, arrays)
 */
export function GlitchTypeText({
  loading,
  value,
  className,
  mode = "auto",
  revealMs,
  charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  placeholderWidth = "auto",
}: GlitchTypeTextProps) {
  const [displayText, setDisplayText] = useState<string>("");
  const [isAnimating, setIsAnimating] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);
  const prefersReducedMotion = useRef<boolean>(false);
  const prevValueRef = useRef<string | number | null | undefined>(value);
  const hasAnimatedRef = useRef(false);

  // Detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      prefersReducedMotion.current = mediaQuery.matches;
    }
  }, []);

  // Cleanup ticker subscription on unmount
  useEffect(() => {
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, []);

  // Handle value changes
  useEffect(() => {
    // If value is not animatable (React node, object, etc.), render as-is
    if (!isAnimatableValue(value)) {
      setDisplayText("");
      setIsAnimating(false);
      unsubRef.current?.();
      unsubRef.current = null;
      return;
    }

    const stringValue = String(value);
    const isEmpty = loading || value === null || value === undefined || stringValue === "";

    // While loading or empty: show caret only
    if (isEmpty) {
      setDisplayText("");
      setIsAnimating(false);
      unsubRef.current?.();
      unsubRef.current = null;
      hasAnimatedRef.current = false;
      return;
    }

    // If value changed but we're not loading, decide whether to re-animate
    const valueChanged = prevValueRef.current !== value;
    prevValueRef.current = value;

    // Skip animation if:
    // - User prefers reduced motion
    // - Value changed but we already animated once (just show instantly)
    if (
      prefersReducedMotion.current ||
      (valueChanged && hasAnimatedRef.current && !loading)
    ) {
      // Kill any in-flight animation of the PREVIOUS value: its tick
      // closure holds the old string and would otherwise keep scrambling —
      // and finally overwrite — the new value we set here.
      unsubRef.current?.();
      unsubRef.current = null;
      setDisplayText(stringValue);
      setIsAnimating(false);
      hasAnimatedRef.current = true;
      return;
    }

    // Start reveal animation
    if (!hasAnimatedRef.current || (loading === false && valueChanged)) {
      // Same guard: never leave a previous value's animation running
      unsubRef.current?.();
      unsubRef.current = null;
      setIsAnimating(true);
      hasAnimatedRef.current = true;

      // Calculate timing (same pacing as the old setInterval version)
      const targetLength = stringValue.length;
      const isLongString = targetLength > 40;
      const baseTypeInterval = isLongString ? 7.5 : 15; // ms per character
      const typeInterval = revealMs ? revealMs / targetLength : baseTypeInterval;
      const scrambleInterval = isLongString ? 12.5 : 25; // ms between scramble refreshes

      // Locked-count is derived from elapsed time (not incremented per tick)
      // so pacing stays correct even when frames outpace or lag typeInterval.
      let start: number | null = null;
      let lastScrambleAt = -Infinity;
      let lastLocked = -1;

      unsubRef.current = subscribeTick((now) => {
        if (start === null) start = now;
        const lockedCount = Math.min(
          targetLength,
          Math.floor((now - start) / typeInterval)
        );

        if (lockedCount >= targetLength) {
          setDisplayText(stringValue);
          setIsAnimating(false);
          unsubRef.current?.();
          unsubRef.current = null;
          return;
        }

        // Only re-render when a new char locks or the scramble tail is due
        if (lockedCount === lastLocked && now - lastScrambleAt < scrambleInterval) {
          return;
        }
        lastLocked = lockedCount;
        lastScrambleAt = now;

        const locked = stringValue.slice(0, lockedCount);
        const remaining = targetLength - lockedCount;
        let scrambled = "";
        for (let i = 0; i < remaining; i++) {
          scrambled += charset[Math.floor(Math.random() * charset.length)];
        }

        setDisplayText(locked + scrambled);
      });
    } else {
      // Value already set, just update
      setDisplayText(stringValue);
    }
  }, [loading, value, revealMs, charset]);

  // Determine if we should show caret
  const showCaret = loading || value === null || value === undefined || !isAnimatableValue(value) || String(value) === "";

  // For non-animatable values, return children/value as-is (no animation wrapper)
  if (!isAnimatableValue(value) && !showCaret) {
    return <>{value}</>;
  }

  // Determine width reservation for numbers (using inline style since Tailwind doesn't support dynamic classes)
  const widthStyle =
    mode === "number" && placeholderWidth !== "auto" && typeof placeholderWidth === "number"
      ? { minWidth: `${placeholderWidth}ch` }
      : undefined;

  return (
    <span
      className={cn(
        mode === "number" && "tabular-nums",
        className
      )}
      style={widthStyle}
    >
      {showCaret ? <BlinkCaret /> : displayText || <BlinkCaret />}
    </span>
  );
}