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

function Section({ title, links, path }: { title: string; links: { href: string; label: LocaleKey }[]; path: string }) {
  const { t } = useI18n();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <div className="mb-6">
      <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">{title}</div>
      <nav className="space-y-px">
        {links.map((l) => {
          const active = isActive(l.href);
          return (
            <Link key={l.href} href={l.href}
              className={`relative block rounded-md px-3 py-1.5 text-[13px] transition-colors ${active ? "bg-[var(--color-panel-2)] font-semibold text-foreground" : "font-medium text-muted hover:bg-[var(--color-panel-2)] hover:text-foreground"}`}
              aria-current={active ? "page" : undefined}>
              {active && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full bg-[var(--color-primary)]" />}
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
    <aside className="no-print hidden w-[232px] shrink-0 border-r border-[var(--color-border-soft)] bg-[var(--color-panel)] lg:block">
      <div className="sticky top-0 flex h-screen flex-col overflow-y-auto px-2.5 py-5">
        <Link href="/" className="mb-6 flex items-center gap-2.5 px-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)] text-sm font-bold text-white">⇄</span>
          <span className="leading-tight">
            <span className="block text-[14px] font-semibold tracking-tight">Trade Mirror</span>
            <span className="block text-[10px] text-faint">Evidence &amp; Risk Screening</span>
          </span>
        </Link>
        <Section title={t("nav.analysisGroup")} links={ANALYSIS} path={path} />
        <Section title={t("nav.reference")} links={REFERENCE} path={path} />
        <div className="mt-auto space-y-1.5 px-3 pt-6 text-[10px] leading-relaxed text-faint">
          <div className="font-medium text-muted">M − X · {t("nav.signConvention")}</div>
          <div>{t("nav.attribution")}</div>
          <div title="Tariff & behavioural evidence (econometric tests) will be published after a reliable HS6-level tariff dataset is added.">
            {t("nav.evidence")} · {t("nav.planned")}
          </div>
        </div>
      </div>
    </aside>
  );
}
