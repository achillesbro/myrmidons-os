"use client";

import { cn } from "@/lib/utils";
import { HEGEMON_V2_CONSTANTS } from "@/lib/strategy/hegemonV2";

/**
 * /test lab section: the HEGEMON doc page drafted in two candidate formats,
 * side by side, so the docs design can be picked by eye. Same content, same
 * live constants (imported from lib/strategy/hegemonV2 — the zero-drift
 * trick the real docs would use), two visual languages:
 *   A — Terminal / man page: docs rendered as CLI output, the way the
 *       /terminal would print `man hegemon`. Text stream, no panels.
 *   B — Industrial cyberpunk: the site's existing border-grid system
 *       (landing / vault / MNEMON language) applied to a docs layout.
 * Static mock only — no MDX pipeline yet; whichever wins becomes /docs.
 */

const NAV = [
  { n: "01", label: "OVERVIEW" },
  { n: "02", label: "HEGEMON", active: true },
  { n: "03", label: "MNEMON" },
  { n: "04", label: "RISK" },
  { n: "05", label: "VAULTS" },
];

const CONSTANT_ROWS: { key: keyof typeof HEGEMON_V2_CONSTANTS; desc: string }[] = [
  { key: "U0", desc: "Bell-curve peak utilization" },
  { key: "SIGMA", desc: "Bell-curve width" },
  { key: "U_SAT", desc: "Saturated band start — inflow downweighted" },
  { key: "U_CRIT", desc: "Hard gate — no deposits at or above" },
  { key: "EXIT_MIN", desc: "exitRatio floor for new deposits" },
  { key: "EXIT_POWER", desc: "Convexity of the exit-safety penalty" },
  { key: "SOFTMAX_T", desc: "Softmax temperature over normalized scores" },
  { key: "MIN_REALLOC_BPS_DELTA", desc: "Churn floor (bps of totalAssets)" },
];

const INTRO =
  "HEGEMON is the reallocator: it moves vault capital between whitelisted Morpho markets along a utilization-targeting curve. Every market gets a score; scores become target weights; a rebalance only fires when the improvement clears the churn floor. Every move is simulated before it is sent onchain.";

const SCORE_LINES = [
  ["utilScore", "= bellCurve(u; center=U0, width=SIGMA)", "// prefers u near U0"],
  ["exitScore", "= clamp01(exitRatio) ^ EXIT_POWER", "// penalizes poor exits"],
  ["score", "= netApy · utilScore · exitScore", "// per market, each tick"],
];

const GATE_NOTES = [
  "Deposits never push a market's utilization below U_OPT_LOW or above U_CRIT.",
  "In the saturated band [U_SAT, U_CRIT) inflow is throttled by SAT_INFLOW_MULT.",
  "A market below EXIT_MIN exit ratio receives no new deposits until it recovers.",
  "Risk-lane exits put the market on a deposit cooldown (RISK_COOLDOWN_HOURS).",
];

/* ------------------------------------------------------------------ */
/* Format A — Terminal / man page                                      */
/* ------------------------------------------------------------------ */

// Dotted leader between a constant's name and its value, man-page style.
function ManRow({ name, value, desc }: { name: string; value: number; desc: string }) {
  const dots = ".".repeat(Math.max(2, 24 - name.length));
  return (
    <p className="whitespace-pre-wrap pl-6">
      <span className="text-white">{name}</span>
      <span className="text-text-dim/40">{dots}</span>
      <span className="text-gold">{value}</span>
      <span className="text-text-dim">{"  "}{desc}</span>
    </p>
  );
}

function ManHeading({ children }: { children: string }) {
  return (
    <p className="mt-5 font-bold uppercase tracking-widest text-white">{children}</p>
  );
}

function TerminalManDocs() {
  return (
    <div className="border border-border bg-bg-base min-h-[560px]">
      {/* Terminal chrome */}
      <div className="flex items-center justify-between border-b border-border bg-panel px-3 py-1.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-dim">
          MYRMIDONS // TERMINAL
        </span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-text-dim/60">
          docs/hegemon
        </span>
      </div>

      <div className="p-4 font-mono text-[11px] leading-relaxed text-text/80">
        <p>
          <span className="text-gold">$</span> <span className="text-white">man hegemon</span>
        </p>

        <p className="mt-3 flex justify-between text-text-dim">
          <span>HEGEMON(2)</span>
          <span className="hidden sm:inline">MYRMIDONS MANUAL</span>
          <span>HEGEMON(2)</span>
        </p>

        <ManHeading>NAME</ManHeading>
        <p className="pl-6">hegemon — vault reallocator · allocation policy</p>

        <ManHeading>SYNOPSIS</ManHeading>
        <div className="pl-6">
          {SCORE_LINES.map(([lhs, rhs, comment]) => (
            <p key={lhs}>
              <span className="text-white">{lhs}</span>{" "}
              <span>{rhs}</span>{" "}
              <span className="text-text-dim/50">{comment}</span>
            </p>
          ))}
        </div>

        <ManHeading>DESCRIPTION</ManHeading>
        <p className="max-w-prose pl-6">{INTRO}</p>

        <ManHeading>CONSTANTS</ManHeading>
        <div>
          {CONSTANT_ROWS.map((row) => (
            <ManRow
              key={row.key}
              name={row.key}
              value={HEGEMON_V2_CONSTANTS[row.key]}
              desc={row.desc}
            />
          ))}
        </div>
        <p className="mt-1 pl-6 text-text-dim/50">
          values render live from lib/strategy/hegemonV2.ts
        </p>

        <ManHeading>GATES &amp; COOLDOWNS</ManHeading>
        <div className="pl-6">
          {GATE_NOTES.map((note) => (
            <p key={note}>
              <span className="text-gold">-</span> {note}
            </p>
          ))}
        </div>

        <ManHeading>SEE ALSO</ManHeading>
        <p className="pl-6">
          <span className="cursor-pointer text-gold underline decoration-dotted">mnemon(3)</span>,{" "}
          <span className="cursor-pointer text-gold underline decoration-dotted">risk(4)</span>,{" "}
          <span className="cursor-pointer text-gold underline decoration-dotted">vaults(5)</span>
        </p>

        <p className="mt-5 flex justify-between text-text-dim">
          <span>MYRMIDONS v2</span>
          <span>2026-08</span>
          <span>HEGEMON(2)</span>
        </p>

        <p className="mt-3">
          <span className="text-gold">$</span>{" "}
          <span className="inline-block h-3.5 w-2 translate-y-0.5 animate-pulse bg-gold/80" />
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Format B — Industrial cyberpunk (the site's existing system)        */
/* ------------------------------------------------------------------ */

function IndustrialDocs() {
  return (
    <div className="flex border border-border bg-bg-base min-h-[560px]">
      {/* Sidebar — border-grid nav, gold active state */}
      <aside className="hidden w-36 shrink-0 border-r border-border sm:block">
        <div className="flex h-10 items-center border-b border-border bg-panel px-3 font-mono text-[9px] font-bold uppercase tracking-widest text-white">
          DOCS
        </div>
        {NAV.map((item) => (
          <div
            key={item.n}
            className={cn(
              "cursor-pointer border-b border-border/40 px-3 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-colors",
              item.active
                ? "border-l-2 border-l-gold bg-gold/10 text-gold"
                : "text-text-dim hover:bg-white/5 hover:text-white"
            )}
          >
            <span className="mr-1.5 opacity-50">{item.n}</span>
            {item.label}
          </div>
        ))}
      </aside>

      {/* Content — GridPanel language */}
      <div className="min-w-0 flex-1">
        <div className="flex h-10 items-center justify-between border-b border-border bg-panel px-4">
          <h1 className="font-mono text-xs font-bold uppercase tracking-widest text-white">
            HEGEMON // Allocation Policy
          </h1>
          <span className="hidden font-mono text-[9px] uppercase tracking-widest text-text-dim md:inline">
            SPEC · SYNCED FROM CODE
          </span>
        </div>

        <div className="p-4">
          <div className="font-mono text-[9px] uppercase tracking-widest text-gold">
            [ 02 // HEGEMON ]
          </div>
          <p className="mt-3 max-w-prose font-mono text-xs leading-relaxed text-text/80">
            {INTRO}
          </p>

          {/* Formula panel */}
          <div className="mt-5 border border-border">
            <div className="border-b border-border bg-panel px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-text-dim">
              MARKET SCORE
            </div>
            <div className="p-3 font-mono text-[11px] leading-loose">
              {SCORE_LINES.map(([lhs, rhs, comment]) => (
                <p key={lhs}>
                  <span className="text-white">{lhs}</span>{" "}
                  <span className="text-text-dim">{rhs}</span>{" "}
                  <span className="text-border">{comment}</span>
                </p>
              ))}
            </div>
          </div>

          {/* Constants — GridTable language */}
          <div className="mt-5 border border-border">
            <div className="border-b border-border bg-panel px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-text-dim">
              CONSTANTS
            </div>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border font-mono text-[9px] uppercase tracking-widest text-text-dim">
                  <th className="px-3 py-1.5 text-left font-normal">PARAM</th>
                  <th className="px-3 py-1.5 text-right font-normal">VALUE</th>
                  <th className="px-3 py-1.5 text-left font-normal">MEANING</th>
                </tr>
              </thead>
              <tbody>
                {CONSTANT_ROWS.map((row) => (
                  <tr
                    key={row.key}
                    className="border-b border-border/40 font-mono text-[10px] last:border-0 hover:bg-white/5"
                  >
                    <td className="px-3 py-1.5 text-white">{row.key}</td>
                    <td className="px-3 py-1.5 text-right text-gold">
                      {HEGEMON_V2_CONSTANTS[row.key]}
                    </td>
                    <td className="px-3 py-1.5 text-text-dim">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Gates */}
          <div className="mt-5 border border-border">
            <div className="border-b border-border bg-panel px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-text-dim">
              GATES &amp; COOLDOWNS
            </div>
            <ul className="space-y-1.5 p-3">
              {GATE_NOTES.map((note) => (
                <li
                  key={note}
                  className="flex gap-2 font-mono text-xs leading-relaxed text-text/80"
                >
                  <span className="text-gold">▸</span>
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-5 border-t border-border/40 pt-2 font-mono text-[9px] uppercase tracking-widest text-text-dim/60">
            $ man hegemon — this page in the terminal · constants render live
            from lib/strategy/hegemonV2.ts
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DocsFormatLab() {
  return (
    <section>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-dim">
            FORMAT A — TERMINAL / MAN PAGE
          </div>
          <TerminalManDocs />
        </div>
        <div>
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-text-dim">
            FORMAT B — INDUSTRIAL CYBERPUNK (SITE SYSTEM)
          </div>
          <IndustrialDocs />
        </div>
      </div>
      <p className="mt-4 font-mono text-[10px] leading-relaxed text-text-dim/60">
        Same content, same live constants (imported from lib/strategy/hegemonV2.ts).
        Pick a language; the MDX pipeline renders whichever wins — and format A
        doubles as the `man` command&apos;s output either way.
      </p>
    </section>
  );
}
