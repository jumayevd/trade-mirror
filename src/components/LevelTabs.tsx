"use client";

import { useI18n } from "@/lib/i18n";
import type { LocaleKey } from "@/lib/locales";

export type HsLevel = 2 | 4 | 6;

/** HS-level chips. HS2/HS6 are code names; only the "derived" qualifier is prose. */
export const LEVEL_LABEL_KEYS: Record<HsLevel, LocaleKey> = {
  2: "filter.hs2",
  4: "risk.level.hs4",
  6: "filter.hs6",
};

export const LEVEL_TIP_KEYS: Record<HsLevel, LocaleKey> = {
  2: "risk.levelTip.hs2",
  4: "risk.levelTip.hs4",
  6: "risk.levelTip.hs6",
};

const LEVELS: readonly HsLevel[] = [2, 4, 6];

/**
 * HS level segmented control. The active level carries the primary fill: the
 * quiet panel tint it used to rely on read as "disabled" as often as "selected",
 * so which granularity was live had to be inferred from the table underneath.
 */
export default function LevelTabs({
  level,
  onChange,
  label,
  tips,
  className = "",
}: {
  level: HsLevel;
  onChange: (level: HsLevel) => void;
  /** Overrides the default caption; pass null to hide it. */
  label?: string | null;
  /** Per-level tooltips, when the page has more contextual wording than the defaults. */
  tips?: Record<HsLevel, string>;
  className?: string;
}) {
  const { t } = useI18n();
  const caption = label === undefined ? t("qual.level.picker") : label;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {caption !== null && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{caption}</span>
      )}
      <div
        role="group"
        aria-label={caption ?? t("qual.level.picker")}
        className="inline-flex w-fit overflow-hidden rounded-md border border-[var(--color-border)]"
      >
        {LEVELS.map((l, i) => {
          const on = level === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => onChange(l)}
              aria-pressed={on}
              title={tips ? tips[l] : t(LEVEL_TIP_KEYS[l])}
              className={`whitespace-nowrap px-2.5 py-1 text-[12px] ${
                i > 0 ? "border-l border-[var(--color-border)]" : ""
              } ${
                on
                  ? "bg-[var(--color-primary)] font-semibold text-white"
                  : "bg-[var(--color-panel)] font-medium text-muted hover:bg-[var(--color-panel-2)] hover:text-foreground"
              }`}
            >
              {t(LEVEL_LABEL_KEYS[l])}
            </button>
          );
        })}
      </div>
    </div>
  );
}
