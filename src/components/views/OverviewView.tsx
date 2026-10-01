"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import { labelsFor } from "@/lib/labels";
import EChart from "@/components/EChart";
import GapTreemap, { type TreemapItem } from "@/components/charts/GapTreemap";
import { DATA_WINDOW, officialImportsOver, OFFICIAL_IMPORTS_SOURCE, hsFullLabel } from "@/lib/dataset";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import { Stat, SectionTitle, InfoTip, EmptyState, Segmented } from "@/components/ui";
import YearSelect from "@/components/YearSelect";
import {
  aggregate, DEFAULT_FILTER, meta, needsMonthlyDetail, yearsFor, yearsLabel,
  type Granularity,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";
import { CHART_FONT, baseGrid, baseTextStyle, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

/**
 * Executive Overview — a standalone summary across every partner, with the
 * statistical profile of the discrepancy as its second view. Period is the only
 * control and both views follow it; the page builds its own aggregate rather than
 * reading the shared filter context, so partner and HS selections made elsewhere
 * never reshape it.
 */
const FULL_WINDOW = { ...DEFAULT_FILTER, years: [...yearsFor("year")] };

type OverviewTab = "summary" | "profile";

export default function OverviewView() {
  const { t, lang } = useI18n();
  /** Overview's controls: the time basis and which periods the summary covers. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [summaryYears, setSummaryYears] = useState<number[]>(() => {
    const w = yearsFor("year");
    return [w[w.length - 1]];
  });
  const [profileYears, setProfileYears] = useState<number[]>(() => [...yearsFor("year")]);
  const [months, setMonths] = useState<number[]>([]);
  const [tab, setTab] = useState<OverviewTab>("summary");
  const years = tab === "profile" ? profileYears : summaryYears;
  const setYears = tab === "profile" ? setProfileYears : setSummaryYears;
  // The HS4/HS6 detail backs both the monthly basis and any year the annual
  // workbook never reached, so either one has to trigger the fetch.
  const detailVer = useMonthlyDetail(granularity === "month" || years.some(needsMonthlyDetail));
  const data = useMemo(
    () => aggregate({ ...FULL_WINDOW, granularity, years, months }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [granularity, years, months, detailVer],
  );
  const k = data.kpis;
  // Product Analysis's share, summed the way its chapter table sums: the gap
  // over the partner-reported exports on the same channel-years
  const gapShare = useMemo(() => data.channels.reduce(
    (s, c) => ({ pos: s.pos + c.posT, pe: s.pe + c.pePosT }), { pos: 0, pe: 0 },
  ), [data]);

  /*
   * The two treemap panels: who and what carry the positive discrepancy over
   * the selected period. Countries come off the partner rollup; products are
   * the HS6 channels grouped by code across partners — the measurement grain,
   * so these tiles sum against the same total the headline shows.
   */
  /*
   * The actual import flow as the statistics office publishes it — the context
   * the mirror numbers sit inside. Null when a selected year has no published
   * figure yet, in which case the two cards simply do not render: a KPI that
   * silently covered fewer years than its label would be worse than none.
   */
  const official = useMemo(() => officialImportsOver(years), [years]);
  const throughNote = official?.partial
    ? ` (${t(years.length > 1 ? "ovw.stat.throughMonth" : "ovw.stat.throughMonthOnly")
        .split("{year}").join(String(official.partial.year))
        .split("{month}").join(t(`month.${official.partial.throughMonth}` as never))})`
    : "";

  const treemap = useMemo(() => {
    const countries: TreemapItem[] = [...data.partners]
      .sort((a, b) => b.posT - a.posT)
      .map((p) => ({ key: p.iso3, label: p.name, value: p.posT, href: `/partners/${p.iso3.toLowerCase()}` }));
    const byCmd = new Map<string, { label: string; value: number }>();
    for (const c of data.baseChannels6) {
      if (c.posT <= 0) continue;
      const e = byCmd.get(c.cmd) ?? { label: c.cmdLabel, value: 0 };
      e.value += c.posT;
      byCmd.set(c.cmd, e);
    }
    const products: TreemapItem[] = [...byCmd.entries()]
      .sort((a, b) => b[1].value - a[1].value)
      .map(([cmd, e]) => ({
        key: cmd,
        // the full official name, on the tile and in the list under it, in the
        // reader's language
        label: labelsFor(lang, () => hsFullLabel(cmd)),
        detail: `HS ${cmd}`,
        value: e.value,
        href: `/products?hs6=${cmd}`,
      }));
    return { countries, products };
  }, [data, lang]);
  const periodLabel = yearsLabel(years);

  const pickGranularity = (g: Granularity) => {
    if (g === granularity) return;
    setGranularity(g);
    // every month ticked, not an empty set meaning "all": the picker shows what
    // is selected, and an empty one read as though no month had been chosen
    setMonths(g === "month" ? Array.from({ length: 12 }, (_, i) => i + 1) : []);
    // keep only years the target basis actually carries; empty means the full window
    const window = yearsFor(g);
    const kept = years.filter((y) => window.includes(y));
    setYears(kept.length ? kept : [...window]);
  };

  const monthOptions = useMemo<SearchOption[]>(
    () => Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: t(`month.${i + 1}` as never),
    })),
    [t],
  );

  const annualOption = useMemo<EChartsOption>(() => {
    // Uzbekistan's monthly book only starts partway into the window (2019-01):
    // leading periods where nothing is comparable are a data gap, not a signal,
    // so the chart starts at the first period both books cover.
    const firstLive = data.annual.findIndex((a) => a.comparablePartners > 0);
    const rows = firstLive > 0 ? data.annual.slice(firstLive) : data.annual;
    const periods = rows.map((a) => a.label ?? String(a.year));
    const positiveName = t("kpi.positive");
    const shareName = t("ovw.series.gapShare");
    // The gap as a share of the partner's reported FOB exports over the positive
    // channel-years — the same ratio the queue's Gap % column shows.
    const shares = rows.map((a) => (a.pePos > 0 ? a.positive / a.pePos : null));
    // 90+ monthly points would smother the lines in dots
    const dots = rows.length > 24 ? 0 : 7;
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, top: 58, right: 48 },
      legend: {
        top: 4,
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 3,
        textStyle: { color: COLORS.text, fontSize: CHART_FONT.axisLabel },
      },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "line" },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as {
            axisValue?: string | number; seriesName?: string; value?: number; marker?: string;
          }[];
          if (items.length === 0) return "";
          const period = String(items[0]?.axisValue ?? "");
          const lines = items.map((it) => {
            const v = typeof it.value !== "number"
              ? t("common.notComparable")
              : it.seriesName === shareName ? fmtPct(it.value, 1) : fmtUSDFull(it.value);
            return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
          });
          return `<div style="font-weight:600;margin-bottom:4px">${period}</div>${lines.join("")}`;
        },
      },
      xAxis: catAxis(periods),
      yAxis: [
        valueAxis(),
        {
          type: "value",
          axisLabel: { color: COLORS.axis, fontSize: CHART_FONT.axisLabel, formatter: (v: number) => fmtPct(v, 0) },
          splitLine: { show: false },
          axisLine: { show: false },
        },
      ],
      series: [
        {
          name: positiveName,
          type: "line",
          yAxisIndex: 0,
          data: rows.map((a) => Math.round(a.positive)),
          smooth: 0.3,
          symbol: "circle",
          symbolSize: dots,
          lineStyle: { width: 2, color: COLORS.positive },
          itemStyle: { color: COLORS.positive, borderColor: COLORS.surface, borderWidth: 2 },
          z: 3,
        },
        {
          name: shareName,
          type: "line",
          yAxisIndex: 1,
          data: shares,
          smooth: 0.3,
          symbol: "circle",
          symbolSize: dots,
          lineStyle: { width: 2, color: COLORS.gold },
          itemStyle: { color: COLORS.gold, borderColor: COLORS.surface, borderWidth: 2 },
          z: 2,
        },
      ],
    };
  }, [data, t]);

  /**
   * Both directions in one frame. The rest of the dashboard screens the positive
   * side only, which leaves an obvious question unanswered: how big is the other
   * side, and do the two cancel? Diverging bars answer it directly — positive up,
   * reverse down, on a shared axis so their heights are comparable — and the net
   * line says whether what is left over is the whole of one side or the residue
   * of two that nearly matched.
   */
  const twoSidedOption = useMemo<EChartsOption>(() => {
    const firstLive = data.annual.findIndex((a) => a.comparablePartners > 0);
    const rows = firstLive > 0 ? data.annual.slice(firstLive) : data.annual;
    const periods = rows.map((a) => a.label ?? String(a.year));
    const positiveName = t("kpi.positive");
    const reverseName = t("qual.heatmap.reverse");
    const netName = t("ovw.twoSided.net");
    const dots = rows.length > 24 ? 0 : 7;
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, top: 80 },
      legend: {
        top: 4,
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 8,
        textStyle: { color: COLORS.text, fontSize: CHART_FONT.axisLabel },
      },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as {
            axisValue?: string | number; seriesName?: string; value?: number; marker?: string;
          }[];
          if (items.length === 0) return "";
          const period = String(items[0]?.axisValue ?? "");
          // the reverse side is plotted negative to make it diverge; report it as a magnitude
          const lines = items.map((it) => {
            const v = typeof it.value === "number" ? fmtUSDFull(Math.abs(it.value)) : t("common.notComparable");
            return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
          });
          return `<div style="font-weight:600;margin-bottom:4px">${period}</div>${lines.join("")}`;
        },
      },
      xAxis: catAxis(periods),
      yAxis: valueAxis(),
      series: [
        {
          name: positiveName,
          type: "bar",
          stack: "gap",
          data: rows.map((a) => Math.round(a.positive)),
          barMaxWidth: 24,
          itemStyle: { color: COLORS.positive, borderRadius: [3, 3, 0, 0] },
          z: 2,
        },
        {
          name: reverseName,
          type: "bar",
          stack: "gap",
          data: rows.map((a) => -Math.round(a.reverse)),
          barMaxWidth: 24,
          itemStyle: { color: COLORS.goldDeep, borderRadius: [0, 0, 3, 3] },
          z: 2,
        },
        {
          name: netName,
          type: "line",
          data: rows.map((a) => Math.round(a.positive - a.reverse)),
          smooth: 0.3,
          symbol: "circle",
          symbolSize: dots,
          lineStyle: { width: 2, color: COLORS.transit },
          itemStyle: { color: COLORS.transit, borderColor: COLORS.surface, borderWidth: 2 },
          z: 3,
        },
      ],
    };
  }, [data, t]);



  return (
    <div className="space-y-6">
      {/* 1. heading, and the window the data covers — stated once, above the controls */}
      <section className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.overview")}</h1>
        {/*
          The window is a property of the dataset, not of the period picked below
          it, so it reads the data window rather than the selection and does not
          move when the reader filters.
        */}
        <div className="flex items-baseline gap-2">
          <span className="fs-11.5 font-semibold uppercase tracking-wider text-faint">
            {t("ovw.stat.yearsCovered")}
          </span>
          <span className="tabular fs-15 font-semibold">
            {DATA_WINDOW.start}–{DATA_WINDOW.end}
          </span>
          <InfoTip text={t("ovw.stat.yearsCovered.info")} />
        </div>
      </section>

      {/* 2. time basis + period — dropdowns of ticks — and the view switch beside them */}
      <section className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="fs-11.5 font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
            <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
              {(["year", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => pickGranularity(g)}
                  aria-pressed={granularity === g}
                  className={`px-2.5 py-1.5 fs-13 whitespace-nowrap ${granularity === g ? "bg-[var(--color-primary)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
                >
                  {t(g === "year" ? "gran.year" : "gran.month")}
                </button>
              ))}
            </div>
          </div>
          <YearSelect years={years} onChange={setYears} label={t("ovw.period")} available={yearsFor(granularity)} />
          {granularity === "month" && (
            <MultiSelect
              values={months.map(String)}
              onChange={(v) => setMonths(v.map(Number).sort((a, b) => a - b))}
              options={monthOptions}
              label={t("filter.months")}
              allLabel={t("filter.allMonths")}
              selectAll
              searchable={false}
            />
          )}
        </div>
        <Segmented<OverviewTab>
          ariaLabel={t("ovw.view.aria")}
          value={tab}
          onChange={setTab}
          options={[
            { key: "summary", label: t("ovw.view.summary"), tip: t("ovw.view.summaryTip") },
            { key: "profile", label: t("ovw.view.profile"), tip: t("ovw.view.profileTip") },
          ]}
        />
      </section>

      {years.length === 0 && <EmptyState text={t("common.noPeriod")} />}

      {years.length > 0 && tab === "profile" && (
        <div className="space-y-6">
        {/* The two series stack, one above the other, on every screen. */}
        <div className="space-y-6">
        <section>
          <SectionTitle
            title={t("ovw.dynamics.title")}
            desc={`${t("ovw.dynamics.descA")} ${periodLabel} ${t("ovw.dynamics.descB")}`}
            right={<InfoTip text={t("ovw.dynamics.info")} />}
          />
          <div className="card p-4">
            <EChart option={annualOption} style={{ height: 300 }} />
          </div>
        </section>
  
        {/* 3b. the same window, both directions — the one place the reverse side is shown */}
        <section>
          <SectionTitle
            title={t("ovw.twoSided.title")}
            desc={t("ovw.twoSided.desc")}
            right={<InfoTip text={t("ovw.twoSided.info")} />}
          />
          <div className="card p-4">
            {/* read-only: hover shows the values, clicking opens nothing */}
            <EChart option={twoSidedOption} style={{ height: 300 }} />
          </div>
        </section>
        </div>
        </div>
      )}

      {years.length > 0 && tab === "summary" && (
        <div className="space-y-6">
      {/* 3. headline tiles — two rows of three: what the import bill is and how
          much of it this dataset sees; then what the discrepancy is on it */}
      <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {official && (
            <>
              <Stat
                label={t("ovw.stat.officialImports")}
                value={fmtUSD(official.usd)}
                info={`${t("ovw.stat.officialImports.info")} ${periodLabel}${throughNote}. ${t("ovw.stat.sourceWord")}: ${OFFICIAL_IMPORTS_SOURCE.name} (${OFFICIAL_IMPORTS_SOURCE.retrievedAt}).`}
                accent={COLORS.navy2}
              />
              <Stat
                label={t("ovw.stat.comtradeImports")}
                value={fmtUSD(data.observed.ui)}
                info={`${t("ovw.stat.comtradeImports.info")} ${periodLabel}.`}
                accent={COLORS.navy2}
              />
              <Stat
                label={t("ovw.stat.coverage")}
                value={fmtPct(data.observed.ui / official.usd, 1)}
                info={`${t("ovw.stat.coverage.info2")} ${fmtUSDFull(data.observed.ui)} ÷ ${fmtUSDFull(official.usd)}${throughNote}.`}
                accent={COLORS.navy3}
              />
            </>
          )}
          <HeroStat
            label={t("kpi.positive")}
            value={fmtUSD(k.positive.central)}
            info={`${t("ovw.stat.positive.info").split("{cif}").join(String(Math.round(FULL_WINDOW.cif * 100)))} ${t("ovw.stat.positiveBand")}: ${fmtUSD(k.positive.low)}–${fmtUSD(k.positive.high)} ${t("ovw.stat.positiveSub")}.`}
          />
          {/* the same figure Product Analysis prints for all products: the gap as a
              share of the partner-reported exports on the same rows */}
          <Stat
            label={t("prof.stat.share")}
            value={gapShare.pe > 0 ? fmtPct(gapShare.pos / gapShare.pe, 1) : "—"}
            info={`${t("prof.stat.share.info")} ${fmtUSDFull(gapShare.pos)} ÷ ${fmtUSDFull(gapShare.pe)}.`}
            accent={COLORS.positive}
          />
          <Stat
            label={t("ovw.stat.partnersCovered")}
            value={fmtNum(k.partnerCount)}
            info={`${t("ovw.stat.partnersOfTotal")
              .split("{n}").join(fmtNum(k.partnerCount))
              .split("{total}").join(fmtNum(meta.partners.filter((p) => p.reportedYears.length > 0).length))} ${t("ovw.stat.partnersCovered.info")}`}
            accent={COLORS.navy2}
          />
        </div>
      </section>

      {/*
        2b. the treemaps. They carry no section heading of their own: each panel
        title already says what it ranks, and the prose above them repeated it.
        The titles therefore have to do that work on their own, so they are set
        as headings rather than as faint captions.
      */}
      <section>
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h2 className="fs-15 font-bold tracking-tight">{t("ovw.treemap.countries")}</h2>
              <Link href="/partners" className="fs-13 font-medium text-[var(--color-primary)] hover:underline">{t("nav.partners")} →</Link>
            </div>
            <GapTreemap items={treemap.countries} ariaLabel={t("ovw.treemap.countries")} />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <h2 className="fs-15 font-bold tracking-tight">{t("ovw.treemap.products")}</h2>
              <Link href="/products" className="fs-13 font-medium text-[var(--color-primary)] hover:underline">{t("nav.products")} →</Link>
            </div>
            <GapTreemap items={treemap.products} ariaLabel={t("ovw.treemap.products")} fullNames />
          </div>
        </div>
      </section>

        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero stat: the ONE lead number on the page (26px; others stay 22px) */
/* ------------------------------------------------------------------ */

function HeroStat({ label, value, sub, info }: { label: string; value: string; sub?: string; info?: string }) {
  return (
    <div className="stat-card stat-card-hero" style={{ ["--stat-rail" as string]: COLORS.positive }}>
      <div className="flex items-start justify-between gap-2">
        <div className="fs-12 font-semibold uppercase leading-snug tracking-[0.08em] text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="fs-30 font-semibold leading-none tracking-tight" style={{ color: COLORS.positive }}>
          {value}
        </span>
      </div>
      {sub && <div className="mt-1.5 fs-12.5 leading-snug text-faint">{sub}</div>}
    </div>
  );
}
