"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LANGS, type LocaleKey } from "@/lib/locales";
import {
  applyZoom, readZoom, serverZoom, subscribeZoom, writeZoom, ZOOM_STEPS, type ZoomStep,
} from "@/lib/zoom-store";

/** Step names, smallest first — the index is the step. */
const ZOOM_LABEL_KEYS: LocaleKey[] = [
  "header.textSize.s", "header.textSize.m", "header.textSize.l", "header.textSize.xl",
];

export default function HeaderMeta() {
  const { t, lang, setLang } = useI18n();
  const zoom = useSyncExternalStore(subscribeZoom, readZoom, serverZoom);

  // the value has to reach a CSS custom property, so it is pushed to the document
  // element rather than held in a React subtree
  useEffect(() => { applyZoom(zoom); }, [zoom]);

  return (
    <div className="flex items-center gap-2 text-xs">
      <Link href="/methodology" className="rounded-md border border-[var(--color-primary)] px-2 py-1 font-medium text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]">
        {t("header.howto")}
      </Link>

      <label className="flex items-center gap-1.5 text-muted" title={t("header.textSize.tip")}>
        <span className="hidden sm:inline">{t("header.textSize")}</span>
        <select
          value={zoom}
          onChange={(e) => writeZoom(Number(e.target.value) as ZoomStep)}
          aria-label={t("header.textSize")}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-1 text-[11px] text-foreground outline-none focus:border-[var(--color-primary)]"
        >
          {ZOOM_STEPS.map((z, i) => (
            <option key={z} value={z}>{t(ZOOM_LABEL_KEYS[i])}</option>
          ))}
        </select>
      </label>

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
