import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar, { MobileNav } from "@/components/Sidebar";
import HeaderMeta from "@/components/HeaderMeta";
import { HeaderStrapline, SiteFooter } from "@/components/Chrome";
import { I18nProvider } from "@/lib/i18n";
import { THEME_BOOTSTRAP } from "@/lib/theme-store";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CBU Analytics",
  description:
    "Iqtisodiy monitoring portali: yashirin iqtisodiyot kuzatuvi (elektr isteʼmoli va tushum) hamda aks savdo tahlili (UN Comtrade).",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="uz" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* set data-theme before any paint or bundle: no white flash for dark
            readers, and the canvas palettes read the attribute at module init */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full">
        <I18nProvider>
          <div className="min-h-viewport flex">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <header className="no-print sticky top-0 z-30 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-panel)_94%,transparent)] backdrop-blur">
                <div className="mx-auto flex w-full max-w-[var(--shell-max)] flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-5 py-2">
                  <MobileNav />
                  <HeaderStrapline />
                  <HeaderMeta />
                </div>
              </header>

              <main className="mx-auto w-full max-w-[var(--shell-max)] flex-1 px-5 py-6">
                {/*
                  No Suspense here. React hydrates a Suspense boundary after the
                  shell, and the language and quarter stores settle in between:
                  a reader in Russian then hydrated Uzbek server text against
                  Russian client text (React #418). Only the pages that read the
                  address need a boundary, and they carry their own.
                */}
                {children}
              </main>

              <SiteFooter />
            </div>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
