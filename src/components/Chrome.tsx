"use client";

import { useI18n } from "@/lib/i18n";
import { meta } from "@/lib/dataset";

/**
 * Localised page chrome. The root layout is a server component, so the header
 * strapline and the footer live here to stay translatable.
 */

export function HeaderStrapline() {
  const { t } = useI18n();
  return (
    <div className="hidden text-xs text-faint lg:block">
      {t("chrome.strapline")} · {meta.window.start}–{meta.window.end}
    </div>
  );
}

export function SiteFooter() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-[var(--color-border)] px-5 py-5 text-xs text-faint">
      {/* Source attribution only. The data and methodology versions live in the
          CSV export header, where they travel with the numbers themselves. */}
      <div className="mx-auto w-full max-w-[var(--shell-max)]">
        <span>{t("common.source")}</span>
      </div>
    </footer>
  );
}
