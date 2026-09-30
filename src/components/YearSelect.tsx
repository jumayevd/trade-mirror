"use client";

import MultiSelect from "@/components/MultiSelect";
import { comparableMonthsOfYear, isDerivedYear, meta } from "@/lib/dataset";
import { monthRuns } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Period picker — a dropdown of year ticks, so any subset of the window can be
 * chosen and summarised in one line. Shared by every page: the filter bar, the
 * overview and the otherwise filter-free Discrepancy & Risk page all use this
 * control, so "period" behaves identically wherever it appears.
 */
/**
 * Years the annual workbook never reached carry their comparable months in the
 * label — "2025 (Jan–Oct)" — so the shortfall is visible at the point of
 * choosing rather than in a note somewhere below the controls. Years inside the
 * workbook are complete by construction and stay bare.
 */
function yearLabel(y: number, t: (k: never) => string): string {
  if (!isDerivedYear(y)) return String(y);
  const runs = monthRuns(comparableMonthsOfYear(y), (m) => t(`month.${m}` as never));
  return runs ? `${y} (${runs})` : String(y);
}

export default function YearSelect({
  years,
  onChange,
  label,
  available,
}: {
  years: number[];
  onChange: (years: number[]) => void;
  /** Overrides the default "period" caption. */
  label?: string;
  /** Years that still carry data under the other filters; defaults to the full window. */
  available?: number[];
}) {
  const { t } = useI18n();
  const options = available && available.length > 0 ? available : meta.years;

  /*
   * Every selected year is ticked, including when all of them are.
   *
   * This used to pass [] once the whole window was selected, borrowing the
   * "empty means everything" convention the other filters use. The convention is
   * right for a filter you clear; it is wrong for a picker whose boxes the
   * reader is looking at. Ticking the last year emptied the list in front of
   * them — every box cleared at the moment the set became complete — so the
   * default, which is the whole window, opened with nothing ticked and the
   * newest year looked excluded. Clearing the last box still means the whole
   * window, which is handled below where it belongs.
   */
  return (
    <MultiSelect
      values={years.map(String)}
      onChange={(v) => onChange(v.length === 0 ? [...options] : v.map(Number).sort((a, b) => a - b))}
      options={options.map((y) => ({ value: String(y), label: yearLabel(y, t) }))}
      label={label ?? t("filter.period")}
      allLabel={t("filter.allYears")}
      searchable={false}
    />
  );
}
