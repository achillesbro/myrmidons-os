"use client";

import { forwardRef, useLayoutEffect, useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { BlinkCaret } from "@/components/ui/animated-text";
import { PhosphorAfterimage } from "@/components/terminal/PhosphorAfterimage";

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, value = "", onChange, onSelect, onClick, onKeyUp, ...props }, ref) => {
    const [selectionStart, setSelectionStart] = useState(0);
    const [caretLeft, setCaretLeft] = useState(0);
    const [cursorPulse, setCursorPulse] = useState(0);
    const [caretStyle, setCaretStyle] = useState<{ fontSize: string; lineHeight: number }>({ fontSize: "14px", lineHeight: 1 });
    const inputRef = useRef<HTMLInputElement | null>(null);
    const mirrorRef = useRef<HTMLSpanElement>(null);

    const setRefs = useCallback(
      (el: HTMLInputElement | null) => {
        inputRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref) ref.current = el;
      },
      [ref]
    );

    useLayoutEffect(() => {
      const input = inputRef.current;
      const mirror = mirrorRef.current;
      if (input && mirror) {
        const s = getComputedStyle(input);
        mirror.style.fontFamily = s.fontFamily;
        mirror.style.fontSize = s.fontSize;
        mirror.style.fontVariant = s.fontVariant;
        mirror.style.letterSpacing = s.letterSpacing;
        const paddingLeft = parseInt(s.paddingLeft, 10) || 0;
        setCaretLeft(paddingLeft + mirror.offsetWidth);
        setCaretStyle({ fontSize: s.fontSize, lineHeight: parseFloat(s.lineHeight) || 1 });
      }
    }, [value, selectionStart]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectionStart(e.target.selectionStart ?? 0);
        setCursorPulse((p) => p + 1);
        onChange?.(e);
      },
      [onChange]
    );

    return (
      <div className="relative flex w-full items-center">
        <span
          ref={mirrorRef}
          aria-hidden
          className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre border-0 bg-transparent p-0"
        >
          {String(value ?? "").slice(0, selectionStart)}
        </span>
        <input
          ref={setRefs}
          type="text"
          value={value}
          onChange={handleChange}
          onSelect={(e) => {
            setSelectionStart(e.currentTarget.selectionStart ?? 0);
            setCursorPulse((p) => p + 1);
            onSelect?.(e);
          }}
          onClick={(e) => {
            setSelectionStart(e.currentTarget.selectionStart ?? 0);
            setCursorPulse((p) => p + 1);
            onClick?.(e);
          }}
          onKeyUp={(e) => {
            setSelectionStart(e.currentTarget.selectionStart ?? 0);
            setCursorPulse((p) => p + 1);
            onKeyUp?.(e);
          }}
          className={cn(
            "flex w-full border border-border bg-bg-base px-3 py-2 text-sm font-mono caret-transparent",
            "placeholder:text-text-dim/30",
            "focus:outline-none focus:border-gold focus:ring-0",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        <span
          className="absolute pointer-events-none text-border"
          style={{
            left: caretLeft,
            top: "50%",
            transform: "translateY(calc(-50% - 0.06em))",
            fontSize: caretStyle.fontSize,
            lineHeight: caretStyle.lineHeight,
          }}
          aria-hidden
        >
          <PhosphorAfterimage trigger={cursorPulse} ghostClassName="opacity-60">
            <BlinkCaret />
          </PhosphorAfterimage>
        </span>
      </div>
    );
  }
);
Input.displayName = "Input";
