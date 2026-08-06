"use client";

import Link from "next/link";
import FilterBar from "@/components/FilterBar";
import CommodityBars from "@/components/charts/CommodityBars";
import Heatmap from "@/components/charts/Heatmap";
import Sparkline from "@/components/charts/Sparkline";
import { SectionTitle, ContextLine, EmptyState, InfoTip } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, DIRECTION_LABELS, isResidualChapter } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtUSD, fmtUSDFull, fmtPct, COLORS } from "@/lib/format";
import { channelsToCsv, downloadCsv } from "@/lib/export";

/**
 * HS2 sectors (spec §6.7): where residual unexplained discrepancies sit across
 * the goods nomenclature. Sector-level discrepancies are screening signals for
 * further review — never proof of under-declaration or smuggling.
 */
export default function CommoditiesView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();

  const chapterLabels: Record<string, string> = Object.fromEntries(data.chapters.map((c) => [c.chapter, c.label]));
  const dirLabel = DIRECTION_LABELS[filter.direction];

  // rising chapters over the full window — residual chapters (98/99) are shown
  // in the table for transparency but excluded from any priority language
  const rising = series.movers.goods
    .filter((g) => g.trend > 0 && g.total > 0 && !isResidualChapter(g.key))
    .sort((a, b) => b.trend - a.trend)
    .slice(0, 6);

  const exportCsv = () =>
    downloadCsv(`hs2-sector-channels-${filter.from}-${filter.to}.csv`, channelsToCsv(data.channels, filter));

  return (
    <div className="space-y-8">
      {/* header */}
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wider text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · sector-level screening
        </p>
        <h1 className="max-w-4xl text-2xl font-semibold tracking-tight">
          HS2 sectors: where the residual unexplained discrepancy sits
        </h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          Each HS2 chapter aggregates every comparable country × chapter channel under the current filters.
          Positive discrepancies (partner reports more than Uzbekistan records, amber) and reverse
          discrepancies (Uzbekistan records more, blue) are always shown separately — a sector-level
          discrepancy is a statistical screening signal, not evidence of under-declaration or smuggling.
          Residual chapters (HS 98/99, unallocated or confidential trade) are flagged and shown for
          transparency only.
        </p>
      </section>

      <FilterBar showMateriality />
      <ContextLine filter={filter} />

      {data.chapters.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* top-15 bars by the active direction */}
          <section>
            <SectionTitle
              title={`Top HS2 sectors — ${dirLabel}`}
              desc={`The 15 chapters with the largest ${dirLabel.toLowerCase()} discrepancy under the current filters (source: UN Comtrade mirror data). Bars are ranked by the active direction metric only — switch the direction filter to re-rank. Residual chapters are labelled and carry no priority meaning.`}
            />
            <CommodityBars chapters={data.chapters} direction={filter.direction} />
          </section>

          {/* ranking table */}
          <section>
            <SectionTitle
              title="Sector ranking"
              desc="All HS2 chapters with comparable observations under the current filters, sorted by the active direction. Both directions are always listed — the net figure alone never tells the whole story."
              right={
                <button
                  onClick={exportCsv}
                  className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] font-medium text-muted hover:text-foreground"
                  title="Download all country × HS2 channel rows under the active filters, with data version and methodology in the header."
                >
                  {t("common.exportCsv")} ↓
                </button>
              }
            />
            <ContextLine filter={filter} />
            <div className="card overflow-x-auto">
              <table className="zebra w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                    <th className="px-3 py-2 font-medium">HS2</th>
                    <th className="px-3 py-2 font-medium">{t("common.sector")}</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Comparable trade <InfoTip text="Partner-reported exports (FOB) in channels where both sides reported — the denominator of the analysis." />
                    </th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: COLORS.positive }}>
                      Positive <InfoTip text="Σ max(expected CIF − UZB imports, 0) per channel-year: partner reports more than Uzbekistan records." />
                    </th>
                    <th className="px-3 py-2 text-right font-medium" style={{ color: COLORS.reverse }}>
                      Reverse <InfoTip text="Σ max(UZB imports − expected CIF, 0): Uzbekistan records more than the partner. Shown separately, never netted away." />
                    </th>
                    <th className="px-3 py-2 text-right font-medium">
                      Gap rate <InfoTip text="Positive discrepancy as a share of expected CIF imports (partner exports × (1 + freight)) in this chapter." />
                    </th>
                    <th className="px-3 py-2 font-medium">Top partner</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Channels <InfoTip text="Number of country × HS2 channels contributing to this chapter under the current filters." />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-soft)]">
                  {data.chapters.map((c) => (
                    <tr key={c.chapter}>
                      <td className="tabular px-3 py-2 text-xs text-faint">{c.chapter}</td>
                      <td className="max-w-[300px] px-3 py-2">
                        <span className="font-medium">{c.label}</span>
                        {c.residual && (
                          <span className="ml-2 inline-block align-middle">
                            <span
                              className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                              style={{ color: COLORS.transit, background: "color-mix(in srgb, var(--color-transit) 10%, transparent)" }}
                              title="Residual HS category (unallocated or confidential trade): mirror gaps here are substantially classification artifacts by construction. Shown for transparency only — carries no screening priority."
                            >
                              residual — transparency only
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-right" title={fmtUSDFull(c.peT)}>{fmtUSD(c.peT)}</td>
                      <td className="tabular px-3 py-2 text-right font-semibold" style={{ color: COLORS.positive }} title={fmtUSDFull(c.posT)}>
                        {fmtUSD(c.posT)}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-semibold" style={{ color: COLORS.reverse }} title={fmtUSDFull(c.revT)}>
                        {fmtUSD(c.revT)}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{fmtPct(c.gapRate)}</td>
                      <td className="px-3 py-2">
                        {c.topPartner ? (
                          <Link href={`/partners/${c.topPartner.iso3.toLowerCase()}`} className="hover:underline">
                            {c.topPartner.name}{" "}
                            <span className="tabular text-xs text-faint">{fmtUSD(c.topPartner.value)}</span>
                          </Link>
                        ) : (
                          <span className="text-faint" title="No single channel exceeds the noise floor in the active direction.">
                            none above noise floor
                          </span>
                        )}
                      </td>
                      <td className="tabular px-3 py-2 text-right">{c.channels}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-faint">
              {data.chapters.length} chapters · {t("common.source")} · values in nominal USD · sorted by the active
              direction ({dirLabel}). Chapters without comparable observations are omitted — absence of a row means no
              mirror reference, not a zero gap.
            </p>
          </section>

          {/* rising chapters — trend mini-section */}
          <section className="card p-4">
            <SectionTitle
              title="Chapters rising fastest"
              desc={`Chapters whose ${filter.direction === "reverse" ? "reverse" : "positive"} discrepancy grew the most over the full ${meta.window.start}–${meta.window.end} window under the current filters (recent-years average vs early-years average; source: UN Comtrade). Residual chapters are excluded here. A rising discrepancy is a screening signal for review, not proof of a worsening compliance problem.`}
            />
            {rising.length === 0 ? (
              <p className="text-sm text-muted">No non-residual chapter shows a rising discrepancy under the current filters.</p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rising.map((g) => (
                  <li key={g.key} className="flex items-center gap-3 rounded-md border border-[var(--color-border-soft)] p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        <span className="tabular text-xs text-faint">{g.key}</span> {g.label}
                      </div>
                      <div className="text-xs text-muted">
                        +{fmtUSD(g.trend)}/yr recent vs early ·{" "}
                        <span className="tabular" title={fmtUSDFull(g.total)}>{fmtUSD(g.total)}</span> over window
                      </div>
                    </div>
                    <Sparkline
                      data={g.series.map((s) => s.v)}
                      color={filter.direction === "reverse" ? COLORS.reverse : COLORS.positive}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* chapter × partner heatmap */}
          <section>
            <SectionTitle
              title="Sector × partner heatmap"
              desc="Signed discrepancy per chapter × partner under the current filters (source: UN Comtrade mirror data). Amber cells: partner reports more than Uzbekistan records; blue cells: the opposite; blank cells: no comparable observation — never a zero gap. Click a cell to open the partner profile."
            />
            <Heatmap data={data.heatmap} chapterLabels={chapterLabels} />
          </section>
        </>
      )}

      {/* HS6 drill-down link */}
      <section>
        <Link href="/products" className="card card-hover flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h2 className="text-base font-semibold">Drill down to HS6 products →</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Chapter totals blend many distinct goods. The HS6 product view ranks individual 6-digit lines by their
              cumulative positive gap, with unit-value checks and per-product profiles.
            </p>
          </div>
          <span className="rounded-md bg-[var(--color-panel-2)] px-3 py-1.5 text-sm font-medium text-[var(--color-primary)]">
            {t("nav.products")}
          </span>
        </Link>
      </section>
    </div>
  );
}
