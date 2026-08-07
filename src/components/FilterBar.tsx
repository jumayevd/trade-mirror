"use client";

import { useMemo } from "react";
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

export default function FilterBar({ showMateriality = false }: { showMateriality?: boolean }) {
  const { filter, patch, reset } = useFilter();
  const { t } = useI18n();
  const isDefault = JSON.stringify(filter) === JSON.stringify(DEFAULT_FILTER);

  // HS pickers cascade: HS4 options follow the chosen chapter, HS6 follows HS4.
  const hs4Options = useMemo(() => {
    const codes = Object.keys(meta.hs4labels).filter((c) => filter.hs2 === "all" || c.startsWith(filter.hs2));
    return codes.sort();
  }, [filter.hs2]);
  const hs6Options = useMemo(() => {
    const codes = Object.keys(meta.hs6labels).filter(
      (c) => (filter.hs4 !== "all" ? c.startsWith(filter.hs4) : filter.hs2 === "all" || c.startsWith(filter.hs2)),
    );
    return codes.sort();
  }, [filter.hs2, filter.hs4]);

  return (
    <div className="no-print sticky top-[52px] z-20 -mx-5 mb-3 border-b border-[var(--color-border-soft)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-5 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <YearTicks />

        <div className="flex flex-col gap-1" title={t("filter.freight.tip")}>
          <span className={lbl}>{t("filter.freight")}</span>
          <select className={sel} value={filter.cif} onChange={(e) => patch({ cif: +e.target.value })}>
            <option value={meta.cif.low}>{Math.round(meta.cif.low * 100)}%</option>
            <option value={meta.cif.central}>{Math.round(meta.cif.central * 100)}% ({t("filter.central")})</option>
            <option value={meta.cif.high}>{Math.round(meta.cif.high * 100)}%</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.country")}</span>
          <select className={sel} value={filter.country} onChange={(e) => patch({ country: e.target.value })}>
            <option value="all">{t("filter.all")}</option>
            {[...meta.partners].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <option key={p.iso3} value={p.iso3}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.hs2")}</span>
          <select
            className={sel}
            value={filter.hs2}
            onChange={(e) => patch({ hs2: e.target.value, hs4: "all", hs6: "all", category: "all" })}
          >
            <option value="all">{t("filter.all")}</option>
            {meta.chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter} · {c.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.hs4")}</span>
          <select className={sel} value={filter.hs4} onChange={(e) => patch({ hs4: e.target.value, hs6: "all" })}>
            <option value="all">{t("filter.all")}</option>
            {hs4Options.map((c) => (
              <option key={c} value={c}>{c} · {meta.hs4labels[c]}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.hs6")}</span>
          <select className={sel} value={filter.hs6} onChange={(e) => patch({ hs6: e.target.value })}>
            <option value="all">{t("filter.all")}</option>
            {hs6Options.map((c) => (
              <option key={c} value={c}>{c} · {meta.hs6labels[c]}</option>
            ))}
          </select>
        </div>

        {showMateriality && (
          <div className="flex flex-col gap-1" title={t("filter.materiality.tip")}>
            <span className={lbl}>{t("filter.materiality")}</span>
            <select className={sel} value={filter.minGap} onChange={(e) => patch({ minGap: +e.target.value })}>
              <option value={0}>0</option>
              <option value={100_000}>$100K</option>
              <option value={1_000_000}>$1M</option>
              <option value={5_000_000}>$5M</option>
              <option value={10_000_000}>$10M</option>
              <option value={50_000_000}>$50M</option>
            </select>
          </div>
        )}

        {!isDefault && (
          <button onClick={reset} className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground" title={t("filter.reset.tip")}>
            {t("filter.reset")} ✕
          </button>
        )}
      </div>
    </div>
  );
}
