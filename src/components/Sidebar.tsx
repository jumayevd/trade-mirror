"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { DATA_VERSION, METHODOLOGY_VERSION } from "@/lib/dataset";
import type { LocaleKey } from "@/lib/locales";

/* Nav order per handoff: Overview, Countries, Products, Discrepancy & Risk, Data quality, Methodology. */
const NAV: { href: string; label: LocaleKey }[] = [
  { href: "/", label: "nav.overview" },
  { href: "/partners", label: "nav.partners" },
  { href: "/products", label: "nav.products" },
  { href: "/risk", label: "nav.queue" },
  { href: "/quality", label: "nav.quality" },
  { href: "/methodology", label: "nav.methodology" },
];

const isActive = (href: string, path: string) => (href === "/" ? path === "/" : path.startsWith(href));

/** Compact horizontal nav for < lg screens — simple dark-on-light row. */
export function MobileNav() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav className="flex max-w-full items-center gap-3 overflow-x-auto lg:hidden" aria-label="Main navigation">
      {NAV.map((l) => {
        const active = isActive(l.href, path);
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap text-[12px] font-extrabold ${active ? "text-[#ae1800]" : "text-[rgba(32,30,29,0.6)] hover:text-foreground"}`}>
            {t(l.label)}
          </Link>
        );
      })}
    </nav>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <aside className="no-print hidden w-[204px] shrink-0 bg-[#201e1d] text-[#f3f2f2] lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto">
        {/* brand */}
        <Link href="/" className="block px-5 pb-[18px] pt-[22px]">
          <span className="block text-[15px] font-extrabold tracking-[-0.01em]">TRADE MIRROR</span>
          <span className="mt-0.5 block text-[10.5px] text-[rgba(243,242,242,0.55)]">Uzbekistan · mirror-trade screening</span>
        </Link>
        <div className="h-[2px] shrink-0 bg-[rgba(243,242,242,0.25)]" />

        {/* nav */}
        <nav className="flex flex-col py-2.5" aria-label="Main navigation">
          {NAV.map((l) => {
            const active = isActive(l.href, path);
            return (
              <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}
                className={`border-l-[3px] px-5 py-[9px] text-[13px] font-extrabold ${
                  active
                    ? "border-[#ec3013] bg-[rgba(243,242,242,0.08)] text-[#f3f2f2]"
                    : "border-transparent text-[rgba(243,242,242,0.6)] hover:text-[#f3f2f2]"
                }`}>
                {t(l.label)}
              </Link>
            );
          })}
        </nav>

        {/* evidence level + versions */}
        <div className="mt-auto p-5">
          <div className="border border-[rgba(243,242,242,0.25)] p-2.5"
            title="Open trade data supports evidence levels 1–3 (observed, comparable, residual). Levels 4–5 (behavioural, verified) are never claimed on this site.">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-[rgba(243,242,242,0.5)]">
              Evidence level
            </div>
            <div className="mt-1 text-[13px] font-extrabold">3 · Residual</div>
            <div className="tabular mt-[3px] text-[10px] leading-snug text-[rgba(243,242,242,0.5)]">
              open data supports 1–3 · levels 4–5 never claimed
            </div>
          </div>
          <div className="tabular mt-3 text-[10px] leading-[1.6] text-[rgba(243,242,242,0.45)]">
            data {DATA_VERSION}
            <br />
            methodology v{METHODOLOGY_VERSION}
            <br />
            M − X {t("nav.signConvention")}
          </div>
        </div>
      </div>
    </aside>
  );
}
