"use client";

import { useFilter } from "@/lib/filter-context";
import { meta, DEFAULT_FILTER, type Direction, type SignalClass, type Stage, type ViewMode } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";

const sel = "rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--color-primary)]";
const lbl = "text-[10px] font-semibold uppercase tracking-wider text-faint";

export default function FilterBar({ showMateriality = false }: { showMateriality?: boolean }) {
  const { filter, patch, reset } = useFilter();
  const { t } = useI18n();
  const isDefault = JSON.stringify(filter) === JSON.stringify(DEFAULT_FILTER);
  const yearBtn = (from: number, to: number, label: string) => (
    <button key={label} onClick={() => patch({ from, to })}
      className={`rounded-md px-2 py-1 text-[12px] font-medium ${filter.from === from && filter.to === to ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-panel-2)] text-muted hover:text-foreground"}`}>
      {label}
    </button>
  );
  const W = meta.window;

  return (
    <div className="no-print sticky top-[52px] z-20 -mx-5 mb-3 border-b border-[var(--color-border-soft)] bg-[color-mix(in_srgb,var(--color-bg)_92%,transparent)] px-5 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.period")}</span>
          <div className="flex items-center gap-1">
            {yearBtn(W.end, W.end, t("filter.lastYear"))}
            {yearBtn(W.end - 1, W.end, "2y")}
            {yearBtn(W.end - 3, W.end, "4y")}
            {yearBtn(W.start, W.end, t("filter.fullPeriod"))}
            <select className={sel} value={filter.from} onChange={(e) => patch({ from: Math.min(+e.target.value, filter.to) })} aria-label="start year">
              {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-faint">–</span>
            <select className={sel} value={filter.to} onChange={(e) => patch({ to: Math.max(+e.target.value, filter.from) })} aria-label="end year">
              {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1" title="Positive: partner reports more than Uzbekistan records. Reverse: Uzbekistan records more. Net can offset the two and is never the only headline.">
          <span className={lbl}>{t("filter.direction")}</span>
          <select className={sel} value={filter.direction} onChange={(e) => patch({ direction: e.target.value as Direction })}>
            <option value="positive">{t("dir.positive")}</option>
            <option value="reverse">{t("dir.reverse")}</option>
            <option value="absolute">{t("dir.absolute")}</option>
            <option value="net">{t("dir.net")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1" title="Comparable: both sides reported. Residual: passes basic flags (non-transit, non-residual HS, ≥2 comparable years, freight-robust) — discrepancy remains unexplained.">
          <span className={lbl}>{t("filter.stage")}</span>
          <select className={sel} value={filter.stage} onChange={(e) => patch({ stage: e.target.value as Stage })}>
            <option value="residual">{t("stage.residual")}</option>
            <option value="comparable">{t("stage.comparable")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1" title="Lens on partner quality: all / reliable reporters only / excluding transit hubs / transit hubs only.">
          <span className={lbl}>{t("filter.view")}</span>
          <select className={sel} value={filter.view} onChange={(e) => patch({ view: e.target.value as ViewMode })}>
            <option value="all">{t("view.all")}</option>
            <option value="high">{t("view.high")}</option>
            <option value="core">{t("view.core")}</option>
            <option value="transit">{t("view.transit")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1" title="Imports are valued CIF (with freight), exports FOB (without). The wedge is the one methodological assumption — 6% / 10% / 15%.">
          <span className={lbl}>{t("filter.freight")}</span>
          <select className={sel} value={filter.cif} onChange={(e) => patch({ cif: +e.target.value })}>
            <option value={meta.cif.low}>{Math.round(meta.cif.low * 100)}%</option>
            <option value={meta.cif.central}>{Math.round(meta.cif.central * 100)}% (central)</option>
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
          <select className={sel} value={filter.hs2} onChange={(e) => patch({ hs2: e.target.value, category: "all" })}>
            <option value="all">{t("filter.all")}</option>
            {meta.chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter} · {c.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lbl}>{t("filter.category")}</span>
          <select className={sel} value={filter.category} onChange={(e) => patch({ category: e.target.value, hs2: "all" })}>
            <option value="all">{t("filter.all")}</option>
            {meta.categories.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        {showMateriality && (
          <div className="flex flex-col gap-1" title="Materiality floor on the active direction metric.">
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
          <button onClick={reset} className="ml-auto rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground" title="Reset all filters to defaults (language unchanged)">
            {t("filter.reset")} ✕
          </button>
        )}
      </div>
    </div>
  );
}
