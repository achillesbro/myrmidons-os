import type { Metadata } from "next";
import { Cinzel, JetBrains_Mono, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/site/Header";
import { Scanlines } from "@/components/Scanlines";

const cinzel = Cinzel({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-brand",
});

const jetBrainsMono = JetBrains_Mono({
  weight: ["500", "600"],
  subsets: ["latin"],
  variable: "--font-header",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-body",
  fallback: ["monospace"],
});

export const metadata: Metadata = {
  title: "Myrmidons OS",
  description: "Myrmidons Operating System",
  icons: {
    icon: "/myrmidons-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${jetBrainsMono.variable} ${ibmPlexMono.variable}`}>
        <Providers>
          <Header />
          <main>{children}</main>
          <Scanlines />
        </Providers>
      </body>
    </html>
  );
}

