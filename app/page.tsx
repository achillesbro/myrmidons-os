import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/LandingPage";

// The interactive CLI lives at /terminal; this route is the explainer for
// first-time visitors (partners, depositors, colleagues) — static copy renders
// server-side, the KPIs and the keeper feed hydrate live on the client.

export const metadata: Metadata = {
  title: "MYRMIDONS — Intelligence and Execution for Onchain Credit",
  description:
    "MYRMIDONS is a research and execution stack for onchain lending markets: MNEMON, an independent market-intelligence archive, and HEGEMON, an autonomous vault reallocator — built on Morpho, running on HyperEVM.",
};

export default function Home() {
  return <LandingPage />;
}
