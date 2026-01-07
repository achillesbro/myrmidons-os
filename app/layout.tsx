import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/site/Header";
import { Scanlines } from "@/components/Scanlines";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  fallback: ["JetBrains Mono", "monospace"],
});

export const metadata: Metadata = {
  title: "Myrmidons OS",
  description: "Myrmidons Operating System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={ibmPlexMono.variable}>
        <Providers>
          <Header />
          <main>{children}</main>
          <Scanlines />
        </Providers>
      </body>
    </html>
  );
}

