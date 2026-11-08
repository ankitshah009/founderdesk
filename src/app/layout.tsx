import type { Metadata, Viewport } from "next";
import { Geist_Mono, Instrument_Serif, Inter, Inter_Tight } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });
const display = Inter_Tight({ variable: "--font-display", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });
const serif = Instrument_Serif({ variable: "--font-serif", subsets: ["latin"], weight: "400", style: ["italic"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "FounderDesk — Email your notes. Approve the exact article.", template: "%s · FounderDesk" },
  description:
    "FounderDesk researches your argument, writes it in your voice, checks every claim against its source, and publishes only the version you approved.",
};

export const viewport: Viewport = { themeColor: "#0b0a09", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${display.variable} ${serif.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-fg">{children}</body>
    </html>
  );
}
