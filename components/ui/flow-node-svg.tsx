import { cn } from "@/lib/utils";

interface FlowNodeSvgProps {
  stateLabel: string; // e.g., "S0", "S1", etc.
  isActive?: boolean; // For future active-state highlighting
}

/**
 * Flow Node SVG Component
 * Matches shard SVG conventions for visual consistency
 * 
 * Conventions followed:
 * - Outer border: stroke="var(--text)", strokeWidth="2"
 * - Inner border: stroke="var(--border)", strokeWidth="1", inset by 6px
 * - Uses <path> elements (not <rect>) for borders
 * - shapeRendering="crispEdges" for sharp edges
 * - State rail is a distinct region for future glow effects
 */
export function FlowNodeSvg({ stateLabel, isActive = false }: FlowNodeSvgProps) {
  // Dimensions (viewBox units)
  const STATE_RAIL_WIDTH = 32; // Left rail for state label (S0, S1, etc.)
  const CONTENT_WIDTH = 188; // Main content area
  const TOTAL_WIDTH = STATE_RAIL_WIDTH + CONTENT_WIDTH; // 220
  const TOTAL_HEIGHT = 75; // Reduced by 10% from 83px (83 * 0.9 = 74.7, rounded to 75)
  
  // Border insets
  const OUTER_INSET = 0;
  const INNER_INSET = 6;
  
  // State rail dimensions
  const RAIL_X = OUTER_INSET;
  const RAIL_Y = OUTER_INSET;
  const RAIL_W = STATE_RAIL_WIDTH;
  const RAIL_H = TOTAL_HEIGHT;
  
  // Content area dimensions
  const CONTENT_X = STATE_RAIL_WIDTH;
  const CONTENT_Y = OUTER_INSET;
  const CONTENT_W = CONTENT_WIDTH;
  const CONTENT_H = TOTAL_HEIGHT;
  
  // Divider line (separates primary and secondary text)
  const DIVIDER_Y = TOTAL_HEIGHT / 2; // Center of height
  
  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`}
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ shapeRendering: "crispEdges" }}
    >
      {/* State rail outer border - distinct region for future glow effects */}
      <path
        className="flow-node-rail"
        data-part="rail"
        d={`M${RAIL_X} ${RAIL_Y}L${RAIL_X + RAIL_W} ${RAIL_Y}L${RAIL_X + RAIL_W} ${RAIL_Y + RAIL_H}L${RAIL_X} ${RAIL_Y + RAIL_H}Z`}
        fill="transparent"
        stroke="var(--text)"
        strokeWidth="2"
      />
      
      {/* State rail inner border */}
      <path
        className="flow-node-rail-inner"
        data-part="rail-inner"
        d={`M${RAIL_X + INNER_INSET} ${RAIL_Y + INNER_INSET}L${RAIL_X + RAIL_W - INNER_INSET} ${RAIL_Y + INNER_INSET}L${RAIL_X + RAIL_W - INNER_INSET} ${RAIL_Y + RAIL_H - INNER_INSET}L${RAIL_X + INNER_INSET} ${RAIL_Y + RAIL_H - INNER_INSET}Z`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
      />
      
      {/* Content area outer border */}
      <path
        className="flow-node-content-outer"
        data-part="content-outer"
        d={`M${CONTENT_X} ${CONTENT_Y}L${CONTENT_X + CONTENT_W} ${CONTENT_Y}L${CONTENT_X + CONTENT_W} ${CONTENT_Y + CONTENT_H}L${CONTENT_X} ${CONTENT_Y + CONTENT_H}Z`}
        fill="transparent"
        stroke="var(--text)"
        strokeWidth="2"
      />
      
      {/* Content area inner border */}
      <path
        className="flow-node-content-inner"
        data-part="content-inner"
        d={`M${CONTENT_X + INNER_INSET} ${CONTENT_Y + INNER_INSET}L${CONTENT_X + CONTENT_W - INNER_INSET} ${CONTENT_Y + INNER_INSET}L${CONTENT_X + CONTENT_W - INNER_INSET} ${CONTENT_Y + CONTENT_H - INNER_INSET}L${CONTENT_X + INNER_INSET} ${CONTENT_Y + CONTENT_H - INNER_INSET}Z`}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
      />
      
      {/* Divider line - separates primary and secondary text */}
      <line
        className="flow-node-divider"
        data-part="divider"
        x1={CONTENT_X + INNER_INSET}
        y1={DIVIDER_Y}
        x2={CONTENT_X + CONTENT_W - INNER_INSET}
        y2={DIVIDER_Y}
        stroke="var(--border)"
        strokeWidth="1"
        opacity="0.3"
      />
    </svg>
  );
}
