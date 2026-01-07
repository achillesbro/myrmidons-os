"use client";

interface ScanlinesProps {
  opacity?: number;
  lineAlpha?: number;
  noise?: boolean;
  noiseOpacity?: number;
}

export function Scanlines({
  opacity,
  lineAlpha,
  noise = false,
  noiseOpacity = 0.2,
}: ScanlinesProps) {
  // Check feature toggle
  // In development, also check if env var is undefined (default to enabled for testing)
  const envValue = process.env.NEXT_PUBLIC_EFFECTS_CRT;
  const isEnabled =
    envValue === "1" ||
    envValue === "true" ||
    (process.env.NODE_ENV === "development" && envValue === undefined);

  if (!isEnabled) {
    return null;
  }

  // Use props or CSS variables (CSS variables will be used via calc() in the style)
  const finalOpacity = opacity ?? 0.15;
  const finalLineAlpha = lineAlpha ?? 0.12;

  // CSS for scanlines pattern: 5px line, 5px gap (total 10px)
  const scanlinesStyle: React.CSSProperties = {
    backgroundImage: `repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, ${finalLineAlpha}) 0px,
      rgba(255, 255, 255, ${finalLineAlpha}) 5px,
      transparent 5px,
      transparent 10px
    )`,
    backgroundSize: "100% 10px",
    mixBlendMode: "overlay",
  };

  // SVG noise pattern (lightweight, inline)
  const noiseDataUri = `data:image/svg+xml;base64,${btoa(
    `<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch"/>
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" opacity="0.4"/>
    </svg>`
  )}`;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[99999]"
      style={{ opacity: finalOpacity }}
      aria-hidden="true"
    >
      {/* Scanlines layer */}
      <div className="absolute inset-0" style={scanlinesStyle} />

      {/* Optional noise layer */}
      {noise && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url("${noiseDataUri}")`,
            backgroundSize: "200px 200px",
            opacity: noiseOpacity,
            mixBlendMode: "overlay",
          }}
        />
      )}
    </div>
  );
}

