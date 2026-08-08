"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { LocaleKey } from "@/lib/locales";

const ANALYSIS: { href: string; label: LocaleKey }[] = [
  { href: "/", label: "nav.overview" },
  { href: "/partners", label: "nav.partners" },
  { href: "/products", label: "nav.products" },
  { href: "/risk", label: "nav.queue" },
  { href: "/quality", label: "nav.quality" },
];
const REFERENCE: { href: string; label: LocaleKey }[] = [
  { href: "/methodology", label: "nav.methodology" },
];

function Section({ title, links, path }: { title?: string; links: { href: string; label: LocaleKey }[]; path: string }) {
  const { t } = useI18n();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="mb-6">
      {title && (
        <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[rgba(255,255,255,0.45)]">{title}</div>
      )}
      <nav className="space-y-0.5">
        {links.map((l) => {
          const active = isActive(l.href);
          return (
            <Link key={l.href} href={l.href}
              className={`relative block rounded-md px-3 py-2 text-[13.5px] transition-colors ${active ? "bg-[rgba(255,255,255,0.1)] font-semibold text-white" : "font-medium text-[rgba(255,255,255,0.7)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white"}`}
              aria-current={active ? "page" : undefined}>
              {active && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[var(--color-gold)]" />}
              {t(l.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Compact horizontal nav for < lg screens. */
export function MobileNav() {
  const path = usePathname();
  const { t } = useI18n();
  const links = [...ANALYSIS, ...REFERENCE];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="flex max-w-full items-center gap-1 overflow-x-auto lg:hidden" aria-label="Main navigation">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-medium ${isActive(l.href) ? "bg-[var(--color-panel-2)] text-foreground" : "text-muted"}`}>
          {t(l.label)}
        </Link>
      ))}
    </nav>
  );
}

export default function Sidebar() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <aside className="no-print hidden w-[236px] shrink-0 bg-[var(--color-navy)] lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-2.5 py-5 text-white">
        <Link href="/" className="mb-7 flex items-center gap-2.5 px-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/cbu-logo.png" alt="Central Bank of the Republic of Uzbekistan" className="h-10 w-10 shrink-0 object-contain" />
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight text-white">{t("brand.title")}</span>
            <span className="block text-[10px] text-[rgba(255,255,255,0.55)]">{t("brand.tagline")}</span>
          </span>
        </Link>
        <Section title={t("nav.analysisGroup")} links={ANALYSIS} path={path} />
        {/* Methodology sits on its own — the group heading added noise, not structure. */}
        <Section links={REFERENCE} path={path} />
        <div className="mt-auto space-y-1.5 border-t border-[rgba(255,255,255,0.12)] px-3 pt-4 text-[10px] leading-relaxed text-[rgba(255,255,255,0.45)]">
          <div className="text-[13px] font-bold text-[var(--color-gold)]">M − X <span className="text-[9.5px] font-semibold uppercase tracking-wider text-[rgba(255,255,255,0.45)]">{t("nav.signConvention")}</span></div>
          <div>{t("nav.attribution")}</div>
          <div title="Tariff & behavioural evidence (econometric tests) will be published after a reliable HS6-level tariff dataset is added.">
            {t("nav.evidence")} · {t("nav.planned")}
          </div>
        </div>
      </div>
    </aside>
  );
}
