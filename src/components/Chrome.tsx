"use client";

import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import type { LocaleKey } from "@/lib/locales";

/**
 * Localised page chrome. The root layout is a server component, so the header
 * strapline and the footer live here to stay translatable — and to follow the
 * section: each dashboard names itself and its own data source.
 */
export type Section = "home" | "estimates" | "shadow" | "trade";

export function useSection(): Section {
  const path = usePathname();
  // the estimates page sits under the shadow economy but rests on published
  // statistics, not the electricity records, so it names its own source
  if (path.startsWith("/iqtisodiyot/baholar")) return "estimates";
  if (path.startsWith("/iqtisodiyot")) return "shadow";
  if (path.startsWith("/savdo")) return "trade";
  return "home";
}

const STRAPLINE: Record<Section, LocaleKey> = {
  home: "portal.tagline",
  estimates: "est.strapline",
  shadow: "sh.strapline",
  trade: "chrome.strapline",
};

export function HeaderStrapline() {
  const { t } = useI18n();
  return <div className="hidden text-xs text-faint lg:block">{t(STRAPLINE[useSection()])}</div>;
}

export function SiteFooter() {
  const { t } = useI18n();
  const section = useSection();
  const sources: LocaleKey[] = section === "shadow" ? ["sh.source"]
    : section === "estimates" ? ["est.footer"]
    : section === "trade" ? ["common.source"]
    : ["est.footer", "sh.source", "common.source"];
  return (
    <footer className="border-t border-[var(--color-border)] px-5 py-5 text-xs text-faint">
      {/* Source attribution only. The data and methodology versions live in the
          CSV export header, where they travel with the numbers themselves. */}
      <div className="mx-auto flex w-full max-w-[var(--shell-max)] flex-wrap gap-x-6 gap-y-1">
        {sources.map((k) => <span key={k}>{t(k)}</span>)}
      </div>
    </footer>
  );
}
