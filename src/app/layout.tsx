import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Sidebar, { MobileNav } from "@/components/Sidebar";
import HeaderMeta from "@/components/HeaderMeta";
import { HeaderStrapline, SiteFooter } from "@/components/Chrome";
import { FilterProvider } from "@/lib/filter-context";
import { I18nProvider } from "@/lib/i18n";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mirror Trade Analytics — Bilateral Trade Asymmetry Monitoring",
  description:
    "Statistical reconciliation and risk-screening platform comparing Uzbekistan's import records with partner-reported exports (UN Comtrade).",
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
                <div className="mx-auto flex w-full max-w-[var(--shell-max)] items-center justify-between gap-3 px-5 py-2">
                  <MobileNav />
                  <HeaderStrapline />
                  <HeaderMeta />
                </div>
              </header>

              <main className="mx-auto w-full max-w-[var(--shell-max)] flex-1 px-5 py-6">
                <Suspense fallback={null}>
                  <FilterProvider>{children}</FilterProvider>
                </Suspense>
              </main>

              <SiteFooter />
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
