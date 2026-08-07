"use client";

import { meta } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

/**
 * Year tick boxes — any subset of the window can be selected, never a range.
 * Presentational, so both the shared filter bar and the otherwise filter-free
 * Discrepancy & Risk page can drive it from their own state.
 */
export default function YearTicks({
  years,
  onChange,
  label,
}: {
  years: number[];
  onChange: (years: number[]) => void;
  /** Overrides the default "period" caption. */
  label?: string;
}) {
  const { t } = useI18n();
  const picked = new Set(years);
  const allOn = years.length === meta.years.length;

  const toggle = (y: number) =>
    onChange(picked.has(y) ? years.filter((x) => x !== y) : [...years, y].sort((a, b) => a - b));

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
        {label ?? t("filter.period")}
      </span>
      <div className="flex flex-wrap items-center gap-1">
        {meta.years.map((y) => {
          const on = picked.has(y);
          return (
            <label
              key={y}
              className={`flex cursor-pointer select-none items-center gap-1 rounded-md border px-1.5 py-1 text-[12px] font-medium ${
                on
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                  : "border-[var(--color-border)] bg-[var(--color-panel)] text-muted hover:text-foreground"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(y)}
                className="h-3 w-3 accent-[var(--color-gold)]"
                aria-label={String(y)}
              />
              {y}
            </label>
          );
        })}
        <button
          onClick={() => onChange(allOn ? [meta.defaultYear] : [...meta.years])}
          className="ml-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground"
        >
          {allOn ? t("filter.latestOnly") : t("filter.allYears")}
        </button>
      </div>
    </div>
  );
}
