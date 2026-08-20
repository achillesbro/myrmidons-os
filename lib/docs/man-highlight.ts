/**
 * Semantic colouring for the terminal's `man` output. One pass over a line,
 * classifying by MEANING rather than by position:
 *   white   — man section headings (NAME, DESCRIPTION, ...)
 *   danger  — failure modes and warnings (broken, bad debt, liquidation)
 *   success — healthy states and guarantees (investable, stable, open)
 *   gold    — identifiers and values (U0, capacity_ratio, 0.88, $50k, paths)
 * Everything else stays dim body text. Terminal lines arrive with NBSP
 * indentation (out-lines collapse real spaces), so tests allow for it.
 */

export type ManTone = "plain" | "white" | "gold" | "success" | "danger";

export interface ManSegment {
  tone: ManTone;
  text: string;
}

// Failure modes, warnings, and the words that describe things going wrong.
const DANGER_SRC =
  "\\b(?:broken|bad debt|liquidat(?:e|ed|es|ion|ions)|liquidatable|depegs?|stalls?|socializ(?:e|es|ed)|deprecated|UNSTABLE|CRITICAL|dust|ratchet(?:ed)?|pinned|runaway|bugs?|risks?|wrong|cannot|never|no notice)\\b";

// Healthy states, guarantees, and the words that describe things working.
const SUCCESS_SRC =
  "\\b(?:investable|deployable|STABLE BY CONTRACT|stable|healthy|open|live|observable|additive-only|profitably|clears)\\b";

// Identifiers and values: SCREAMING_SNAKE constants, snake_case metrics and
// files, numbers, percentages, USD amounts, endpoints, hosts, addresses.
const IDENT_SRC = [
  "\\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\\b", // U_CRIT, MIN_REALLOC_BPS_DELTA
  "\\b(?:U0|LIF|SIGMA|HHI|EWMA|SSE|IRM|LLTV|APY|TVL|ERC-4626|JSON)\\b",
  "\\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+(?:\\.json)?\\b", // capacity_ratio, market_health.json
  "0x[a-fA-F0-9]{6,}", // addresses
  "\\$[\\d.,]+[kMB]?", // $50k
  "\\b\\d+(?:\\.\\d+)?%", // 99.9%
  "\\b\\d+(?:\\.\\d+)?\\b", // 0.88, 25
  "/v1/[\\w/{}.-]+", // API paths
  "/docs/[\\w-]+",
  "\\b(?:data|api)\\.myrmidons-strategies\\.com\\b",
  "\\b[\\w.-]+\\.(?:json|yaml|ts)\\b",
].join("|");

const RULES: { tone: ManTone; src: string }[] = [
  { tone: "danger", src: DANGER_SRC },
  { tone: "success", src: SUCCESS_SRC },
  { tone: "gold", src: IDENT_SRC },
];

const COMBINED = new RegExp(RULES.map((r) => `(${r.src})`).join("|"), "g");

// A man section heading: unindented and all-caps ("NAME", "GATES & COOLDOWNS").
const HEADING = /^[A-Z][A-Z0-9 &()—-]*$/;

export function highlightManLine(line: string): ManSegment[] {
  if (!line.trim()) return [{ tone: "plain", text: line }];

  // Unindented all-caps line = section heading (indentation is NBSP here).
  const indented = line.startsWith(" ") || line.startsWith(" ");
  if (!indented && HEADING.test(line.trim()) && line.trim().length > 2) {
    return [{ tone: "white", text: line }];
  }

  const out: ManSegment[] = [];
  let last = 0;
  COMBINED.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = COMBINED.exec(line)) !== null) {
    if (m.index > last) out.push({ tone: "plain", text: line.slice(last, m.index) });
    // Group index 1..3 maps to RULES order.
    const groupIdx = RULES.findIndex((_, i) => m![i + 1] !== undefined);
    out.push({ tone: RULES[groupIdx]?.tone ?? "plain", text: m[0] });
    last = COMBINED.lastIndex;
  }
  if (last < line.length) out.push({ tone: "plain", text: line.slice(last) });
  return out;
}

export const MAN_TONE_CLASS: Record<ManTone, string> = {
  plain: "text-text-dim",
  white: "text-white font-bold",
  gold: "text-gold",
  success: "text-success",
  danger: "text-danger",
};
