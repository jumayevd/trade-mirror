"use client";

import { useFilter } from "@/lib/filter-context";
import { meta, type Direction, type Stage } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import type { Lang } from "@/lib/locales";

/* square, 1px-bordered controls — 12.5px/600, radius 0 (global) */
const sel =
  "border border-[rgba(32,30,29,0.4)] bg-[var(--color-bg)] px-1.5 py-[5px] text-[12.5px] font-semibold text-foreground outline-none";
const segWrap = "flex border border-[rgba(32,30,29,0.4)]";

function SegBtn({ active, onClick, children, small = false }: {
  active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean;
}) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`border-0 px-[9px] py-[5px] font-extrabold ${small ? "text-[11px]" : "text-[12px]"} ${
        active ? "bg-[#201e1d] text-[#f3f2f2]" : "bg-transparent text-[rgba(32,30,29,0.65)] hover:text-foreground"
      }`}>
      {children}
    </button>
  );
}

export default function FilterBar({ showMateriality = false }: { showMateriality?: boolean }) {
  const { filter, patch, reset, data } = useFilter();
  const { t, lang, setLang } = useI18n();
  const W = meta.window;

  const periods: [string, number, number][] = [
    [t("filter.lastYear"), W.end, W.end],
    ["2y", W.end - 1, W.end],
    ["4y", W.end - 3, W.end],
    ["Full", W.start, W.end],
  ];

  const onExport = () =>
    downloadCsv(`uzb-mirror-hs6-${filter.from}-${filter.to}.csv`, channelsToCsv(data.channels6, filter));

  return (
    <div className="no-print sticky top-11 z-20 border-b-2 border-[rgba(32,30,29,0.4)] bg-[var(--color-bg)]">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-7 py-[11px]">
        <span className="lbl">{t("filter.period")}</span>
        <div className={segWrap}>
          {periods.map(([label, from, to]) => (
            <SegBtn key={label} active={filter.from === from && filter.to === to} onClick={() => patch({ from, to })}>
              {label}
            </SegBtn>
          ))}
        </div>
        <select className={sel} value={filter.from} aria-label="start year"
          onChange={(e) => patch({ from: Math.min(+e.target.value, filter.to) })}>
          {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <span className="text-[rgba(32,30,29,0.5)]">–</span>
        <select className={sel} value={filter.to} aria-label="end year"
          onChange={(e) => patch({ to: Math.max(+e.target.value, filter.from) })}>
          {meta.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <span className="lbl" title="Positive: partner reports more than Uzbekistan records. Reverse: Uzbekistan records more. Net can offset the two and is never the only headline.">
          {t("filter.direction")}
        </span>
        <select className={sel} value={filter.direction} onChange={(e) => patch({ direction: e.target.value as Direction })}>
          <option value="positive">{t("dir.positive")}</option>
          <option value="reverse">{t("dir.reverse")}</option>
          <option value="absolute">{t("dir.absolute")}</option>
          <option value="net">{t("dir.net")}</option>
        </select>

        <span className="lbl" title="Comparable: both sides reported. Residual: passes basic flags (non-transit, non-residual HS, ≥2 comparable years, freight-robust) — discrepancy remains unexplained.">
          {t("filter.stage")}
        </span>
        <select className={sel} value={filter.stage} onChange={(e) => patch({ stage: e.target.value as Stage })}>
          <option value="residual">{t("stage.residual")}</option>
          <option value="comparable">{t("stage.comparable")}</option>
        </select>

        <span className="lbl" title="Imports are valued CIF (with freight), exports FOB (without). The wedge is the one methodological assumption — 6% / 10% / 15% (§2.3).">
          {t("filter.freight")}
        </span>
        <select className={sel} value={filter.cif} onChange={(e) => patch({ cif: +e.target.value })}>
          <option value={meta.cif.low}>{Math.round(meta.cif.low * 100)}%</option>
          <option value={meta.cif.central}>{Math.round(meta.cif.central * 100)}% (central)</option>
          <option value={meta.cif.high}>{Math.round(meta.cif.high * 100)}%</option>
        </select>

        <span className="lbl">{t("filter.country")}</span>
        <select className={sel} value={filter.country} onChange={(e) => patch({ country: e.target.value })}>
          <option value="all">{t("filter.all")}</option>
          {[...meta.partners].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
            <option key={p.iso3} value={p.iso3}>{p.name}</option>
          ))}
        </select>

        <span className="lbl">{t("filter.hs2")}</span>
        <select className={sel} value={filter.hs2} onChange={(e) => patch({ hs2: e.target.value, category: "all" })}>
          <option value="all">{t("filter.all")}</option>
          {meta.chapters.map((c) => <option key={c.chapter} value={c.chapter}>{c.chapter} · {c.label}</option>)}
        </select>

        {showMateriality && (
          <>
            <span className="lbl" title="Materiality floor on the active direction metric.">{t("filter.materiality")}</span>
            <select className={sel} value={filter.minGap} onChange={(e) => patch({ minGap: +e.target.value })}>
              <option value={0}>0</option>
              <option value={100_000}>$100K</option>
              <option value={1_000_000}>$1M</option>
              <option value={5_000_000}>$5M</option>
              <option value={10_000_000}>$10M</option>
              <option value={50_000_000}>$50M</option>
            </select>
          </>
        )}

        <button onClick={reset}
          className="border border-[rgba(32,30,29,0.4)] bg-transparent px-2.5 py-[5px] text-[11.5px] font-semibold text-foreground hover:bg-[rgba(32,30,29,0.07)] active:bg-[rgba(32,30,29,0.14)]"
          title="Reset all filters to defaults (language unchanged)">
          {t("filter.reset")}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className={segWrap} role="group" aria-label="Language">
            {(["en", "ru"] as Lang[]).map((l) => (
              <SegBtn key={l} small active={lang === l} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </SegBtn>
            ))}
          </div>
          <button onClick={onExport}
            className="bg-[#ec3013] px-[11px] py-[5px] text-[11.5px] font-semibold text-[#f3f2f2] hover:bg-[#dd2b0f] active:bg-[#ae1800]"
            title="Download every HS6 channel under the active filters as CSV (raw + derived fields, context header).">
            {t("common.exportCsv")}
          </button>
        </div>
      </div>
    </div>
  );
}
