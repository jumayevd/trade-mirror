"use client";

import { useMemo } from "react";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import YearSelect from "@/components/YearSelect";
import { useFilter } from "@/lib/filter-context";
import { meta, DEFAULT_FILTER, availableOptions } from "@/lib/dataset";
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

export default function FilterBar() {
  const { filter, patch, reset } = useFilter();
  const { t } = useI18n();
  const isDefault = JSON.stringify(filter) === JSON.stringify(DEFAULT_FILTER);

  // Self-completing options: every list is narrowed to what the other filters
  // still leave reachable, so a picker can never offer a combination that
  // resolves to an empty page.
  const avail = useMemo(() => availableOptions(filter), [filter]);

  const countryOptions = useMemo<SearchOption[]>(() => {
    const reachable = new Set(avail.countries);
    return [...meta.partners]
      .filter((p) => reachable.has(p.iso3) || filter.country.includes(p.iso3))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ value: p.iso3, code: p.iso3, label: p.name }));
  }, [avail.countries, filter.country]);

  const hs2Options = useMemo<SearchOption[]>(() => {
    const reachable = new Set(avail.hs2);
    return meta.chapters
      .filter((c) => reachable.has(c.chapter) || filter.hs2.includes(c.chapter))
      .map((c) => ({ value: c.chapter, code: c.chapter, label: c.label }));
  }, [avail.hs2, filter.hs2]);

  // HS pickers cascade: HS4 follows the chosen chapters, HS6 follows the HS4 groups.
  const hs4Options = useMemo<SearchOption[]>(() => {
    const reachable = new Set(avail.hs4);
    return Object.keys(meta.hs4labels)
      .filter((c) => reachable.has(c) || filter.hs4.includes(c))
      .sort()
      .map((c) => ({ value: c, code: c, label: meta.hs4labels[c] }));
  }, [avail.hs4, filter.hs4]);

  const hs6Options = useMemo<SearchOption[]>(() => {
    const reachable = new Set(avail.hs6);
    return Object.keys(meta.hs6labels)
      .filter((c) => reachable.has(c) || filter.hs6.includes(c))
      .sort()
      .map((c) => ({ value: c, code: c, label: meta.hs6labels[c] }));
  }, [avail.hs6, filter.hs6]);

  /** Drop any narrower selection that no longer sits under the broader one. */
  const pickHs2 = (v: string[]) =>
    patch({
      hs2: v,
      hs4: filter.hs4.filter((c) => v.length === 0 || v.some((p) => c.startsWith(p))),
      hs6: filter.hs6.filter((c) => v.length === 0 || v.some((p) => c.startsWith(p))),
    });
  const pickHs4 = (v: string[]) =>
    patch({ hs4: v, hs6: filter.hs6.filter((c) => v.length === 0 || v.some((p) => c.startsWith(p))) });

  return (
    <div className="no-print sticky top-[var(--header-h)] z-20 -mx-5 mb-3 border-b border-[var(--color-border-soft)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-5 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <YearSelect years={filter.years} onChange={(years) => patch({ years })} available={avail.years} />

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
    </div>
  );
}
