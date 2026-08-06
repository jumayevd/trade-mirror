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
// Trends / Statistics / Reverse content lives inside the analysis pages;
// their old routes redirect there.
const MORE: { href: string; label: LocaleKey }[] = [];

function Section({ title, links, path }: { title: string; links: { href: string; label: LocaleKey }[]; path: string }) {
  const { t } = useI18n();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="mb-5">
      <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">{title}</div>
      <nav className="space-y-0.5">
        {links.map((l) => {
          const active = isActive(l.href);
          return (
            <Link key={l.href} href={l.href}
              className={`block rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${active ? "bg-white text-[var(--color-primary)]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
              aria-current={active ? "page" : undefined}>
              {t(l.label)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** Compact horizontal nav for < lg screens (drawer-lite). */
export function MobileNav() {
  const path = usePathname();
  const { t } = useI18n();
  const links = [...ANALYSIS, ...REFERENCE, ...MORE];
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="flex max-w-full items-center gap-1 overflow-x-auto lg:hidden" aria-label="Main navigation">
      {links.map((l) => (
        <Link key={l.href} href={l.href}
          className={`shrink-0 rounded-md px-2 py-1 text-[12px] font-medium ${isActive(l.href) ? "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-[var(--color-primary)]" : "text-muted"}`}>
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
    <aside className="no-print hidden w-[240px] shrink-0 flex-col bg-[var(--color-primary)] lg:flex">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-3 py-5">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-base font-black text-white">⇄</span>
          <span className="leading-tight">
            <span className="block text-[15px] font-semibold tracking-tight text-white">Trade Mirror</span>
            <span className="block text-[10px] text-white/60">{t("brand.subtitle")}</span>
          </span>
        </Link>
        <Section title={t("nav.analysisGroup")} links={ANALYSIS} path={path} />
        <Section title={t("nav.reference")} links={REFERENCE} path={path} />
        <div className="mt-auto space-y-1 px-3 pt-6 text-[10px] leading-relaxed text-white/45">
          <div className="font-semibold text-white/70">M − X · {t("nav.signConvention")}</div>
          <div>{t("nav.attribution")}</div>
          <div className="rounded border border-dashed border-white/20 px-2 py-1" title="Tariff & behavioural evidence (econometric tests) will be published after a reliable HS6-level tariff dataset is added.">
            {t("nav.evidence")} · {t("nav.planned")}
          </div>
        </div>
      </div>
    </aside>
  );
}
