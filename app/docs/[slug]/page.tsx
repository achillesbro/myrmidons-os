import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DocPage, DocsSidebar } from "@/components/docs/DocPage";
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
  return (
    <div className="mx-auto min-h-[calc(100vh-3.5rem)] max-w-5xl px-4 pb-24 pt-20 sm:px-8">
      <div className="flex flex-col border border-border bg-bg-base sm:flex-row">
        <DocsSidebar activeSlug={doc.slug} />
        <DocPage doc={doc} />
      </div>
    </div>
  );
}
