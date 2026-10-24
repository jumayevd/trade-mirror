"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { LANGS } from "@/lib/locales";
import { readTheme, toggleTheme, type Theme } from "@/lib/theme-store";

/** The store never notifies — a theme change reloads the page — so the
 *  subscription is inert; what this buys is the sanctioned server/client
 *  divergence: the static render says light, the client reads the attribute. */
const subscribeNever = () => () => {};
const serverTheme = (): Theme => "light";

/** The glyph names the mode you would SWITCH TO. */
function ThemeToggle({ label }: { label: string }) {
  const theme = useSyncExternalStore(subscribeNever, readTheme, serverTheme);
  return (
    <button
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1 fs-13 leading-none text-muted hover:text-foreground"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

export default function HeaderMeta() {
  const { t, lang, setLang } = useI18n();

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5 text-xs">
      <Link href="/methodology"
        className="rounded-md border border-[var(--color-primary)] px-2 py-1 font-medium text-[var(--color-primary)] hover:bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]">
        {t("header.howto")}
      </Link>

      <ThemeToggle label={t("header.theme.tip")} />

      <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("nav.language")}>
        {LANGS.map((l) => (
          <button key={l} onClick={() => setLang(l)}
            className={`px-2 py-1 fs-12 font-semibold uppercase ${lang === l ? "bg-[var(--color-primary-fill)] text-white" : "text-muted hover:bg-[var(--color-panel-2)]"}`}
            aria-pressed={lang === l}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
