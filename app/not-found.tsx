import Link from "next/link";

/**
 * Terminal-styled 404 — the default Next page was the one route that broke
 * the aesthetic. Static server component: a faux shell transcript plus the
 * landing's CTA-link styling (site Header renders above it as usual).
 */

const CTA_CLASS =
  "inline-flex items-center gap-2 border px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest font-mono transition-colors";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-bg-base text-text pt-14">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-20 sm:pt-28 pb-20">
        <div className="text-[9px] uppercase tracking-widest text-gold font-mono mb-6">
          [ ERR // 404 ]
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold uppercase tracking-tight leading-tight mb-8">
          No such file or directory<span className="text-gold">.</span>
        </h1>
        <pre className="font-mono text-[12px] sm:text-sm text-text/80 leading-relaxed whitespace-pre-wrap border border-border/50 bg-bg-base p-4 mb-8 overflow-x-auto">
          {`GUEST@MYRMIDONS:/ > open <requested_path>
open: no such file or directory (404)
hint: the filesystem was reorganized when the terminal moved to /terminal.
      'ls' from the shell lists everything that exists.`}
        </pre>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/terminal"
            className={`${CTA_CLASS} border-gold text-gold glow-border-gold hover:bg-gold/10`}
          >
            &gt; BOOT TERMINAL
          </Link>
          <Link href="/" className={`${CTA_CLASS} border-border text-text hover:bg-border/10`}>
            &gt; BACK TO LANDING
          </Link>
          <Link
            href="/vaults"
            className={`${CTA_CLASS} border-border text-text hover:bg-border/10`}
          >
            &gt; VIEW VAULTS
          </Link>
        </div>
      </main>
    </div>
  );
}
