"use client";

import { useMemo } from "react";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import YearSelect from "@/components/YearSelect";
import { DerivedYearsNote } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, DEFAULT_FILTER, availableOptions, partnerName, hsLabel, hs4Label, hs6Label, hsFullText } from "@/lib/dataset";
import { labelsFor } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";

const sel = "rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]";
const lbl = "text-[10px] font-semibold uppercase tracking-wider text-faint";

/**
 * Freight scenarios: every whole percentage from 0 up to the top of the
 * documented band. 0% compares the two books as reported, with no CIF/FOB
 * adjustment at all — the floor case for any discrepancy.
 */
const FREIGHT_SCENARIOS = (() => {
  const hi = Math.round(meta.cif.high * 100);
  return Array.from({ length: hi + 1 }, (_, i) => i / 100);
})();

/**
 * Product option text. Roughly 2,500 HS lines arrive from Comtrade cut at 90
 * characters, and the tail is often what separates two neighbouring codes, so
 * the complete description is fetched separately and attached here.
 *
 * English reads it inline, since the nomenclature is written in English and
 * there is no translation to contradict. The other languages keep their
 * translated label — a full English line would be worse than a short native one
 * — and carry the complete text on hover.
 */
const optionText = (code: string, label: string, lang: string) => {
  const full = hsFullText(code);
  if (!full) return { label };
  return lang === "en" ? { label: full } : { label, full };
};

export default function FilterBar() {
  const { filter, patch, reset } = useFilter();
  const { t, lang } = useI18n();
  const isDefault = JSON.stringify(filter) === JSON.stringify(DEFAULT_FILTER);

  // Self-completing options: every list is narrowed to what the other filters
  // still leave reachable, so a picker can never offer a combination that
  // resolves to an empty page.
  const avail = useMemo(() => availableOptions(filter), [filter]);

  // Option text is data-derived, so it goes through the label layer like every
  // other partner and HS string on the page — and is sorted in the reader's own
  // alphabet, not the English one.
  const countryOptions = useMemo<SearchOption[]>(() => labelsFor(lang, () => {
    const reachable = new Set(avail.countries);
    return [...meta.partners]
      .filter((p) => reachable.has(p.iso3) || filter.country.includes(p.iso3))
      .map((p) => ({ value: p.iso3, code: p.iso3, label: partnerName(p.iso3) }))
      .sort((a, b) => a.label.localeCompare(b.label, lang));
  }), [avail.countries, filter.country, lang]);

  const hs2Options = useMemo<SearchOption[]>(() => labelsFor(lang, () => {
    const reachable = new Set(avail.hs2);
    return meta.chapters
      .filter((c) => reachable.has(c.chapter) || filter.hs2.includes(c.chapter))
      .map((c) => ({ value: c.chapter, code: c.chapter, ...optionText(c.chapter, hsLabel(c.chapter), lang) }));
  }), [avail.hs2, filter.hs2, lang]);

  // HS pickers cascade: HS4 follows the chosen chapters, HS6 follows the HS4 groups.
  // The monthly detail can carry codes the yearly books never shipped labels for,
  // so the option list is the union of both, with the bare code as fallback label.
  const hs4Options = useMemo<SearchOption[]>(() => labelsFor(lang, () => {
    const reachable = new Set(avail.hs4);
    return [...new Set([...Object.keys(meta.hs4labels), ...avail.hs4])]
      .filter((c) => reachable.has(c) || filter.hs4.includes(c))
      .sort()
      .map((c) => ({ value: c, code: c, ...optionText(c, hs4Label(c), lang) }));
  }), [avail.hs4, filter.hs4, lang]);

  const hs6Options = useMemo<SearchOption[]>(() => labelsFor(lang, () => {
    const reachable = new Set(avail.hs6);
    return [...new Set([...Object.keys(meta.hs6labels), ...avail.hs6])]
      .filter((c) => reachable.has(c) || filter.hs6.includes(c))
      .sort()
      .map((c) => ({ value: c, code: c, ...optionText(c, hs6Label(c), lang) }));
  }), [avail.hs6, filter.hs6, lang]);

  /** Drop any narrower selection that no longer sits under the broader one. */
  const pickHs2 = (v: string[]) =>
    patch({
      hs2: v,
      hs4: filter.hs4.filter((c) => v.length === 0 || v.some((p) => c.startsWith(p))),
      hs6: filter.hs6.filter((c) => v.length === 0 || v.some((p) => c.startsWith(p))),
    });
  const pickHs4 = (v: string[]) =>
    patch({ hs4: v, hs6: filter.hs6.filter((c) => v.length === 0 || v.some((p) => c.startsWith(p))) });

  const monthly = filter.granularity === "month";
  const monthOptions = useMemo<SearchOption[]>(
    () => Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: t(`month.${i + 1}` as never),
    })),
    [t],
  );

  return (
    <div className="no-print sticky top-[var(--header-h)] z-20 -mx-5 mb-3 border-b border-[var(--color-border-soft)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-5 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        {/* time basis: yearly reads the annual books, monthly the monthly ones */}
        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.granularity")}</span>
          <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
            {(["year", "month"] as const).map((g) => (
              <button
                key={g}
                onClick={() => patch(g === "year" ? { granularity: g, months: [] } : { granularity: g })}
                aria-pressed={filter.granularity === g}
                className={`px-2.5 py-1.5 text-[12px] whitespace-nowrap ${filter.granularity === g ? "bg-[var(--color-primary)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
              >
                {t(g === "year" ? "gran.year" : "gran.month")}
              </button>
            ))}
          </div>
        </div>

        <YearSelect years={filter.years} onChange={(years) => patch({ years })} available={avail.years} />

        {monthly && (
          <MultiSelect
            values={filter.months.map(String)}
            onChange={(v) => patch({ months: v.map(Number).sort((a, b) => a - b) })}
            options={monthOptions}
            label={t("filter.months")}
            allLabel={t("filter.allMonths")}
            searchable={false}
          />
        )}

        <div className="flex flex-col gap-1" title={t("filter.freight.tip")}>
          <span className={lbl}>{t("filter.freight")}</span>
          <select className={sel} aria-label={t("filter.freight")} value={filter.cif} onChange={(e) => patch({ cif: +e.target.value })}>
            {FREIGHT_SCENARIOS.map((f) => (
              <option key={f} value={f}>
                {Math.round(f * 100)}%
                {f === meta.cif.central ? ` (${t("filter.central")})` : ""}
              </option>
            ))}
          </select>
        </div>

        <MultiSelect
          values={filter.country}
          onChange={(v) => patch({ country: v })}
          options={countryOptions}
          label={t("filter.country")}
          allLabel={t("filter.all")}
        />

        <MultiSelect
          values={filter.hs2}
          onChange={pickHs2}
          options={hs2Options}
          label={t("filter.hs2")}
          allLabel={t("filter.all")}
        />

        <MultiSelect
          values={filter.hs4}
          onChange={pickHs4}
          options={hs4Options}
          label={t("filter.hs4")}
          allLabel={t("filter.all")}
        />

        <MultiSelect
          values={filter.hs6}
          onChange={(v) => patch({ hs6: v })}
          options={hs6Options}
          label={t("filter.hs6")}
          allLabel={t("filter.all")}
        />

        {!isDefault && (
          <button onClick={reset} className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground" title={t("filter.reset.tip")}>
            {t("filter.reset")} ✕
          </button>
        )}
      </div>

      <DerivedYearsNote years={filter.years} />
    </div>
  );
}
