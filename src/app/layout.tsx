import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import "./globals.css";
import Sidebar, { MobileNav } from "@/components/Sidebar";
import HeaderMeta from "@/components/HeaderMeta";
import { FilterProvider } from "@/lib/filter-context";
import { I18nProvider } from "@/lib/i18n";
import { DATA_VERSION, METHODOLOGY_VERSION } from "@/lib/dataset";

/* Archivo variable font (weights 400/600/800 used); mono stays ui-monospace via CSS. */
const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Trade Mirror — Uzbekistan Mirror Trade Evidence & Risk Screening",
  description:
    "Statistical reconciliation and risk-screening platform comparing Uzbekistan's import records with partner-reported exports (UN Comtrade). Discrepancies are screening signals, not proof of wrongdoing.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              {/* header hosts nothing but the compact nav (small screens) and the meta block */}
              <header className="no-print sticky top-0 z-30 h-11 border-b-2 border-[rgba(32,30,29,0.4)] bg-[var(--color-bg)]">
                <div className="flex h-full items-center gap-3 px-7">
                  <MobileNav />
                  <div className="ml-auto shrink-0">
                    <HeaderMeta />
                  </div>
                </div>
              </header>

              <main className="w-full min-w-0 flex-1">
                <Suspense fallback={null}>
                  <FilterProvider>{children}</FilterProvider>
                </Suspense>
              </main>

              <footer className="rule-1 px-7 py-5 text-[11.5px] text-faint">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                  <span>
                    Source: UN Comtrade · mirror statistics · screening tool, not proof of wrongdoing ·{" "}
                    <Link href="/methodology" className="underline hover:text-foreground">
                      Methodology v{METHODOLOGY_VERSION}
                    </Link>
                  </span>
                  <span className="tabular">data {DATA_VERSION} · methodology v{METHODOLOGY_VERSION}</span>
                </div>
              </footer>
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
