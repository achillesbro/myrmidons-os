import { cn } from "@/lib/utils";

interface ShardSvgProps {
  fileId: string;
  isSelected: boolean;
}

/**
 * Bracket and cell dimensions in viewBox units
 */
export const BRACKET_WIDTH = 48;
export const GAP = 12;
export const CELL_WIDTH = 320;
export const TOTAL_WIDTH = BRACKET_WIDTH + GAP + CELL_WIDTH;

/**
 * Clip path for the bracket (simple rectangle covering the bracket area)
 * Bracket is 48/380 = 12.63% of total width
 */
export const BRACKET_CLIP_PATH = "polygon(0% 0%, 12.63% 0%, 12.63% 100%, 0% 100%)";

/**
 * Clip path polygon that matches the cell's border shape with bottom-right cutout
 * Cell starts at 60/380 = 15.79% and ends at 100%
 * Bottom-right corner: 60 + 256 = 316px = 83.16% of total width
 * Used for clipping the backplate div to match the cell border (when element uses inset-0)
 */
export const CELL_CLIP_PATH = "polygon(15.79% 0%, 100% 0%, 100% 85%, 83.16% 100%, 15.79% 100%)";

/**
 * Clip path for cell when the element is positioned at the cell's left edge (left-[18.37%])
 * This clip path is relative to the element itself, not the container
 * Bottom-right corner: 256/320 = 80% of cell width
 */
export const CELL_CLIP_PATH_RELATIVE = "polygon(0% 0%, 100% 0%, 100% 85%, 80% 100%, 0% 100%)";

/**
 * @deprecated Use CELL_CLIP_PATH instead
 * Kept for backward compatibility
 */
export const SHARD_CLIP_PATH = CELL_CLIP_PATH;

/**
 * Shard height in pixels (matches the SVG viewBox aspect ratio, scaled down for landing page)
 */
export const SHARD_HEIGHT = "160px";

/**
 * Returns HTML signal marks (divs) for the footer overlay based on fileId
 * Matching the new design: 3 small squares with varying opacity
 */
export function getSignalMarks(fileId: string) {
  // All marks are w-1 h-1, with two at 40% opacity and one at 10% opacity
  return [
    <div key="1" className="w-1 h-1 bg-border/40" />,
    <div key="2" className="w-1 h-1 bg-border/40" />,
    <div key="3" className="w-1 h-1 bg-border/10" />,
  ];
}

export function ShardSvg({ fileId, isSelected }: ShardSvgProps) {
  const CELL_OFFSET = BRACKET_WIDTH + GAP;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${TOTAL_WIDTH} 480`}
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ shapeRendering: "crispEdges" }}
    >
      {/* Bracket - with left cutout for depth (45-degree angles) */}
      <path
        d={`M0 0L${BRACKET_WIDTH} 0L${BRACKET_WIDTH} 480L0 480L0 220L12 208L12 112L0 100Z`}
        fill="transparent"
        stroke="var(--text)"
        strokeWidth="2"
      />
      
      {/* Outer border - matches clip-path shape, shifted right */}
      <path
        d={`M${CELL_OFFSET} 0L${320 + CELL_OFFSET} 0L${320 + CELL_OFFSET} 408L${256 + CELL_OFFSET} 480L${CELL_OFFSET} 480Z`}
        fill="transparent"
        stroke="var(--text)"
        strokeWidth="2"
        className={isSelected ? "opacity-100" : "opacity-100"}
      />
      {/* Inner border - inset border for depth (6px inset, matching outer border shape exactly), shifted right */}
      <path
        d={`M${6 + CELL_OFFSET} 6L${314 + CELL_OFFSET} 6L${314 + CELL_OFFSET} 402L${250 + CELL_OFFSET} 474L${6 + CELL_OFFSET} 474Z`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
      />
      {/* Third inner border - deeper inset (12px inset) positioned in central area, matching cell shape */}
      <path
        d={`M${12 + CELL_OFFSET} 200L${308 + CELL_OFFSET} 200L${308 + CELL_OFFSET} 396L${244 + CELL_OFFSET} 468L${12 + CELL_OFFSET} 468Z`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
      />
    </svg>
  );
}