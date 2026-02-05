"use client";

import React, { useMemo } from "react";

const GLYPHS = [
  ..."アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン",
  ..."ｦｧｨｩｪｫｬｭｮｯｰ",
  ..."日月火水木金土天地人心光闇門"
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function makeColumnText(len: number) {
  let s = "";
  for (let i = 0; i < len; i++) s += GLYPHS[randInt(0, GLYPHS.length - 1)] + "\n";
  return s;
}

export function MatrixRain({ columns = 28 }: { columns?: number }) {
  const cols = useMemo(() => {
    return Array.from({ length: columns }).map((_, i) => {
      const left = (i / columns) * 100;
      const duration = randInt(3, 7);
      const delay = -randInt(0, duration);
      const len = randInt(16, 42);
      const fontSize = randInt(12, 18);
      const opacity = Math.random() * 0.35 + 0.45;

      return {
        key: `col-${i}`,
        style: {
          left: `${left}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
          fontSize: `${fontSize}px`,
          opacity
        } as React.CSSProperties,
        text: makeColumnText(len)
      };
    });
  }, [columns]);

  return (
    <div className="matrix-rain" aria-hidden="true">
      {cols.map((c) => (
        <div key={c.key} className="matrix-rain__col" style={c.style}>
          {c.text}
        </div>
      ))}
      <div className="matrix-rain__fade" />
    </div>
  );
}
