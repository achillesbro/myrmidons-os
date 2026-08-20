import Link from "next/link";
import { cn } from "@/lib/utils";
import { DOCS, type Doc, type DocBlock } from "@/lib/docs/content";

/**
 * Docs renderer — the industrial-cyberpunk (site system) format picked in
 * the /test format lab: border-grid sidebar, panel title bars, GridTable
 * language. Server components; content comes from lib/docs/content.ts,
 * which also feeds the terminal's `man` command.
 */

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="max-w-prose font-mono text-xs leading-relaxed text-text/80">
          {block.text}
        </p>
      );
    case "formula":
      return (
        <div className="overflow-x-auto font-mono text-[11px] leading-loose">
          {block.lines.map(([lhs, rhs, comment]) => (
            <p key={lhs} className="whitespace-nowrap">
              <span className="text-white">{lhs}</span>{" "}
              <span className="text-text-dim">{rhs}</span>{" "}
              <span className="text-border">{comment}</span>
            </p>
          ))}
        </div>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border font-mono text-[9px] uppercase tracking-widest text-text-dim">
                {block.columns.map(
                  (col, i) =>
                    col && (
                      <th
                        key={col}
                        className={cn(
                          "px-3 py-1.5 font-normal",
                          i === 1 && block.columns[2] ? "text-right" : "text-left"
                        )}
                      >
                        {col}
                      </th>
                    )
                )}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr
                  key={row[0]}
                  className="border-b border-border/40 font-mono text-[10px] last:border-0 hover:bg-white/5"
                >
                  <td className="px-3 py-1.5 text-white">{row[0]}</td>
                  <td
                    className={cn(
                      "break-all px-3 py-1.5 text-gold",
                      block.columns[2] && "text-right"
                    )}
                  >
                    {row[1]}
                  </td>
                  {block.columns[2] !== "" && (
                    <td className="px-3 py-1.5 text-text-dim">{row[2]}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list":
      return (
        <ul className="space-y-1.5">
          {block.items.map((item) => (
            <li
              key={item}
              className="flex gap-2 font-mono text-xs leading-relaxed text-text/80"
            >
              <span className="text-gold">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "banner":
      return (
        <div
          className={cn(
            "border-l-2 px-3 py-2 font-mono text-[10px] uppercase leading-relaxed tracking-wider",
            block.tone === "warn"
              ? "border-gold bg-gold/5 text-gold"
              : "border-success bg-success/5 text-success"
          )}
        >
          {block.text}
        </div>
      );
  }
}

export function DocsSidebar({ activeSlug }: { activeSlug: string }) {
  return (
    <aside className="w-full shrink-0 border-b border-border sm:w-40 sm:border-b-0 sm:border-r">
      <div className="hidden h-10 items-center border-b border-border bg-panel px-3 font-mono text-[9px] font-bold uppercase tracking-widest text-white sm:flex">
        DOCS
      </div>
      <nav className="flex sm:block">
        {DOCS.map((doc) => (
          <Link
            key={doc.slug}
            href={`/docs/${doc.slug}`}
            className={cn(
              "block flex-1 border-border/40 px-3 py-2.5 text-center font-mono text-[10px] uppercase tracking-widest transition-colors sm:border-b sm:text-left",
              doc.slug === activeSlug
                ? "bg-gold/10 text-gold sm:border-l-2 sm:border-l-gold"
                : "text-text-dim hover:bg-white/5 hover:text-white"
            )}
          >
            <span className="mr-1.5 hidden opacity-50 sm:inline">{doc.n}</span>
            {doc.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function DocPage({ doc }: { doc: Doc }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex h-10 items-center justify-between border-b border-border bg-panel px-4">
        <h1 className="font-mono text-xs font-bold uppercase tracking-widest text-white">
          {`${doc.title} // ${doc.tagline.split("—")[0].trim()}`}
        </h1>
        <span className="hidden font-mono text-[9px] uppercase tracking-widest text-text-dim md:inline">
          SYNCED FROM CODE
        </span>
      </div>

      <div className="p-4 sm:p-6">
        <div className="font-mono text-[9px] uppercase tracking-widest text-gold">
          {`[ ${doc.n} // ${doc.title} ]`}
        </div>
        <p className="mt-2 font-mono text-xs text-text-dim">{doc.tagline}</p>

        {doc.sections.map((section) => (
          <section key={section.title} className="mt-6">
            <div className="border border-border">
              <div className="border-b border-border bg-panel px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-text-dim">
                {section.title}
              </div>
              <div className="space-y-3 p-3">
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </div>
            </div>
          </section>
        ))}

        <div className="mt-6 border-t border-border/40 pt-2 font-mono text-[9px] uppercase tracking-widest text-text-dim/60">
          $ man {doc.manName} — this page in the terminal
        </div>
      </div>
    </div>
  );
}
