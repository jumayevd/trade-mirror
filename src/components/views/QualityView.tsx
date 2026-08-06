"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import FilterBar from "@/components/FilterBar";
import EChart from "@/components/EChart";
import { Stat, SectionTitle, ContextLine, QualityTag, TransitTag, Pill, EmptyState } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, DATA_VERSION, METHODOLOGY_VERSION, type PartnerMeta } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { fmtNum, fmtPct, fmtUSD, fmtUSDFull, COLORS } from "@/lib/format";
import { baseGrid, baseTextStyle, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

const QUALITY_GREEN = "#15803d";

/* ------------------------------------------------------------------ */
/* 1. Reporter coverage heatmap cells                                  */
/* ------------------------------------------------------------------ */

type CellState = "reported" | "missing" | "stopMarker" | "stopped";

function cellState(p: PartnerMeta, y: number): CellState {
  if (p.reportedYears.includes(y)) return "reported";
  if (p.lapse && y > p.lastReportedYear) {
    return y === p.lastReportedYear + 1 ? "stopMarker" : "stopped";
  }
  return "missing";
}

function CoverageCell({ p, y }: { p: PartnerMeta; y: number }) {
  const state = cellState(p, y);
  if (state === "reported") {
    return (
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-full"
        style={{ background: QUALITY_GREEN }}
        title={`${p.name} reported to UN Comtrade in ${y}.`}
      />
    );
  }
  if (state === "stopMarker") {
    return (
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-sm border-2"
        style={{ borderColor: "var(--color-transit)" }}
        title={`${p.name}: reporting stops here — last reported year is ${p.lastReportedYear}. Later years are missing, not zero flows.`}
      />
    );
  }
  if (state === "stopped") {
    return (
      <span
        className="mx-auto block h-[3px] w-2.5 rounded-full bg-[var(--color-border)]"
        title={`${p.name} no longer reports (stopped after ${p.lastReportedYear}). Partner data missing; not treated as a zero gap.`}
      />
    );
  }
  return (
    <span
      className="mx-auto block h-2.5 w-2.5 rounded-full border border-[var(--color-faint)]"
      title={`${p.name} did not report in ${y}. Partner data missing; not treated as a zero gap.`}
    />
  );
}

function CoverageLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: QUALITY_GREEN }} />
        Reported
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-full border border-[var(--color-faint)]" />
        Not reported (missing — never a zero gap)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-2.5 w-2.5 rounded-sm border-2" style={{ borderColor: "var(--color-transit)" }} />
        Reporting stops here
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-[3px] w-2.5 rounded-full bg-[var(--color-border)]" />
        No longer reporting
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

export default function QualityView() {
  const { filter, series } = useFilter();
  const { t } = useI18n();

  const partnersByCoverage = useMemo(
    () => [...meta.partners].sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name)),
    [],
  );
  const transitPartners = useMemo(() => partnersByCoverage.filter((p) => p.transit), [partnersByCoverage]);

  // ---- 2. product (HS6) coverage per year, from the full-window aggregate ----
  const hs6ByYear = useMemo(() => {
    const m = new Map<number, { count: number; pe: number }>();
    for (const c of series.baseChannels6) {
      for (const yr of c.years) {
        const e = m.get(yr.y) ?? { count: 0, pe: 0 };
        e.count += 1;
        e.pe += yr.pe;
        m.set(yr.y, e);
      }
    }
    return meta.years.map((y) => ({ y, count: m.get(y)?.count ?? 0, pe: m.get(y)?.pe ?? 0 }));
  }, [series]);

  const coverageOption = useMemo<EChartsOption>(() => {
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, right: 72 },
      legend: { top: 0, textStyle: { color: COLORS.text, fontSize: 12 } },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        formatter: (params: unknown) => {
          const ps = (Array.isArray(params) ? params : [params]) as {
            seriesName?: string; value?: number; axisValueLabel?: string; marker?: string;
          }[];
          const head = ps[0]?.axisValueLabel ?? "";
          const lines = ps.map((p) =>
            `${p.marker ?? ""}${p.seriesName}: ${
              p.seriesName === "Partner-reported value" ? fmtUSDFull(p.value ?? 0) : fmtNum(p.value ?? 0)
            }`,
          );
          return [`<b>${head}</b>`, ...lines].join("<br/>");
        },
      },
      xAxis: catAxis(hs6ByYear.map((r) => r.y)),
      yAxis: [
        {
          type: "value",
          name: "HS6 channels",
          nameTextStyle: { color: COLORS.axis },
          axisLabel: { color: COLORS.axis, formatter: (v: number) => fmtNum(v) },
          splitLine: { lineStyle: { color: COLORS.grid } },
          axisLine: { show: false },
        },
        { ...valueAxis("partner value"), splitLine: { show: false } },
      ],
      series: [
        {
          name: "HS6 channels with data",
          type: "bar",
          data: hs6ByYear.map((r) => r.count),
          itemStyle: { color: QUALITY_GREEN, opacity: 0.75, borderRadius: [3, 3, 0, 0] },
          barWidth: "55%",
        },
        {
          name: "Partner-reported value",
          type: "line",
          yAxisIndex: 1,
          data: hs6ByYear.map((r) => Math.round(r.pe)),
          lineStyle: { color: COLORS.partner, width: 2 },
          itemStyle: { color: COLORS.partner },
          symbolSize: 6,
        },
      ],
    };
  }, [hs6ByYear]);

  // ---- 3. weight & quantity availability, from the full-window HS6 base ----
  const hs6 = series.baseChannels6;
  const withWeight = useMemo(() => hs6.filter((c) => c.uvYears > 0), [hs6]);
  const withUvRatio = useMemo(() => hs6.filter((c) => c.uvRatio != null), [hs6]);
  const peTotal = useMemo(() => hs6.reduce((s, c) => s + c.peT, 0), [hs6]);
  const peWithWeight = useMemo(() => withWeight.reduce((s, c) => s + c.peT, 0), [withWeight]);
  const weightShare = hs6.length > 0 ? withWeight.length / hs6.length : 0;
  const weightValueShare = peTotal > 0 ? peWithWeight / peTotal : 0;

  return (
    <div className="space-y-8">
      {/* header */}
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · reporting coverage &amp; comparability
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.quality")}</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-muted">
          A residual unexplained discrepancy is only as informative as the data behind it. This page
          documents who reported what and when, where weight and quantity fields exist, which partners
          are treated as transit hubs, and which observations are excluded before any screening signal
          is ranked. None of the gaps documented here are treated as evidence of misreporting — they
          bound what the comparison can and cannot support.
        </p>
      </section>

      <FilterBar />
      <ContextLine filter={filter} />

      {/* 1. reporter coverage heatmap */}
      <section>
        <SectionTitle
          title="Reporter coverage by partner and year"
          desc={`Which partners reported exports to Uzbekistan to UN Comtrade in each year of the ${meta.window.start}–${meta.window.end} window. A missing year removes the mirror for that partner-year entirely — it is excluded from comparison, never entered as a zero flow. Source: UN Comtrade reporter metadata.`}
        />
        <CoverageLegend />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                {meta.years.map((y) => (
                  <th key={y} className="tabular px-1.5 py-2 text-center font-medium">{y}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">{t("kpi.coverage")}</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {partnersByCoverage.map((p) => (
                <tr key={p.iso3} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                  <td className="px-3 py-1.5">
                    <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  {meta.years.map((y) => (
                    <td key={y} className="px-1.5 py-1.5 text-center">
                      <CoverageCell p={p} y={y} />
                    </td>
                  ))}
                  <td className="tabular px-3 py-1.5 text-right text-muted">{fmtPct(p.coverage, 0)}</td>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <QualityTag tier={p.tier} />
                      {p.transit && <TransitTag />}
                      {p.lapse && <Pill>stopped after {p.lastReportedYear}</Pill>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-3xl text-xs text-faint">
          Coverage = share of window years the partner reported. For lapsed reporters, discrepancies in
          years after the stop are labelled coverage-sensitive throughout the site and are down-weighted
          in evidence quality — a data lapse, not a trade pattern.
        </p>
      </section>

      {/* 2. product coverage */}
      <section>
        <SectionTitle
          title="Product-level (HS6) coverage by year"
          desc="Count of country × HS6 channels with at least one side reported in each year (bars, left axis) against total partner-reported export value in those channels (line, right axis). Full window under the current partner/sector filters. Source: UN Comtrade."
        />
        {hs6.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card p-4">
            <EChart option={coverageOption} style={{ height: 300 }} />
            <p className="mt-2 max-w-3xl text-xs text-faint">
              Granularity expansion effect: the number of distinct HS6 channels grows over the window
              partly because partners report at finer commodity detail in later years. A rising channel
              count therefore reflects reporting granularity as much as trade itself — year-on-year
              channel counts are not comparable without this caveat, which is why value (line) is shown
              alongside counts (bars).
            </p>
          </div>
        )}
      </section>

      {/* 3. weight & quantity */}
      <section>
        <SectionTitle
          title="Weight &amp; quantity availability"
          desc="Unit-value cross-checks (price-per-kg comparison between the two sides) require net weight reported by BOTH sides in the same channel-year. This section sizes that sample across the full window under the current filters. Source: UN Comtrade weight fields."
        />
        {hs6.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat
                label="HS6 channels with dual weight"
                value={fmtPct(weightShare, 0)}
                sub={`${fmtNum(withWeight.length)} of ${fmtNum(hs6.length)} channels have ≥1 year with weight on both sides`}
                accent={QUALITY_GREEN}
                info="Share of country × HS6 channels where at least one year has net weight reported by both the partner and Uzbekistan."
              />
              <Stat
                label="Value-weighted share"
                value={fmtPct(weightValueShare, 0)}
                sub={`${fmtUSD(peWithWeight)} of ${fmtUSD(peTotal)} partner-reported value`}
                accent={QUALITY_GREEN}
                info="Partner-reported export value in dual-weight channels as a share of all HS6 partner-reported value — larger channels report weights more often."
              />
              <Stat
                label="Usable unit-value ratios"
                value={fmtNum(withUvRatio.length)}
                sub="channels with ≥2 dual-weight years (minimum for a UV ratio)"
                info="A unit-value ratio is only computed with at least two comparable dual-weight years; single-year ratios are too volatile to interpret."
              />
            </div>
            <p className="mt-3 max-w-3xl text-xs text-faint">
              Unit-value checks exist only for this sample. For the remaining channels no price-level
              comparison is possible, so their anomaly score is computed without the unit-value component
              (re-weighted, per Methodology §7.4) — absence of weight data is a coverage limitation, not
              a signal in either direction.
            </p>
          </>
        )}
      </section>

      {/* 4. transit metadata */}
      <section>
        <SectionTitle
          title="Transit &amp; re-export partner metadata"
          desc="Partners flagged transit-sensitive and the basis for the flag. Classification basis: known re-export/consignment hubs on Uzbekistan import routes."
        />
        <p className="mb-3 max-w-3xl rounded-md border-l-2 border-l-[var(--color-transit)] bg-[var(--color-panel)] px-4 py-2.5 text-sm text-muted">
          <strong className="text-foreground">Why transit is assessed separately.</strong> Uzbekistan
          records imports by country of <em>origin</em>, while re-export hubs report their outbound
          shipments by <em>consignment</em>. Goods routed through a hub can therefore appear in the
          hub&apos;s export figures without ever appearing in Uzbekistan&apos;s imports from that hub —
          a legitimate methodological discrepancy, not misreporting. Channels involving these partners
          are classed Transit-sensitive and are excluded from the residual stage and from audit-priority
          rankings.
        </p>
        {transitPartners.length === 0 ? (
          <EmptyState text="No partners in the current dataset are flagged as transit hubs." />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[11px] uppercase tracking-wider text-faint">
                  <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                  <th className="px-3 py-2 font-medium">Region</th>
                  <th className="px-3 py-2 font-medium">Reporting</th>
                  <th className="tabular px-3 py-2 text-right font-medium">{t("kpi.coverage")}</th>
                  <th className="px-3 py-2 font-medium">Classification basis</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {transitPartners.map((p) => (
                  <tr key={p.iso3} className="border-b border-[var(--color-border-soft)] last:border-b-0">
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/partners/${p.iso3.toLowerCase()}`} className="font-medium hover:underline">
                          {p.name}
                        </Link>
                        <TransitTag />
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted">{p.region}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <QualityTag tier={p.tier} />
                        {p.lapse && <Pill>stopped after {p.lastReportedYear}</Pill>}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 text-right text-muted">{fmtPct(p.coverage, 0)}</td>
                    <td className="px-3 py-2 text-muted">
                      Known re-export/consignment hub on Uzbekistan import routes
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 5. excluded observations */}
      <section>
        <SectionTitle
          title="Excluded observations &amp; floors"
          desc="What is filtered out before ranking, and why. Exclusions limit false positives; they are documented here so the funnel from observed to residual channels stays auditable."
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">Residual HS chapters 98–99</h3>
            <p className="text-sm text-muted">
              Special-transaction and confidential-commodity codes (HS <span className="tabular">98</span>,{" "}
              <span className="tabular">99</span>) are not comparable at product level: countries park
              unallocated or confidential trade there under differing national rules. They remain visible
              in the Comparable stage for transparency but are excluded from the residual stage and from
              all audit-priority rankings.
            </p>
          </div>
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">Noise floor: $0.1M per channel-year</h3>
            <p className="text-sm text-muted">
              A channel-year discrepancy below $0.1M in magnitude is treated as statistical noise: it does
              not count as a positive or reverse year for persistence, and channels where both sides total
              under $0.1M over the period are dropped entirely. This prevents rounding and small-shipment
              timing effects from registering as signals.
            </p>
          </div>
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">HS6 materiality floor</h3>
            <p className="text-sm text-muted">
              HS6 channels enter the dataset only if they reach{" "}
              <span className="tabular">$8M</span> partner-reported value or{" "}
              <span className="tabular">$4M</span> discrepancy over the {meta.window.start}–{meta.window.end}{" "}
              window. Below that, mirror comparison at 6-digit detail is dominated by classification and
              timing differences. HS2 totals are unaffected — the floor limits only product-level detail.
            </p>
          </div>
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">Missing is never zero</h3>
            <p className="text-sm text-muted">
              When a partner did not report a year, that partner-year is removed from the comparison —
              it is never entered as a zero export that would fabricate a reverse discrepancy. Such gaps
              appear as &quot;{t("common.notReported")}&quot; throughout the site and reduce the coverage
              KPI instead of inflating any discrepancy total.
            </p>
          </div>
        </div>
      </section>

      {/* 6. refresh history */}
      <section>
        <SectionTitle
          title="Data refresh &amp; versioning"
          desc="Every figure on this site is computed from a single versioned snapshot; the version identifier appears in the context line above every analytical block and in every CSV export."
        />
        <div className="card divide-y divide-[var(--color-border-soft)]">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
            <span className="w-44 shrink-0 text-[11px] font-medium uppercase tracking-wider text-faint">{t("meta.dataVersion")}</span>
            <span className="tabular text-sm font-semibold">{DATA_VERSION}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
            <span className="w-44 shrink-0 text-[11px] font-medium uppercase tracking-wider text-faint">{t("meta.generated")}</span>
            <span className="tabular text-sm">{meta.generatedAt}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
            <span className="w-44 shrink-0 text-[11px] font-medium uppercase tracking-wider text-faint">{t("meta.methodologyVersion")}</span>
            <span className="tabular text-sm">v{METHODOLOGY_VERSION}</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
            <span className="w-44 shrink-0 text-[11px] font-medium uppercase tracking-wider text-faint">Source</span>
            <span className="text-sm">
              UN Comtrade (annual trade data, HS2 + HS6), window {meta.window.start}–{meta.window.end}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-3">
            <span className="w-44 shrink-0 text-[11px] font-medium uppercase tracking-wider text-faint">Update policy</span>
            <span className="max-w-2xl text-sm text-muted">
              Snapshots replace atomically: a refresh regenerates the entire dataset and swaps it in one
              step, so the site never mixes figures from two data versions. Comtrade itself revises past
              years, so totals can change between versions — comparisons across data versions should cite
              the version identifier.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
