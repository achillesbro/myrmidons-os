/**
 * Colouring for the terminal's report commands (status, alloc, top, market, help…), the way
 * the site's panels do it: structure carries the reading, colour is rare.
 *   white   — headings, row labels, table headers, a row's identity (the market pair, a vault)
 *   success — healthy states (INVESTABLE, ALLOWED, READY, LIVE, CONFIRMED…)
 *   danger  — failure states (NOT_INVESTABLE, BROKEN, BLOCKED, ERROR, REVERTED…)
 *   gold    — warnings, and the command column of help lines (the accent for things you act on)
 * Numbers stay dim. Lines arrive NBSP-padded (the log collapses real spaces).
 * Man pages keep their own pass (lib/docs/man-highlight.ts).
 */
import type { ManTone } from "@/lib/docs/man-highlight";

/** `id`: a full 64-hex market id — the renderer shows it short and copies it whole. */
export type ReportTone = ManTone | "id";
export interface ReportSegment { tone: ReportTone; text: string }
const ID = /^0x[0-9a-fA-F]{64}$/;

const SUCCESS = /^(?:INVESTABLE|ALLOWED|READY|ARMED|LIVE|ONLINE|PASSED|CONFIRMED|ACTIVE|OK|SET|SAVED|REMOVED|CLEARED|IDLE)$/;
const DANGER = /^(?:NOT_INVESTABLE|BROKEN|BLOCKED|ERROR|REVERTED|REJECTED|UNAVAILABLE|UNTRACKED|OFFLINE|DEGRADED|ALERT|NO_MATCH|PENDING_OR_UNKNOWN|RPC_TIMEOUT)$/;
const WARN = /^(?:WARN|WARNINGS?|\(ringing\)|OTHER_CHAIN)$/;
const PAIR = /^[A-Za-z0-9.\-+]+\/[A-Za-z0-9.\-+]+@\d+$/;      // WHYPE/USDC@77
const VAULT = /^MYRMIDONS_[A-Z0-9]+$/;
const CAPS = /^[A-Z][A-Z0-9_>%<]{1,}$/;                    // a SCREAMING token (INDEX, HEVM, TIME>95)
const SPACES = /( |\s){2,}/;                          // a column gap: two or more spaces (NBSP here)
const norm = (s: string) => s.replace(/ /g, " ");

const seg = (tone: ReportTone, text: string): ReportSegment => ({ tone, text });

/** Split a line into words (tone per word), keeping the exact whitespace between them. */
function words(line: string, tone: (word: string, index: number) => ReportTone): ReportSegment[] {
  const out: ReportSegment[] = [];
  const re = /\S+|\s+/g;
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(line)) !== null) {
    if (/\s/.test(m[0][0])) out.push(seg("plain", m[0]));
    else out.push(seg(ID.test(m[0]) ? "id" : tone(m[0], i++), m[0]));
  }
  return out;
}

const stateTone = (w: string): ReportTone | null => (SUCCESS.test(w) ? "success" : DANGER.test(w) ? "danger" : WARN.test(w) ? "gold" : null);

export function highlightReportLine(raw: string): ReportSegment[] {
  const line = norm(raw);
  if (!line.trim()) return [seg("plain", raw)];
  const indented = /^\s/.test(line);
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);

  // A rule under a table header
  if (/^[-─]{3,}$/.test(trimmed)) return [seg("plain", raw)];

  // Heading: unindented, opens with a SCREAMING run ("SYSTEM STATUS", "TOP  10 of 81…", "HELP - vaults")
  if (!indented) {
    const m = line.match(/^((?:[A-Z][A-Z0-9_]*[\s ]?)+)/);
    if (m && m[1].trim().length >= 2) {
      const head = m[1], rest = raw.slice(head.length);
      return [seg("white", raw.slice(0, head.length)), ...(rest ? words(rest, (w) => stateTone(w) ?? (PAIR.test(w) || VAULT.test(w) ? "white" : "plain")) : [])];
    }
  }

  // Table header: indented, three or more SCREAMING tokens and nothing else
  if (indented && tokens.length >= 3 && tokens.every((t) => CAPS.test(t) || t === "$/Y" || t === "ID")) return [seg("white", raw)];

  // Help line: indented, a short command column (starts lowercase or with ! & [ <), a gap, prose
  if (indented && /^[a-z!&[<]/.test(trimmed) && SPACES.test(trimmed)) {
    const leading = raw.match(/^[\s ]*/)![0].length;
    const gapAt = raw.slice(leading).search(/( |\s){2,}(?=\S)/);
    if (gapAt > 0 && gapAt <= 34) {
      const cmdEnd = leading + gapAt;
      return [seg("plain", raw.slice(0, leading)), seg("gold", raw.slice(leading, cmdEnd)), ...words(raw.slice(cmdEnd), (w) => stateTone(w) ?? "plain")];
    }
  }

  // Everything else, word by word: the row's label or identity white, states coloured, values dim
  return words(raw, (w, i) => {
    const t = stateTone(w);
    if (t) return t;
    if (i === 0 && indented && (CAPS.test(w) || /^[A-Z][a-z]+$/.test(w))) return "white";   // RATES, INDEX, HEVM, Operator
    if (PAIR.test(w) || VAULT.test(w)) return "white";
    return "plain";
  });
}
