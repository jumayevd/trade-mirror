import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import Nav from "@/components/Nav";
import HeaderMeta from "@/components/HeaderMeta";
import { FilterProvider } from "@/lib/filter-context";
import { I18nProvider } from "@/lib/i18n";
import { DATA_VERSION, METHODOLOGY_VERSION } from "@/lib/dataset";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Trade Mirror — Uzbekistan Mirror Trade Evidence & Risk Screening",
  description:
    "Statistical reconciliation and risk-screening platform comparing Uzbekistan's import records with partner-reported exports (UN Comtrade). Discrepancies are screening signals, not proof of wrongdoing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <I18nProvider>
          <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-panel)_92%,transparent)] backdrop-blur">
            <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-2 px-5 py-2.5 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center justify-between gap-3">
                <Link href="/" className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-black text-white">⇄</span>
                  <span className="leading-tight">
                    <span className="block text-[15px] font-semibold tracking-tight">Trade Mirror</span>
                    <span className="block text-[11px] text-muted">Evidence & Risk Screening</span>
                  </span>
                </Link>
                <HeaderMeta />
              </div>
              <Nav />
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">
            <Suspense fallback={null}>
              <FilterProvider>{children}</FilterProvider>
            </Suspense>
          </main>

          <footer className="border-t border-[var(--color-border)] px-5 py-5 text-xs text-faint">
            <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Source: UN Comtrade · mirror statistics · screening tool, not proof of wrongdoing ·{" "}
                <Link href="/methodology" className="underline hover:text-foreground">Methodology v{METHODOLOGY_VERSION}</Link>
              </span>
              <span>Data version {DATA_VERSION}</span>
            </div>
          </footer>
        </I18nProvider>
      </body>
    </html>
  );
}
