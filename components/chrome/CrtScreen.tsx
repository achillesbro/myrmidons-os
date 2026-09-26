"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { playSfx, sfxBlocked, sfxReady, startHum, stopHum } from "@/lib/terminal/sfx";

/**
 * CRT tube for the /terminal page, after the teaser's shader. The page renders through an
 * SVG displacement filter (barrel curvature, offset = half-size * c * K * |c|^2, so the
 * centre stays flat and the edges bend into a black bezel), with glass layers (scanlines,
 * vignette) inside the warp so they curve too, and the animated layers (rolling band) on top
 * in plain alpha: anything changing inside, or blending with, a filtered subtree re-runs the
 * filter every frame. Plays the power-on beam + degauss (and their sounds) when it powers on,
 * and only then mounts its children (the terminal boots with it). The degauss is the
 * teaser's: its hue field, same math, painted on two canvases blended over the picture, and
 * an RGB fringe in the filter — both only while the power-on runs. Off below md, with
 * ?crt=0, and with the status bar's CRT toggle.
 *
 * The warp is visual only: hit-testing stays on the flat layout, so a target near a corner
 * sits up to ~K * width away from where it appears. Pointer events are remapped to the
 * flat point the tube shows under the cursor (`unwarp`), so clicks land on what they see.
 */
const K = 0.03;                                            // the teaser uses 0.045
// The warp is a share of the screen, so its pixel offset — and the resampling that softens
// text — grows with the resolution. Capped at what a laptop screen gets, so a 1440p monitor
// reads as well as a MacBook (it curves less, in relative terms).
const MAX_WARP_PX = 48;
const kFor = (w: number, h: number) => Math.min(K, MAX_WARP_PX / Math.max(w, h));
const MAP = 128;                                           // displacement map resolution
// feDisplacementMap samples the page nearest-neighbour: where the offset crosses a pixel
// boundary a row or column is skipped or doubled (broken strokes, broken 1px lines). So the
// warp is supersampled: maps nudged by a sub-pixel tap, averaged. The tap spread follows the
// curvature: zero in the flat centre (text stays crisp), ~SPREAD px at the edges. On a 2x
// display the artifact is half the size, so two taps do (and the filter costs half).
const TAPS: [number, number][] = [[-1, -1], [1, 1], [1, -1], [-1, 1]];
const SPREAD = 0.5;
const WARM_MS = 1500;                                      // power-on: beam, degauss, then steady
const DEGAUSS_AT = 0.55;                                   // s after power-on (the sound plays then too)
const OFF_MS = 800;                                        // power-off animation

const CRT_STORE = "myrmidons.crt";
export function crtEnabled(): boolean {
  try { return localStorage.getItem(CRT_STORE) !== "off"; } catch { return true; }
}
export function setCrtEnabled(on: boolean) {
  try { localStorage.setItem(CRT_STORE, on ? "on" : "off"); } catch { /* private mode: session only */ }
  window.dispatchEvent(new Event("myrmidons:crt"));
}
/** Collapses the picture (when a tube is on). Returns the ms to wait before leaving the page. */
export function powerOffCrt(): number {
  if (document.documentElement.dataset.crt === undefined) return 0;
  window.dispatchEvent(new Event("myrmidons:poweroff"));
  return OFF_MS;
}

/** The supersampling displacement maps for a w x h box, and the scale they encode for. */
function barrelMaps(w: number, h: number, taps: [number, number][]) {
  const k = kFor(w, h);
  const scale = 2.1 * (k * Math.max(w, h) + SPREAD);       // max corner offset + tap spread
  const hrefs: string[] = [];
  for (const [tx, ty] of taps) {
    const c = document.createElement("canvas");
    c.width = c.height = MAP;
    const g = c.getContext("2d");
    if (!g) return null;
    const img = g.createImageData(MAP, MAP);
    for (let j = 0; j < MAP; j++) {
      for (let i = 0; i < MAP; i++) {
        const x = ((i + 0.5) / MAP) * 2 - 1, y = ((j + 0.5) / MAP) * 2 - 1, r2 = x * x + y * y;
        const s = SPREAD * Math.min(1, r2 / 1.2);          // tap spread grows with the curvature
        const p = (j * MAP + i) * 4;                       // offset = scale * (channel - 0.5)
        img.data[p] = 127.5 + (255 * ((w / 2) * x * k * r2 + tx * s)) / scale;
        img.data[p + 1] = 127.5 + (255 * ((h / 2) * y * k * r2 + ty * s)) / scale;
        img.data[p + 2] = 128;
        img.data[p + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    hrefs.push(c.toDataURL());
  }
  return { hrefs, scale };
}

/** The flat-layout point the tube shows at (sx, sy): the filter paints source(p + D(p)) at p. */
function unwarp(sx: number, sy: number, w: number, h: number): [number, number] {
  const k = kFor(w, h), x = (sx / w) * 2 - 1, y = (sy / h) * 2 - 1, r2 = x * x + y * y;
  return [sx + (w / 2) * x * k * r2, sy + (h / 2) * y * k * r2];
}

const FOCUSABLE = "input, textarea, select, button, a[href], [tabindex]";

/** Redirects a pointer event to the element the tube shows under it. Events over the element
 *  that is really there pass through untouched (the flat centre stays fully native: caret
 *  placement, text selection); only where the picture and the layout disagree is the event
 *  replayed on the right element, with focus moved by hand (a synthetic mousedown does not). */
function remapPointer(e: PointerEvent | MouseEvent, tube: HTMLElement, w: number, h: number) {
  if (!e.isTrusted) return;
  const r = tube.getBoundingClientRect();
  const [qx, qy] = unwarp(e.clientX - r.left, e.clientY - r.top, w, h);
  const target = document.elementFromPoint(qx + r.left, qy + r.top);
  if (!target || target === e.target || !tube.contains(target)) return;
  e.stopImmediatePropagation();
  e.preventDefault();                                      // no focus, selection or compat mouse event here
  const p = e as PointerEvent;
  const init: PointerEventInit = {
    bubbles: true, cancelable: true, composed: true, view: window, detail: e.detail,
    screenX: e.screenX + (qx - (e.clientX - r.left)), screenY: e.screenY + (qy - (e.clientY - r.top)),
    clientX: qx + r.left, clientY: qy + r.top, button: e.button, buttons: e.buttons,
    ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
    pointerId: p.pointerId, pointerType: p.pointerType, isPrimary: p.isPrimary, pressure: p.pressure,
  };
  if (e.type === "pointerdown") {
    target.dispatchEvent(new PointerEvent("pointerdown", init));
    target.dispatchEvent(new MouseEvent("mousedown", init));
    target.closest<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  } else if (e.type === "pointerup") {
    target.dispatchEvent(new PointerEvent("pointerup", init));
    target.dispatchEvent(new MouseEvent("mouseup", init));
  } else {
    target.dispatchEvent(new MouseEvent(e.type, init));    // click, dblclick: activation runs on these
  }
}

// ---- degauss: the teaser shader's magnetised colour blotches, verbatim
const TAU = Math.PI * 2;
const sstep = (a: number, b: number, x: number) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const degaussAt = (t: number) => (t < DEGAUSS_AT ? 0 : sstep(DEGAUSS_AT, DEGAUSS_AT + 0.07, t) * Math.exp(-(t - DEGAUSS_AT) / 0.2));
const FIELD = 8;                                           // the field is soft: painted at 1/8 resolution

/** The shader mixes col -> col * (0.6 + 0.8 * rainbow) + rainbow * 0.12 by 0.75 * degauss. On a
 *  DOM picture that is a multiply layer (the factor, capped at 1) and a plus-lighter layer (the
 *  additive term, plus the part of the factor above 1 that multiply cannot give). */
function paintDegauss(mul: HTMLCanvasElement, add: HTMLCanvasElement, t: number, env: number) {
  const w = mul.width, h = mul.height, gm = mul.getContext("2d"), ga = add.getContext("2d");
  if (!gm || !ga) return;
  const im = gm.createImageData(w, h), ia = ga.createImageData(w, h), a = 0.75 * env;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const dx = (i + 0.5) / w - 0.5, dy = (j + 0.5) / h - 0.5;
      const hue = 0.9 * Math.sin(dx * 5 + t * 3.1) + 0.8 * Math.cos(dy * 4.2 - t * 2.3) + 0.6 * Math.sin((dx + dy) * 7 + t * 5);
      const p = (j * w + i) * 4;
      for (let c = 0; c < 3; c++) {
        const r = 0.5 + 0.5 * Math.cos(TAU * (hue * 0.35 + c * 0.33));
        const m = 1 - 0.4 * a + 0.8 * a * r;
        im.data[p + c] = 255 * Math.min(1, m);
        ia.data[p + c] = 255 * Math.min(1, a * 0.12 * r + Math.max(0, m - 1) * 0.3);
      }
      im.data[p + 3] = 255; ia.data[p + 3] = 255;
    }
  }
  gm.putImageData(im, 0, 0); ga.putImageData(ia, 0, 0);
}

// The mouse inside the tube: a chunky arrow, 2px per bit
const ARROW = [
  "w..........", "ww.........", "w#w........", "w##w.......", "w###w......", "w####w.....", "w#####w....",
  "w######w...", "w#######w..", "w########w.", "w#####wwwww", "w##w##w....", "w#w.w##w...", "ww..w##w...",
  "w....w##w..", ".....w##w..", "......ww...",
];
const CURSOR = (() => {
  const rects = ARROW.flatMap((row, y) => [...row].flatMap((ch, x) =>
    ch === "." ? [] : [`<rect x="${x * 2}" y="${y * 2}" width="2" height="2" fill="${ch === "w" ? "#fff" : "#000"}"/>`]));
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="34" shape-rendering="crispEdges">${rects.join("")}</svg>`)}") 1 1, auto`;
})();

export function CrtScreen({ children }: { children: ReactNode }) {
  const tubeRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const mulRef = useRef<HTMLCanvasElement>(null);
  const addRef = useRef<HTMLCanvasElement>(null);
  const rRef = useRef<SVGFEOffsetElement>(null);          // the fringe: R and B pulled apart
  const bRef = useRef<SVGFEOffsetElement>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);   // null until the client knows
  const [powered, setPowered] = useState(false);           // children mount on power-on, then stay
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [warm, setWarm] = useState(false);                 // power-on played: beam + degauss unmount
  const [off, setOff] = useState(false);                   // power-off playing

  useEffect(() => {
    const off = new URLSearchParams(window.location.search).get("crt") === "0";
    const wide = window.matchMedia("(min-width: 768px)");
    const sync = () => setEnabled(!off && wide.matches && crtEnabled());
    sync();
    wide.addEventListener("change", sync);
    window.addEventListener("myrmidons:crt", sync);
    return () => { wide.removeEventListener("change", sync); window.removeEventListener("myrmidons:crt", sync); };
  }, []);

  // Standby while the browser still refuses sound (no click or key press on this page yet, e.g.
  // a reload): any key powers on, so the power-on and boot play with their sounds, in step.
  const powerOn = useCallback(() => void sfxReady().then(() => setPowered(true)), []);
  useEffect(() => {
    if (enabled === null || powered) return;
    if (!enabled) return setPowered(true);                 // no tube on small screens: nothing to wait for
    if (!sfxBlocked()) return powerOn();
    const onKey = (e: KeyboardEvent) => {                  // Esc and shortcuts don't unlock audio
      if (e.key !== "Escape" && !e.metaKey && !e.ctrlKey && !e.altKey) powerOn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, powered, powerOn]);

  useEffect(() => {                                        // power-on: sounds and the degauss follow the CSS animation
    if (!enabled || !powered) return;
    setWarm(false);
    playSfx("switch");
    playSfx("spinup", { delay: 0.02 });
    playSfx("crt", { delay: 0.06 });                       // the beam line
    playSfx("degauss", { delay: DEGAUSS_AT });             // the colour wobble
    startHum({ delay: 3, fade: 2.5 });                     // the spin-up hands over to the bed
    const t0 = performance.now();
    let raf = 0;
    const frame = () => {
      const t = (performance.now() - t0) / 1000, env = degaussAt(t);
      if (mulRef.current && addRef.current) paintDegauss(mulRef.current, addRef.current, t, env);
      const dx = (6 * env).toFixed(2);
      rRef.current?.setAttribute("dx", dx);
      bRef.current?.setAttribute("dx", `-${dx}`);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const warmT = setTimeout(() => { cancelAnimationFrame(raf); setWarm(true); }, WARM_MS);
    return () => { clearTimeout(warmT); cancelAnimationFrame(raf); stopHum(); };
  }, [enabled, powered]);

  useEffect(() => {                                        // power-off: the picture collapses, the machine stops
    const onOff = () => {
      setOff(true);
      playSfx("zap");
      playSfx("switch", { delay: 0.45, rate: 0.9 });
      stopHum(0.6);
    };
    window.addEventListener("myrmidons:poweroff", onOff);
    return () => window.removeEventListener("myrmidons:poweroff", onOff);
  }, []);

  useEffect(() => {
    const el = screenRef.current;
    if (!el || !enabled) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled, powered]);

  useEffect(() => {                                        // the global Scanlines overlay steps aside
    if (!enabled) return;
    document.documentElement.dataset.crt = "";
    return () => { delete document.documentElement.dataset.crt; };
  }, [enabled]);

  const map = useMemo(() => {
    if (!enabled || !size) return null;
    return barrelMaps(size.w, size.h, window.devicePixelRatio >= 2 ? TAPS.slice(0, 2) : TAPS);
  }, [enabled, size]);

  useEffect(() => {                                        // clicks land on what the tube shows
    const tube = tubeRef.current;
    if (!tube || !map || !size) return;
    const on = (e: Event) => remapPointer(e as PointerEvent, tube, size.w, size.h);
    const types = ["pointerdown", "pointerup", "click", "dblclick"];
    for (const t of types) tube.addEventListener(t, on, true);
    return () => { for (const t of types) tube.removeEventListener(t, on, true); };
  }, [map, size]);

  if (enabled === null) return <div className="crt-pending" />;
  if (enabled && !powered) return (
    <div className="crt-tube" style={{ "--crt-cursor": CURSOR } as React.CSSProperties}>
      <button type="button" autoFocus onClick={powerOn}
        className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center font-mono focus:outline-none">
        <span className="mb-2 h-1.5 w-1.5 rounded-full bg-gold animate-pulse-slow"
          style={{ boxShadow: "0 0 6px color-mix(in oklab, var(--gold) 55%, transparent), 0 0 12px color-mix(in oklab, var(--gold) 30%, transparent)" }} />
        <span className="text-lg uppercase tracking-widest text-text">STANDBY</span>
        <span className="text-sm text-text-dim">Press any key to power on.</span>
      </button>
    </div>
  );
  // One tree shape with the tube on or off, so crossing the md breakpoint never remounts the page.
  const warps = (id: string, fringe: boolean) => size && map && (
    <filter id={id} filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
      x="0" y="0" width={size.w} height={size.h} colorInterpolationFilters="sRGB">
      {map.hrefs.map((href, i) => (
        <feImage key={`m${i}`} href={href} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result={`m${i}`} />
      ))}
      {map.hrefs.map((_, i) => (
        <feDisplacementMap key={`d${i}`} in="SourceGraphic" in2={`m${i}`} scale={map.scale} xChannelSelector="R" yChannelSelector="G" result={`d${i}`} />
      ))}
      {map.hrefs.length === 2 ? (
        <feComposite in="d0" in2="d1" operator="arithmetic" k2="0.5" k3="0.5" result="warp" />
      ) : (
        <>
          <feComposite in="d0" in2="d1" operator="arithmetic" k2="0.5" k3="0.5" result="d01" />
          <feComposite in="d2" in2="d3" operator="arithmetic" k2="0.5" k3="0.5" result="d23" />
          <feComposite in="d01" in2="d23" operator="arithmetic" k2="0.5" k3="0.5" result="warp" />
        </>
      )}
      {fringe && (                                         /* R and B pulled apart while the degauss runs */
        <>
          <feColorMatrix in="warp" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
          <feOffset ref={rRef} in="r" dx="0" dy="0" result="ro" />
          <feColorMatrix in="warp" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
          <feColorMatrix in="warp" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
          <feOffset ref={bRef} in="b" dx="0" dy="0" result="bo" />
          <feBlend in="ro" in2="g" mode="screen" result="rg" />
          <feBlend in="rg" in2="bo" mode="screen" />
        </>
      )}
    </filter>
  );
  return (
    <div ref={tubeRef} className={enabled ? "crt-tube" : undefined} style={enabled ? ({ "--crt-cursor": CURSOR } as React.CSSProperties) : undefined}>
      {enabled && (
        <svg className="absolute h-0 w-0" aria-hidden>
          {warps("crt-warp", false)}
          {!warm && warps("crt-warp-degauss", true)}
        </svg>
      )}
      <div className={enabled ? (off ? "crt-power crt-power-off" : "crt-power") : undefined}>
        <div ref={screenRef} className={enabled ? "crt-screen" : undefined}
          style={enabled && map ? { filter: `url(#${warm ? "crt-warp" : "crt-warp-degauss"})` } : undefined}>
          {children}
          {enabled && <div className="crt-glass" aria-hidden />}
        </div>
        {/* The degauss blends with the screen, so it sits beside it — inside .crt-fx (a stacking
            context of its own) a blend mode would only see .crt-fx's transparent backdrop */}
        {enabled && !warm && size && <canvas ref={mulRef} className="crt-degauss crt-degauss-mul" width={Math.ceil(size.w / FIELD)} height={Math.ceil(size.h / FIELD)} aria-hidden />}
        {enabled && !warm && size && <canvas ref={addRef} className="crt-degauss crt-degauss-add" width={Math.ceil(size.w / FIELD)} height={Math.ceil(size.h / FIELD)} aria-hidden />}
        {enabled && (
          <div className="crt-fx" aria-hidden>
            <div className="crt-roll-band" />
            {!warm && <div className="crt-beam" />}
          </div>
        )}
      </div>
    </div>
  );
}
