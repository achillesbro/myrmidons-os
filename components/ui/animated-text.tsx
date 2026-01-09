"use client";

import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Blinking caret component for loading states.
 * Uses CSS animation for performance.
 */
export function BlinkCaret({ className }: { className?: string }) {
  return (
    <span className={cn("inline w-[1px] animate-caret-blink", className)}>
      |
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
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrambleRef = useRef<NodeJS.Timeout | null>(null);
  const lockedCountRef = useRef<number>(0);
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

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (scrambleRef.current) clearInterval(scrambleRef.current);
    };
  }, []);

  // Handle value changes
  useEffect(() => {
    // If value is not animatable (React node, object, etc.), render as-is
    if (!isAnimatableValue(value)) {
      setDisplayText("");
      setIsAnimating(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (scrambleRef.current) clearInterval(scrambleRef.current);
      return;
    }

    const stringValue = String(value);
    const isEmpty = loading || value === null || value === undefined || stringValue === "";

    // While loading or empty: show caret only
    if (isEmpty) {
      setDisplayText("");
      setIsAnimating(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (scrambleRef.current) clearInterval(scrambleRef.current);
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
      setDisplayText(stringValue);
      setIsAnimating(false);
      hasAnimatedRef.current = true;
      return;
    }

    // Start reveal animation
    if (!hasAnimatedRef.current || (loading === false && valueChanged)) {
      setIsAnimating(true);
      hasAnimatedRef.current = true;
      lockedCountRef.current = 0;

      // Calculate timing
      const targetLength = stringValue.length;
      const baseTypeInterval = 15; // ms per character (doubled speed)
      const typeInterval = revealMs ? revealMs / targetLength : baseTypeInterval;
      const scrambleInterval = 25; // ms between scramble updates (doubled speed)

      // Type-in loop: lock one character at a time
      intervalRef.current = setInterval(() => {
        lockedCountRef.current++;

        if (lockedCountRef.current > targetLength) {
          // Animation complete
          setDisplayText(stringValue);
          setIsAnimating(false);
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (scrambleRef.current) clearInterval(scrambleRef.current);
          return;
        }

        // Build display: locked chars + scrambled tail
        const locked = stringValue.slice(0, lockedCountRef.current);
        const remaining = targetLength - lockedCountRef.current;
        let scrambled = "";
        for (let i = 0; i < remaining; i++) {
          scrambled += charset[Math.floor(Math.random() * charset.length)];
        }

        setDisplayText(locked + scrambled);
      }, typeInterval);

      // Scramble loop: refresh the tail characters
      scrambleRef.current = setInterval(() => {
        if (lockedCountRef.current >= targetLength) {
          if (scrambleRef.current) clearInterval(scrambleRef.current);
          return;
        }

        const locked = stringValue.slice(0, lockedCountRef.current);
        const remaining = targetLength - lockedCountRef.current;
        let scrambled = "";
        for (let i = 0; i < remaining; i++) {
          scrambled += charset[Math.floor(Math.random() * charset.length)];
        }

        setDisplayText(locked + scrambled);
      }, scrambleInterval);
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