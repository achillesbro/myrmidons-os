"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { playSfx, sfxBlocked, sfxReady } from "@/lib/terminal/sfx";

/**
 * CRT tube for the /terminal page, after the teaser's shader. The page renders through an
 * SVG displacement filter (barrel curvature, offset = half-size * c * K * |c|^2, so the
 * centre stays flat and the edges bend into a black bezel), with glass layers (scanlines,
 * vignette) inside the warp so they curve too, and the animated layers (grain, rolling band,
 * flicker) on top in plain alpha: anything changing inside, or blending with, a filtered
 * subtree re-runs the filter every frame. Plays the power-on beam + degauss (and their
 * sounds) when it powers on, and only then mounts its children (the terminal boots with it).
 * Off below md, and with ?crt=0.
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
// warp is supersampled: four maps, each nudged by a sub-pixel tap, averaged. The tap spread
// follows the curvature: zero in the flat centre (text stays crisp), ~SPREAD px at the edges.
const TAPS: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
const SPREAD = 0.5;

/** The four supersampling displacement maps for a w x h box, and the scale they encode for. */
function barrelMaps(w: number, h: number) {
  const k = kFor(w, h);
  const scale = 2.1 * (k * Math.max(w, h) + SPREAD);       // max corner offset + tap spread
  const hrefs: string[] = [];
  for (const [tx, ty] of TAPS) {
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

export function CrtScreen({ children }: { children: ReactNode }) {
  const tubeRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);   // null until the client knows
  const [powered, setPowered] = useState(false);           // children mount on power-on, then stay
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [warm, setWarm] = useState(false);                 // power-on played: beam + degauss unmount

  useEffect(() => {
    const off = new URLSearchParams(window.location.search).get("crt") === "0";
    const wide = window.matchMedia("(min-width: 768px)");
    const sync = () => setEnabled(!off && wide.matches);
    sync();
    wide.addEventListener("change", sync);
    return () => wide.removeEventListener("change", sync);
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

  useEffect(() => {                                        // power-on: sounds follow the CSS animation
    if (!enabled || !powered) return;
    playSfx("switch");
    playSfx("spinup", { delay: 0.02 });
    playSfx("crt", { delay: 0.06 });                       // the beam line
    playSfx("degauss", { delay: 0.55 });                   // the colour wobble
    const t = setTimeout(() => setWarm(true), 1500);
    return () => clearTimeout(t);
  }, [enabled, powered]);

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

  const map = useMemo(() => (enabled && size ? barrelMaps(size.w, size.h) : null), [enabled, size]);

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
    <div className="crt-tube">
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
  return (
    <div ref={tubeRef} className={enabled ? "crt-tube" : undefined}>
      {enabled && map && size && (
        <svg className="absolute h-0 w-0" aria-hidden>
          <filter id="crt-warp" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse"
            x="0" y="0" width={size.w} height={size.h} colorInterpolationFilters="sRGB">
            {map.hrefs.map((href, i) => (
              <feImage key={`m${i}`} href={href} x="0" y="0" width={size.w} height={size.h} preserveAspectRatio="none" result={`m${i}`} />
            ))}
            {map.hrefs.map((_, i) => (
              <feDisplacementMap key={`d${i}`} in="SourceGraphic" in2={`m${i}`} scale={map.scale} xChannelSelector="R" yChannelSelector="G" result={`d${i}`} />
            ))}
            <feComposite in="d0" in2="d1" operator="arithmetic" k2="0.5" k3="0.5" result="d01" />
            <feComposite in="d2" in2="d3" operator="arithmetic" k2="0.5" k3="0.5" result="d23" />
            <feComposite in="d01" in2="d23" operator="arithmetic" k2="0.5" k3="0.5" />
          </filter>
        </svg>
      )}
      <div className={enabled ? "crt-power" : undefined}>
        <div ref={screenRef} className={enabled ? "crt-screen" : undefined} style={enabled && map ? { filter: "url(#crt-warp)" } : undefined}>
          {children}
          {enabled && <div className="crt-glass" aria-hidden />}
        </div>
        {enabled && (
          <div className="crt-fx" aria-hidden>
            <div className="crt-grain" />
            <div className="crt-roll-band" />
            {!warm && <div className="crt-degauss" />}
            {!warm && <div className="crt-beam" />}
          </div>
        )}
      </div>
    </div>
  );
}
