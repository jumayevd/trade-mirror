"use client";

import { useMemo } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import YearTicks from "@/components/YearTicks";
import { useFilter } from "@/lib/filter-context";
import { meta, DEFAULT_FILTER } from "@/lib/dataset";
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

  const countryOptions = useMemo<SearchOption[]>(
    () => [...meta.partners]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ value: p.iso3, code: p.iso3, label: p.name })),
    [],
  );

  // HS pickers cascade: HS4 options follow the chosen chapter, HS6 follows HS4.
  const hs2Options = useMemo<SearchOption[]>(
    () => meta.chapters.map((c) => ({ value: c.chapter, code: c.chapter, label: c.label })),
    [],
  );
  const hs4Options = useMemo<SearchOption[]>(
    () => Object.keys(meta.hs4labels)
      .filter((c) => filter.hs2 === "all" || c.startsWith(filter.hs2))
      .sort()
      .map((c) => ({ value: c, code: c, label: meta.hs4labels[c] })),
    [filter.hs2],
  );
  const hs6Options = useMemo<SearchOption[]>(
    () => Object.keys(meta.hs6labels)
      .filter((c) => (filter.hs4 !== "all" ? c.startsWith(filter.hs4) : filter.hs2 === "all" || c.startsWith(filter.hs2)))
      .sort()
      .map((c) => ({ value: c, code: c, label: meta.hs6labels[c] })),
    [filter.hs2, filter.hs4],
  );

  return (
    <div className="no-print sticky top-[52px] z-20 -mx-5 mb-3 border-b border-[var(--color-border-soft)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-5 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <YearTicks years={filter.years} onChange={(years) => patch({ years })} />

        <div className="flex flex-col gap-1" title={t("filter.freight.tip")}>
          <span className={lbl}>{t("filter.freight")}</span>
          <select className={sel} value={filter.cif} onChange={(e) => patch({ cif: +e.target.value })}>
            {FREIGHT_SCENARIOS.map((f) => (
              <option key={f} value={f}>
                {Math.round(f * 100)}%
                {f === meta.cif.central ? ` (${t("filter.central")})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.country")}</span>
          <SearchSelect
            value={filter.country}
            onChange={(v) => patch({ country: v })}
            options={countryOptions}
            allLabel={t("filter.all")}
            ariaLabel={t("filter.country")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.hs2")}</span>
          <SearchSelect
            value={filter.hs2}
            onChange={(v) => patch({ hs2: v, hs4: "all", hs6: "all", category: "all" })}
            options={hs2Options}
            allLabel={t("filter.all")}
            ariaLabel={t("filter.hs2")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.hs4")}</span>
          <SearchSelect
            value={filter.hs4}
            onChange={(v) => patch({ hs4: v, hs6: "all" })}
            options={hs4Options}
            allLabel={t("filter.all")}
            ariaLabel={t("filter.hs4")}
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.hs6")}</span>
          <SearchSelect
            value={filter.hs6}
            onChange={(v) => patch({ hs6: v })}
            options={hs6Options}
            allLabel={t("filter.all")}
            ariaLabel={t("filter.hs6")}
          />
        </div>

        {!isDefault && (
          <button onClick={reset} className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground" title={t("filter.reset.tip")}>
            {t("filter.reset")} ✕
          </button>
        )}
      </div>
    </div>
  );
}
