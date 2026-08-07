"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { DATA_VERSION, METHODOLOGY_VERSION } from "@/lib/dataset";
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
      <div className="flex max-w-[1200px] flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {t("common.source")} · {t("chrome.mirrorStatistics")} ·{" "}
          <Link href="/methodology" className="underline hover:text-foreground">
            {t("nav.methodology")} v{METHODOLOGY_VERSION}
          </Link>
        </span>
        <span>
          {t("meta.dataVersion")} {DATA_VERSION}
        </span>
      </div>
    </footer>
  );
}
