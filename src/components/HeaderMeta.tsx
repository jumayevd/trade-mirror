"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LANGS } from "@/lib/locales";

export default function HeaderMeta() {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="flex items-center gap-2 text-xs">
      <Link href="/methodology" className="rounded-md border border-[var(--color-primary)] px-2 py-1 font-medium text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]">
        {t("header.howto")}
      </Link>
      <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("nav.language")}>
        {LANGS.map((l) => (
          <button key={l} onClick={() => setLang(l)}
            className={`px-2 py-1 text-[11px] font-semibold uppercase ${lang === l ? "bg-[var(--color-primary)] text-white" : "text-muted hover:bg-[var(--color-panel-2)]"}`}
            aria-pressed={lang === l}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
