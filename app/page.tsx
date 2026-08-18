import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

// The interactive CLI lives at /terminal; this route is the explainer for
// first-time visitors (partners, depositors, colleagues) — static copy renders
// server-side, the KPIs and the keeper feed hydrate live on the client.

const TITLE = "MYRMIDONS — Intelligence and Execution for Onchain Credit";
const DESCRIPTION =
  "MYRMIDONS is a research and execution stack for onchain lending markets: MNEMON, an independent market-intelligence archive, and HEGEMON, an autonomous vault reallocator. Built on Morpho, running on HyperEVM.";

// og.png is a 1200x630 capture of the rendered hero (wordmark + headline) —
// the link-preview card X/Telegram/Discord unfurl when the URL is shared.
export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    siteName: "MYRMIDONS",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "MYRMIDONS — intelligence and execution for onchain credit" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@0xachilles",
    images: ["/og.png"],
  },
};

export default function Home() {
  return <LandingPage />;
}
