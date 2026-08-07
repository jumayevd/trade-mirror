"use client";

import { useMemo } from "react";
import SearchSelect, { type SearchOption } from "@/components/SearchSelect";
import { useFilter } from "@/lib/filter-context";
import { meta, DEFAULT_FILTER } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

const sel = "rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]";
const lbl = "text-[10px] font-semibold uppercase tracking-wider text-faint";

/** Year tick boxes — any subset of the window can be selected, never a range. */
function YearTicks() {
  const { filter, patch } = useFilter();
  const { t } = useI18n();
  const picked = new Set(filter.years);
  const toggle = (y: number) => {
    const next = picked.has(y) ? filter.years.filter((x) => x !== y) : [...filter.years, y].sort((a, b) => a - b);
    patch({ years: next });
  };
  const allOn = filter.years.length === meta.years.length;
  return (
    <div className="flex flex-col gap-1">
      <span className={lbl}>{t("filter.period")}</span>
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
          onClick={() => patch({ years: allOn ? [meta.defaultYear] : [...meta.years] })}
          className="ml-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-[11px] font-medium text-muted hover:text-foreground"
        >
          {allOn ? t("filter.latestOnly") : t("filter.allYears")}
        </button>
      </div>
    </div>
  );
}

/**
 * Every freight scenario the methodology admits: whole percentages across the
 * documented 6–15% CIF/FOB band, not just the low/central/high anchors.
 */
const FREIGHT_SCENARIOS = (() => {
  const lo = Math.round(meta.cif.low * 100);
  const hi = Math.round(meta.cif.high * 100);
  return Array.from({ length: hi - lo + 1 }, (_, i) => (lo + i) / 100);
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
        <YearTicks />

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
