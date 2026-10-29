import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "MatchFlow.pro · Next-Gen Tournament Engine",
    template: "%s · MatchFlow.pro",
  },
  description:
    "Das smarte Betriebssystem für jedes Turnier weltweit. Turniere in Echtzeit erstellen, verwalten und mit Beamer- & Live-Ticker-View verfolgen.",
  keywords: [
    "Turnier-Manager",
    "Bierpong Turnier",
    "MatchFlow",
    "Spielplan Generator",
    "Live Turnier Ticker",
    "Turnier erstellen",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: "dark" }}
    >
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans selection:bg-amber-500 selection:text-slate-950">
        {children}
      </body>
    </html>
  );
}