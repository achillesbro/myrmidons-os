interface FolderSvgProps {
  isSelected: boolean;
}

/**
 * Folder dimensions in viewBox units
 * Using a reasonable aspect ratio that matches typical button sizes
 */
export const FOLDER_WIDTH = 400;
export const FOLDER_HEIGHT = 120;
export const CORNER_CUT = 18;

/**
 * Clip path for the folder with 45-degree cut corners
 * Top-left: (18, 0) to (0, 18)
 * Bottom-right: (width-18, height) to (width, height-18)
 */
export const FOLDER_CLIP_PATH = `polygon(
  ${CORNER_CUT}px 0%,
  100% 0%,
  100% calc(100% - ${CORNER_CUT}px),
  calc(100% - ${CORNER_CUT}px) 100%,
  0% 100%,
  0% ${CORNER_CUT}px
)`;

export function FolderSvg({ isSelected }: FolderSvgProps) {
  const width = FOLDER_WIDTH;
  const height = FOLDER_HEIGHT;
  const cut = CORNER_CUT;

  // Outer border path with cut corners
  // Top-left cut: (18, 0) -> (0, 18)
  // Bottom-right cut: (width-18, height) -> (width, height-18)
  const outerPath = `M${cut} 0 L${width} 0 L${width} ${height - cut} L${width - cut} ${height} L0 ${height} L0 ${cut} Z`;

  const inset6 = 6;

  // Inner border: uniform 6px inset from outer on all sides
  const innerPath6 = `M${cut + inset6} ${inset6} L${width - inset6} ${inset6} L${width - inset6} ${height - cut - inset6} L${width - cut - inset6} ${height - inset6} L${inset6} ${height - inset6} L${inset6} ${cut + inset6} Z`;

  // Main body fill: same as inner border shape
  const mainBodyFillPath = innerPath6;

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ shapeRendering: "crispEdges" }}
    >
      {/* Main body fill - slightly transparent so terminal texture bleeds */}
      <path
        d={mainBodyFillPath}
        fill="var(--panel)"
        stroke="none"
        opacity="0.88"
      />
      {/* Outer border - main border with cut corners */}
      <path
        d={outerPath}
        fill="transparent" 
        stroke="var(--text)"
        strokeWidth="2"
        className={isSelected ? "opacity-100" : "opacity-100"}
      />
      {/* Inner border - uniform 6px inset on all sides */}
      <path
        d={innerPath6}
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
      />
    </svg>
  );
}
