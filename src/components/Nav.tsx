"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { LocaleKey } from "@/lib/locales";

const GROUPS: { group: LocaleKey; links: { href: string; label: LocaleKey; planned?: boolean }[] }[] = [
  { group: "nav.monitor", links: [
    { href: "/", label: "nav.overview" },
    { href: "/map", label: "nav.riskmap" },
    { href: "/trends", label: "nav.trends" },
  ]},
  { group: "nav.explore", links: [
    { href: "/partners", label: "nav.partners" },
    { href: "/commodities", label: "nav.sectors" },
    { href: "/products", label: "nav.products" },
  ]},
  { group: "nav.investigate", links: [
    { href: "/risk", label: "nav.queue" },
    { href: "/reverse", label: "nav.reverse" },
  ]},
  { group: "nav.validate", links: [
    { href: "/statistics", label: "nav.statistics" },
    { href: "/quality", label: "nav.quality" },
    { href: "/methodology", label: "nav.methodology" },
  ]},
];

export default function Nav() {
  const path = usePathname();
  const { t } = useI18n();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {GROUPS.map((g) => (
        <div key={g.group} className="flex items-center gap-1">
          <span className="mr-0.5 hidden text-[10px] font-semibold uppercase tracking-wider text-faint xl:inline">{t(g.group)}</span>
          {g.links.map((l) => {
            const active = isActive(l.href);
            return (
              <Link key={l.href} href={l.href}
                className={`rounded-md px-2 py-1 text-[13px] font-medium transition-colors ${active ? "bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]" : "text-muted hover:bg-[var(--color-panel-2)] hover:text-foreground"}`}>
                {t(l.label)}
              </Link>
            );
          })}
        </div>
      ))}
      <span className="rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-[12px] text-faint"
        title="Tariff & behavioural evidence (econometric tests) will be published after a reliable HS6-level tariff dataset is added — spec phase 2.">
        {t("nav.evidence")} · {t("nav.planned")}
      </span>
    </nav>
  );
}
