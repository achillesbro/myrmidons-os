"use client";

import { ReactNode, useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface FloatingWindowProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** When true, render as a docked terminal split pane (right side, no floating/drag). */
  docked?: boolean;
  /** When true (e.g. small viewport), render as a full-height overlay sheet instead of split. */
  overlaySheet?: boolean;
}

export function FloatingWindow({ open, title, onClose, children, docked = false, overlaySheet = false }: FloatingWindowProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [windowStart, setWindowStart] = useState({ x: 0, y: 0 });
  const [isExpanding, setIsExpanding] = useState(true); // Start as true so window begins small
  const windowRef = useRef<HTMLDivElement>(null);
  const titleBarRef = useRef<HTMLDivElement>(null);

  // Track if window has been positioned (for dragging)
  const [isPositioned, setIsPositioned] = useState(false);

  // Initialize position to center when first opened, trigger expand animation (floating only)
  useEffect(() => {
    if (docked) return;
    if (open) {
      // Only set initial center position if not already positioned (first open or after close)
      if (!isPositioned) {
        const width = Math.min(1100, window.innerWidth * 0.92);
        const height = Math.min(720, window.innerHeight * 0.82);
        // Calculate center position - with transformOrigin: center center, this will keep it centered at any scale
        const centerX = (window.innerWidth - width) / 2;
        const centerY = (window.innerHeight - height) / 2;
        setPosition({ x: centerX, y: centerY });
        setIsPositioned(true);
      }
      // Ensure window starts small
      setIsExpanding(true);
      // Use multiple requestAnimationFrame calls + timeout to ensure initial state is rendered
      // before triggering the transition to full size
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              setIsExpanding(false); // This triggers the 1 second transition
              // After expansion completes, recalculate center position for full size
              if (windowRef.current) {
                const width = Math.min(1100, window.innerWidth * 0.92);
                const height = Math.min(720, window.innerHeight * 0.82);
                const centerX = (window.innerWidth - width) / 2;
                const centerY = (window.innerHeight - height) / 2;
                setPosition({ x: centerX, y: centerY });
              }
            }, 100); // Delay to ensure initial scale(0.05) state is painted
          });
        });
      });
    } else {
      setIsExpanding(true); // Reset to small when closed
      setIsPositioned(false); // Reset positioning flag
    }
  }, [open, isPositioned, docked]);

  // Esc-to-close
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  // Handle pointer events for dragging (floating only)
  useEffect(() => {
    if (docked || !isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!windowRef.current) return;
      
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;
      
      let newX = windowStart.x + deltaX;
      let newY = windowStart.y + deltaY;
      
      // Clamp to viewport (keep at least 48px visible on each side)
      const rect = windowRef.current.getBoundingClientRect();
      const minVisible = 48;
      const maxX = window.innerWidth - minVisible;
      const maxY = window.innerHeight - minVisible;
      
      newX = Math.max(-rect.width + minVisible, Math.min(newX, maxX));
      newY = Math.max(-rect.height + minVisible, Math.min(newY, maxY));
      
      setPosition({ x: newX, y: newY });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [docked, isDragging, dragStart, windowStart]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (docked || !windowRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('button[aria-label="Close"]')) return;
    
    e.preventDefault();
    
    // Get the current visual position from the DOM
    const rect = windowRef.current.getBoundingClientRect();
    const currentX = rect.left;
    const currentY = rect.top;
    
    // Use the current visual position as the starting point for dragging
    setWindowStart({ x: currentX, y: currentY });
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    
    if (titleBarRef.current) {
      titleBarRef.current.setPointerCapture(e.pointerId);
    }
  };

  if (!open) return null;

  // Docked split pane: same surface as terminal, right side; parent sets width (clamp)
  if (docked) {
    return (
      <div
        ref={windowRef}
        className="flex flex-col h-full w-full min-w-0 bg-bg-base border-l border-border"
      >
        <div
          ref={titleBarRef}
          className="shrink-0 h-8 px-2 border-b border-border flex items-center justify-between gap-2 bg-bg-base"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-xs uppercase tracking-widest text-text-dim whitespace-nowrap">
              {title}
            </span>
            <span className="flex-1 h-px bg-border/60 shrink min-w-[8px]" aria-hidden />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="shrink-0 w-6 h-6 flex items-center justify-center font-mono text-text-dim hover:text-text text-xs focus:outline-none focus:ring-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {children}
        </div>
      </div>
    );
  }

  // Overlay sheet: full-height overlay when viewport too small for split (no drag, no global z-50)
  if (overlaySheet) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-bg-base" style={{ top: "3.5rem" }}>
        <div
          ref={titleBarRef}
          className="shrink-0 h-8 px-2 border-b border-border flex items-center justify-between gap-2 bg-bg-base"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-xs uppercase tracking-widest text-text-dim whitespace-nowrap">
              {title}
            </span>
            <span className="flex-1 h-px bg-border/60 shrink min-w-[8px]" aria-hidden />
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            className="shrink-0 w-6 h-6 flex items-center justify-center font-mono text-text-dim hover:text-text text-xs focus:outline-none focus:ring-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-3">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        ref={windowRef}
        className="absolute bg-bg-base border border-border shadow-lg pointer-events-auto cutCorners depthFrame"
        style={{
          width: "min(1100px, 92vw)",
          height: "min(720px, 82vh)",
          left: `${position.x}px`,
          top: `${position.y}px`,
          transform: isExpanding ? "scale(0.01)" : "scale(1)",
          transformOrigin: "center center",
          opacity: 1,
          transition: isDragging ? "none" : "transform 1000ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Title bar */}
        <div
          ref={titleBarRef}
          onPointerDown={handlePointerDown}
          className="h-12 px-3 border-b border-border bg-panel flex justify-between items-center cursor-move select-none"
        >
          <h3 className="font-mono font-bold text-white text-xs uppercase tracking-widest">
            {title}
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose();
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
            }}
            className="w-6 h-6 flex items-center justify-center text-text hover:text-white transition-colors focus:outline-none focus:ring-0 relative z-10"
            aria-label="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
        
        {/* Content */}
        <div className="h-[calc(100%-3rem)] overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
