import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import Sidebar, { MobileNav } from "@/components/Sidebar";
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
      <body className="min-h-full">
        <I18nProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="no-print sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-panel)_94%,transparent)] backdrop-blur">
                <div className="flex items-center justify-between gap-3 px-5 py-2">
                  <MobileNav />
                  <div className="hidden text-xs text-faint lg:block">
                    Mirror Trade Statistics · Uzbekistan · 2017–2024
                  </div>
                  <HeaderMeta />
                </div>
              </header>

              <main className="w-full max-w-[1200px] flex-1 px-5 py-6">
                <Suspense fallback={null}>
                  <FilterProvider>{children}</FilterProvider>
                </Suspense>
              </main>

              <footer className="border-t border-[var(--color-border)] px-5 py-5 text-xs text-faint">
                <div className="flex max-w-[1200px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    Source: UN Comtrade · mirror statistics · screening tool, not proof of wrongdoing ·{" "}
                    <Link href="/methodology" className="underline hover:text-foreground">Methodology v{METHODOLOGY_VERSION}</Link>
                  </span>
                  <span>Data version {DATA_VERSION}</span>
                </div>
              </footer>
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
