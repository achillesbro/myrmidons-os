/**
 * Retro-PC sound effects for /terminal — the teaser's sound design (power switch, fan + disk
 * spin-up, CRT thump and static, degauss hum, BIOS POST beep, disk seeks, keyboard thocks),
 * synthesized in the browser into AudioBuffers on first use: no audio files.
 *
 * On by default. Silent until the page may play audio (a click or key press here, or the click
 * that navigated here) and while muted; sounds asked for before that are dropped, not queued.
 */
export type Sfx = "switch" | "crt" | "degauss" | "spinup" | "beep" | "seek" | "key" | "static"
  | "relay" | "whirr" | "whirrDown" | "latch" | "buzz" | "chirp" | "zap" | "hum" | "ping" | "twang";

const STORE = "myrmidons.sfx";
const MASTER = 0.6;
// Level of each sound, RMS dBFS before the master — the relative mix of the teaser's soundtrack.
const LEVEL: Record<Sfx, number> = {
  switch: -18, crt: -26, degauss: -28, spinup: -24, beep: -21, seek: -24, key: -22, static: -32,
  relay: -26, whirr: -28, whirrDown: -30, latch: -20, buzz: -22, chirp: -24, zap: -24,
  hum: -37, ping: -24, twang: -26,
};
const VARIANTS: Partial<Record<Sfx, number>> = { key: 6, seek: 5, static: 2, crt: 2 };
const MIN_GAP: Partial<Record<Sfx, number>> = { key: 0.03, seek: 0.035 };   // s: no machine-gun

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
const banks = new Map<Sfx, AudioBuffer[]>();
const lastAt = new Map<Sfx, number>();

export function sfxEnabled(): boolean {
  try { return localStorage.getItem(STORE) !== "off"; } catch { return true; }
}
export function setSfxEnabled(on: boolean) {
  try { localStorage.setItem(STORE, on ? "on" : "off"); } catch { /* private mode: session only */ }
  if (out) out.gain.value = on ? MASTER : 0;
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = sfxEnabled() ? MASTER : 0;
    out.connect(ctx.destination);
    const unlock = () => { if (ctx && ctx.state !== "running") void ctx.resume(); };
    window.addEventListener("pointerup", unlock, { passive: true });   // a tap only counts on release
    window.addEventListener("keydown", unlock);
  }
  if (ctx.state !== "running") { void ctx.resume(); return null; }
  return ctx;
}

/** Sound is on but the browser won't play any yet: this page hasn't had a click or key press. */
export function sfxBlocked(): boolean {
  return sfxEnabled() && !navigator.userActivation?.hasBeenActive;
}

/** Call from a click or key press: resolves once the audio runs (300ms at most), so the sounds
 *  that follow start in step with their animation. */
export function sfxReady(): Promise<void> {
  if (!sfxEnabled() || audio() || !ctx) return Promise.resolve();   // off, running, or no Web Audio
  return Promise.race([ctx.resume().catch(() => {}), new Promise<void>((r) => setTimeout(r, 300))]);
}

export function playSfx(name: Sfx, { delay = 0, gain = 1, rate = 1, pan = 0 } = {}) {
  if (!sfxEnabled()) return;
  const ac = audio();
  if (!ac || !out) return;
  const t = ac.currentTime + delay, gap = MIN_GAP[name];
  if (gap && t - (lastAt.get(name) ?? -1) < gap) return;
  lastAt.set(name, t);
  let bank = banks.get(name);
  if (!bank) { bank = Array.from({ length: VARIANTS[name] ?? 1 }, () => synth(ac, name)); banks.set(name, bank); }
  const src = ac.createBufferSource();
  src.buffer = bank[Math.floor(Math.random() * bank.length)];
  src.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(g);
  if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); }
  else g.connect(out);
  src.start(t);
}

// The machine's bed: the settled fans + spindle, looped for as long as the page is powered.
let hum: { src: AudioBufferSourceNode; g: GainNode } | null = null;
export function startHum({ delay = 0, fade = 2 } = {}) {
  if (hum || !sfxEnabled()) return;
  const ac = audio();
  if (!ac || !out) return;
  let bank = banks.get("hum");
  if (!bank) { bank = [synth(ac, "hum")]; banks.set("hum", bank); }
  const src = ac.createBufferSource(), g = ac.createGain(), t = ac.currentTime + delay;
  src.buffer = bank[0]; src.loop = true;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + fade);
  src.connect(g); g.connect(out); src.start(t);
  hum = { src, g };
}
export function stopHum(fade = 0.4) {
  if (!hum || !ctx) return;
  const { src, g } = hum, t = ctx.currentTime;
  hum = null;
  g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + fade);
  src.stop(t + fade + 0.05);
}

// ---- synthesis (ports of the teaser's instruments)
const TAU = Math.PI * 2;
const noise = () => Math.random() * 2 - 1;

function synth(ac: AudioContext, name: Sfx): AudioBuffer {
  const SR = ac.sampleRate;
  const bp = (fc: number, q: number) => {                  // RBJ band-pass, 0 dB peak
    const w = (TAU * fc) / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x: number) => { const y = (al * x - al * x2 + 2 * c * y1 - (1 - al) * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  };
  const lp = () => { let y = 0; return (x: number, fc: number) => { const a = Math.exp((-TAU * fc) / SR); return (y = (1 - a) * x + a * y); }; };
  const hp = (fc: number) => { const l = lp(); return (x: number) => x - l(x, fc); };
  const phase = () => { let p = 0; return (f: number) => ((p += (TAU * f) / SR), Math.sin(p)); };

  let secs = 0.1, fn: (t: number) => number, ref: [number, number] | null = null;   // ref: RMS window (s)
  let loop = 0;                                            // s: seamless loop length (0 = one-shot)
  switch (name) {
    case "hum": {                                          // the spin-up's settled speed, as a loop
      const air = lp(), air2 = lp(); let p = 0, pA = 0, pB = 0;
      secs = 2.5; loop = 2.0;
      fn = () => {
        p += (TAU * 90) / SR; pA += (TAU * 90 * 5.5) / SR; pB += (TAU * 90 * 11) / SR;
        const motor = Math.sin(p) * 0.5 + Math.sin(2 * p) * 0.35 + Math.sin(3 * p) * 0.2 + Math.sin(4 * p) * 0.1;
        const whine = Math.sin(pA) * 0.24 + Math.sin(pB) * 0.12;
        return motor * 0.35 + whine + air2(air(noise(), 1420), 1420) * 1.4 * 1.6;
      };
      ref = [0.5, 2.0];
      break;
    }
    case "ping": {                                         // a cartridge seated: struck metal, bright
      const parts: [number, number, number][] = [[2960, 1, 0.16], [4470, 0.5, 0.1], [6180, 0.3, 0.07]];   // Hz, amp, decay
      const b = bp(3000, 2);
      secs = 0.4;
      fn = (t) => {
        let s = b(noise()) * Math.exp(-t / 0.0015) * 1.5;
        for (const [f, a, d] of parts) s += Math.sin(TAU * f * t) * a * Math.exp(-t / d);
        return s * Math.min(1, t / 0.001);
      };
      ref = [0, 0.2];
      break;
    }
    case "twang": {                                        // ejected: the slot's spring
      const o = phase(), o2 = phase();
      secs = 0.25;
      fn = (t) => {
        const f = 620 - 60 * Math.min(1, t / 0.2), vib = 1 + 0.02 * Math.sin(TAU * 34 * t) * Math.exp(-t / 0.1);
        return (o(f * vib) * 0.8 + o2(f * 2.7) * 0.25 * Math.exp(-t / 0.05)) * Math.exp(-t / 0.07) * Math.min(1, t / 0.002);
      };
      break;
    }
    case "switch": {                                       // big rocker: click, then ka-chunk
      const b1 = bp(1100, 1.4), b2 = bp(650, 1.2), o1 = phase(), o2 = phase();
      secs = 0.3;
      fn = (t) => {
        const s1 = b1(noise()) * Math.exp(-t / 0.003) * 2.2 + o1(130) * Math.exp(-t / 0.03) * 0.5, u = t - 0.028;
        return u <= 0 ? s1 * 0.6 : s1 * 0.6 + b2(noise()) * Math.exp(-u / 0.007) * 2.6 + o2(85 - 20 * u) * Math.exp(-u / 0.07) * 0.9;
      };
      break;
    }
    case "crt": {                                          // high voltage thump + static on the glass
      const o = phase(), clicks = Array.from({ length: 26 }, () => ({ at: 0.02 + Math.random() ** 1.6 * 0.7, f: bp(1200 + Math.random() * 1800, 4) }));
      secs = 0.8;
      fn = (t) => {
        let s = o(45 + 40 * Math.exp(-t / 0.05)) * Math.exp(-t / 0.1) * Math.min(1, t / 0.01);
        for (const c of clicks) { const u = t - c.at; const x = c.f(u >= 0 && u < 0.012 ? noise() : 0); if (u >= 0 && u < 0.012) s += x * Math.exp(-u / 0.0015) * 2 * (1 - c.at); }
        return s;
      };
      ref = [0, 0.3];
      break;
    }
    case "degauss": {                                      // soft 60Hz hum as the colours settle
      let p = 0;
      secs = 1.0;
      fn = (t) => {
        p += (TAU * 60) / SR;
        const env = Math.min(1, t / 0.015) * Math.exp(-t / 0.3) * (1 + 0.15 * Math.sin(TAU * 7 * t));
        return (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.3 * Math.sin(3 * p) + 0.15 * Math.sin(5 * p)) * env;
      };
      ref = [0, 0.45];
      break;
    }
    case "spinup": {                                       // fans + 5400rpm disk: rises, settles, fades
      const air = lp(), air2 = lp(); let p = 0, pA = 0, pB = 0;
      secs = 6.5;
      fn = (t) => {
        const sp = 1 - Math.exp(-t / 0.95), f0 = 90 * sp, fc = 120 + 1300 * sp;
        p += (TAU * f0) / SR; pA += (TAU * f0 * 5.5) / SR; pB += (TAU * f0 * 11) / SR;
        const motor = Math.sin(p) * 0.5 + Math.sin(2 * p) * 0.35 + Math.sin(3 * p) * 0.2 + Math.sin(4 * p) * 0.1;
        const whine = Math.sin(pA) * 0.24 + Math.sin(pB) * 0.12;
        const fan = air2(air(noise(), fc), fc) * 1.4;
        const fade = t < 3.2 ? 1 : Math.max(0, 1 - (t - 3.2) / 3.3) ** 1.5;   // hands over to the hum loop
        return (motor * 0.35 + whine + fan * 1.6) * sp * sp * fade;
      };
      ref = [1.9, 3.1];
      break;
    }
    case "beep": {                                         // BIOS POST: one short 896Hz PC-speaker beep
      const h = hp(300), l = lp(), len = 0.17;
      secs = len + 0.01;
      fn = (t) => {
        let s = 0; for (let k = 1; k <= 9; k += 2) s += Math.sin(TAU * 896 * k * t) / k;
        return l(h(s), 4500) * Math.max(0, Math.min(1, t / 0.004) * Math.min(1, (len - t) / 0.006));
      };
      ref = [0, len];
      break;
    }
    case "seek": {                                         // disk head seek: tk
      const b = bp(900 + Math.random() * 700, 3), body = bp(260 + Math.random() * 80, 2);
      secs = 0.04;
      fn = (t) => b(noise()) * Math.exp(-t / 0.0035) * 2.4 + body(noise()) * Math.exp(-t / 0.012) * 1.5;
      break;
    }
    case "key": {                                          // mechanical keyboard: low thock + plastic clack
      const fBody = 150 + Math.random() * 90, clack = bp(1000 + Math.random() * 550, 2.2), thock = bp(fBody * 2.2, 1.5), o = phase();
      secs = 0.09;
      fn = (t) => (o(fBody * (1 - 0.25 * Math.min(1, t / 0.03))) * Math.exp(-t / 0.018) * 0.9 + clack(noise()) * Math.exp(-t / 0.006) * 2.2 + thock(noise()) * Math.exp(-t / 0.012) * 1.2);
      break;
    }
    case "relay": {                                        // small relay / latch tick
      const b = bp(2200, 3), body = bp(400, 2);
      secs = 0.03;
      fn = (t) => b(noise()) * Math.exp(-t / 0.0015) * 2 + body(noise()) * Math.exp(-t / 0.006) * 1.2;
      break;
    }
    case "whirr":                                          // drive motor: spins up and back down (a pane's 1s slide)
    case "whirrDown": {                                    // ...or just down (a pane closing)
      const down = name === "whirrDown", air = lp(); let p = 0, pA = 0;
      secs = down ? 0.6 : 1.0;
      fn = (t) => {
        const u = t / secs, sp = down ? (1 - u) ** 1.2 : Math.sin(Math.PI * Math.min(1, u)) ** 0.7;
        const f0 = 35 + 40 * sp;
        p += (TAU * f0) / SR; pA += (TAU * f0 * 7) / SR;
        const motor = Math.sin(p) * 0.5 + Math.sin(2 * p) * 0.3 + Math.sin(3 * p) * 0.15;
        return (motor * 0.4 + Math.sin(pA) * 0.12 + air(noise(), 200 + 900 * sp) * 1.2) * sp;
      };
      ref = down ? [0, 0.3] : [0.3, 0.7];
      break;
    }
    case "latch": {                                        // a cartridge seating: plastic chk, then clunk
      const b1 = bp(1800, 2), b2 = bp(900, 1.5), o = phase();
      secs = 0.22;
      fn = (t) => {
        const s1 = b1(noise()) * Math.exp(-t / 0.002) * 1.8, u = t - 0.045;
        return u <= 0 ? s1 : s1 + b2(noise()) * Math.exp(-u / 0.006) * 2.2 + o(160 - 30 * u) * Math.exp(-u / 0.04) * 0.7;
      };
      break;
    }
    case "buzz": {                                         // PC speaker error: low, raspy square
      const l = lp(), len = 0.28;
      secs = len + 0.02;
      fn = (t) => {
        let s = 0; for (let k = 1; k <= 9; k += 2) s += Math.sin(TAU * 124 * k * t) / k;
        const rasp = 1 + 0.25 * Math.sin(TAU * 31 * t);
        return l(s * rasp, 1800) * Math.max(0, Math.min(1, t / 0.006) * Math.min(1, (len - t) / 0.02));
      };
      ref = [0, len];
      break;
    }
    case "chirp": {                                        // PC speaker ok: two blips, up
      const l = lp(), blips: [number, number, number][] = [[0, 0.055, 660], [0.08, 0.075, 880]];   // at, len, Hz
      secs = 0.17;
      fn = (t) => {
        let s = 0;
        for (const [at, len, f] of blips) {
          const u = t - at;
          if (u < 0 || u > len) continue;
          let v = 0; for (let k = 1; k <= 5; k += 2) v += Math.sin(TAU * f * k * u) / k;
          s += v * Math.min(1, u / 0.004) * Math.min(1, (len - u) / 0.006);
        }
        return l(s, 3500);
      };
      break;
    }
    case "zap": {                                          // the picture collapsing: static sweeping down, a thump
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const o = phase();
      secs = 0.32;
      fn = (t) => {
        const fc = 200 + 1600 * Math.exp(-t / 0.07);         // band-pass re-tuned every sample, sweeping down
        const w = (TAU * fc) / SR, al = Math.sin(w) / 2.4, c = Math.cos(w), a0 = 1 + al, x = noise();
        const y = (al * x - al * x2 + 2 * c * y1 - (1 - al) * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y * Math.exp(-t / 0.09) * 2 + o(50) * Math.exp(-t / 0.08) * 0.8 * Math.min(1, t / 0.005);
      };
      ref = [0, 0.2];
      break;
    }
    case "static": {                                       // block static while a wordmark row scrambles
      const b = bp(900, 0.8), h = hp(200); let hold = 0, cnt = 0;
      secs = 0.35;
      fn = (t) => { if (cnt-- <= 0) { hold = noise(); cnt = 2 + Math.floor(Math.random() * 14); } return b(h(hold)) * Math.min(1, t / 0.015) * Math.max(0, 1 - t / 0.35); };
      break;
    }
  }

  const raw = new Float32Array(Math.round(secs * SR));
  for (let i = 0; i < raw.length; i++) raw[i] = fn(i / SR);
  // A loop: the tail past the loop length crossfades into the head, so the seam is silent
  const n = loop ? Math.round(loop * SR) : raw.length, buf = ac.createBuffer(1, n, SR), d = buf.getChannelData(0);
  d.set(raw.subarray(0, n));
  if (loop) {
    const xf = raw.length - n;
    for (let i = 0; i < xf; i++) { const w = i / xf; d[i] = raw[i] * w + raw[n + i] * (1 - w); }
  }
  const [a, z] = ref ? [Math.round(ref[0] * SR), Math.min(n, Math.round(ref[1] * SR))] : [0, n];
  let e = 0, peak = 0;
  for (let i = a; i < z; i++) e += d[i] * d[i];
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = Math.min(10 ** (LEVEL[name] / 20) / (Math.sqrt(e / Math.max(1, z - a)) || 1), 0.95 / (peak || 1));
  for (let i = 0; i < n; i++) d[i] *= g;
  return buf;
}
