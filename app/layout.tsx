import type { Metadata, Viewport } from "next";
import { Cinzel, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/site/Header";
import { Scanlines } from "@/components/Scanlines";
import { Analytics } from "@vercel/analytics/next";

export const dynamic = "force-dynamic";

const cinzel = Cinzel({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-brand",
});

// Display font: headers, micro-labels (tracking-widest/wider convention,
// see globals.css) and KPI values. Single weight — bold is synthesized, so
// hierarchy comes from size/color. Body copy stays IBM Plex Mono.
const departureMono = localFont({
  src: "./fonts/DepartureMono-Regular.woff2",
  weight: "400",
  variable: "--font-header",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  fallback: ["monospace"],
});

export const metadata: Metadata = {
  // Resolves relative og:image/canonical URLs in per-page metadata.
  metadataBase: new URL("https://myrmidons-strategies.com"),
  title: "Myrmidons OS",
  description: "Myrmidons Operating System",
  icons: {
    icon: "/myrmidons-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${departureMono.variable} ${ibmPlexMono.variable}`}>
        <Providers>
          <Header />
          <main>{children}</main>
          <Scanlines />
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}

