import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AppShell } from "@/components/chrome/AppShell";
import { DocBody, DocsNav } from "@/components/docs/DocPage";
import { DOCS, getDoc } from "@/lib/docs/content";

export function generateStaticParams() {
  return DOCS.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  return { title: doc ? `${doc.title} — MYRMIDONS DOCS` : "MYRMIDONS DOCS" };
}

export default async function DocSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  // Same shell as the vault / MNEMON pages: fixed under the site header,
  // index rail on the left, the document scrolling in the main column.
  return (
    <div className="mt-14 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-bg-base">
      <AppShell sidebar={<DocsNav activeSlug={doc.slug} />}>
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-bg-base px-3 py-2">
          <Link
            href="/"
            className="font-mono text-[10px] uppercase tracking-widest text-text-dim transition-colors hover:text-gold"
          >
            ← HOME
          </Link>
          <span className="font-mono text-[9px] uppercase tracking-widest text-text-dim/60">
            MYRMIDONS // DOCS
          </span>
        </div>
        <div className="scroll-smooth flex-1 overflow-y-auto">
          <DocBody doc={doc} />
        </div>
      </AppShell>
    </div>
  );
}
