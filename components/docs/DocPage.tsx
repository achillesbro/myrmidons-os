import Link from "next/link";
import { cn } from "@/lib/utils";
import { DOCS, type Doc, type DocBlock } from "@/lib/docs/content";

/**
 * Docs renderer. Prose, not panels: the page reads as one continuous
 * document under its header bar (same shell as the vault / MNEMON pages),
 * with unboxed section headings. Only tables, formulas and banners carry
 * structure, and only as hairlines / left accents — never full boxes.
 * Content comes from lib/docs/content.ts, which also feeds `man` in the
 * terminal.
 */

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "p":
      return (
        <p className="max-w-[68ch] font-mono text-[13px] leading-[1.75] text-text/80">
          {block.text}
        </p>
      );
    case "formula":
      return (
        <div className="overflow-x-auto border-l-2 border-gold/60 py-1 pl-3 font-mono text-[11px] leading-loose">
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
          <table className="w-full max-w-[80ch] border-collapse">
            <thead>
              <tr className="border-y border-border/60 font-mono text-[9px] uppercase tracking-widest text-text-dim">
                {block.columns.map(
                  (col, i) =>
                    col && (
                      <th
                        key={col}
                        className={cn(
                          "py-1.5 pr-4 font-normal",
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
                <tr key={row[0]} className="border-b border-border/25 font-mono text-[11px]">
                  <td className="py-1.5 pr-4 align-top text-white">{row[0]}</td>
                  <td
                    className={cn(
                      "break-all py-1.5 pr-4 align-top text-gold",
                      block.columns[2] && "text-right"
                    )}
                  >
                    {row[1]}
                  </td>
                  {block.columns[2] !== "" && (
                    <td className="py-1.5 align-top text-text-dim">{row[2]}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "list":
      return (
        <ul className="max-w-[68ch] space-y-2">
          {block.items.map((item) => (
            <li
              key={item}
              className="flex gap-2.5 font-mono text-[13px] leading-[1.7] text-text/80"
            >
              <span className="shrink-0 text-gold">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "banner":
      return (
        <p
          className={cn(
            "max-w-[68ch] border-l-2 py-1 pl-3 font-mono text-[11px] leading-relaxed",
            block.tone === "warn" ? "border-gold text-gold" : "border-success text-success"
          )}
        >
          {block.text}
        </p>
      );
  }
}

export function DocsNav({ activeSlug }: { activeSlug: string }) {
  return (
    <aside className="z-20 flex w-full shrink-0 flex-col border-b border-border bg-bg-base font-mono md:h-auto md:w-[22%] md:min-w-[200px] md:border-b-0 md:border-r">
      <div className="flex select-none items-center justify-between border-b border-border bg-panel/50 p-2 text-border">
        <span className="text-[10px] font-bold uppercase tracking-widest">
          DOCS // INDEX
        </span>
        <div className="flex gap-1">
          <div className="h-2 w-2 bg-border/50" />
          <div className="h-2 w-2 bg-border/50" />
        </div>
      </div>
      <nav className="flex md:block">
        {DOCS.map((doc) => (
          <Link
            key={doc.slug}
            href={`/docs/${doc.slug}`}
            className={cn(
              "block flex-1 px-3 py-2.5 text-center text-[10px] uppercase tracking-widest transition-colors md:border-b md:border-border/40 md:text-left",
              doc.slug === activeSlug
                ? "bg-gold/10 text-gold md:border-l-2 md:border-l-gold"
                : "text-text-dim hover:bg-white/5 hover:text-white"
            )}
          >
            <span className="mr-1.5 hidden opacity-50 md:inline">{doc.n}</span>
            {doc.title}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function DocBody({ doc }: { doc: Doc }) {
  const lead = doc.sections.filter((s) => s.lead);
  const rest = doc.sections.filter((s) => !s.lead);
  return (
    <article className="px-5 py-6 sm:px-8 sm:py-8">
      {/* Page head — micro-label + title + tagline, no box */}
      <div className="font-mono text-[9px] uppercase tracking-widest text-gold">
        {`[ ${doc.n} // ${doc.title} ]`}
      </div>
      <h1 className="mt-2 font-header text-xl font-bold uppercase tracking-tight text-white sm:text-2xl">
        {doc.tagline}
        <span className="text-gold">.</span>
      </h1>

      {/* Lead prose flows straight from the title — no sub-heading. */}
      <div className="mt-5 space-y-4">
        {lead.flatMap((section) =>
          section.blocks.map((block, i) => <Block key={`${section.title}-${i}`} block={block} />)
        )}
      </div>

      {rest.map((section) => (
        <section key={section.title} className="mt-9">
          <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest text-gold">
            {section.title}
          </h2>
          <div className="mt-3 space-y-4">
            {section.blocks.map((block, i) => (
              <Block key={i} block={block} />
            ))}
          </div>
        </section>
      ))}

      <div className="mt-10 border-t border-border/40 pt-3 font-mono text-[9px] uppercase tracking-widest text-text-dim/60">
        $ man {doc.manName} — this page in the terminal
      </div>
    </article>
  );
}
