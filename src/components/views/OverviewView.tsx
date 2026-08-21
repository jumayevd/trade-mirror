"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import MultiSelect from "@/components/MultiSelect";
import type { SearchOption } from "@/components/SearchSelect";
import { Stat, SectionTitle, InfoTip, EmptyState, Segmented } from "@/components/ui";
import StatisticalProfile from "@/components/views/StatisticalProfile";
import YearSelect from "@/components/YearSelect";
import {
  aggregate, DEFAULT_FILTER, meta, hsLabel, isDerivedYear, productByCmd, yearsFor, yearsLabel,
  type Channel, type Granularity,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { useMonthlyDetail } from "@/lib/use-monthly-detail";
import type { LocaleKey } from "@/lib/locales";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";
import { CHART_FONT, baseGrid, baseTextStyle, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

/**
 * Executive Overview — a standalone summary across every partner, with the
 * statistical profile of the discrepancy as its second view. Period is the only
 * control and both views follow it; the page builds its own aggregate rather than
 * reading the shared filter context, so partner and HS selections made elsewhere
 * never reshape it.
 */
const FULL_WINDOW = { ...DEFAULT_FILTER, years: [...meta.years] };
const TOP_N = 10;

type OverviewTab = "summary" | "profile";

interface RankRow {
  key: string;
  code: string;
  label: string;
  value: number;
  href?: string;
  note: string;
}

type Translate = (key: LocaleKey) => string;

/** Group partner × code channels by code, summing the positive discrepancy across partners. */
function topByCode(chs: Channel[], link: boolean, t: Translate): { rows: RankRow[]; total: number } {
  const m = new Map<string, { value: number; partners: Set<string>; label: string }>();
  for (const c of chs) {
    const e = m.get(c.cmd) ?? { value: 0, partners: new Set<string>(), label: hsLabel(c.cmd) };
    e.value += c.posT;
    e.partners.add(c.partnerIso);
    m.set(c.cmd, e);
  }
  const all = [...m.entries()].filter(([, e]) => e.value > 0);
  const total = all.reduce((s, [, e]) => s + e.value, 0);
  const rows = all
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, TOP_N)
    .map(([cmd, e]) => ({
      key: cmd,
      code: cmd,
      label: e.label,
      value: e.value,
      href: link && productByCmd(cmd) ? `/products/${cmd}` : undefined,
      note: `${fmtNum(e.partners.size)} ${e.partners.size === 1 ? t("ovw.note.partner") : t("ovw.note.partners")}`,
    }));
  return { rows, total };
}

export default function OverviewView() {
  const { t } = useI18n();
  /** Overview's controls: the time basis and which periods the summary covers. */
  const [granularity, setGranularity] = useState<Granularity>("year");
  const [years, setYears] = useState<number[]>(() => [...meta.years]);
  const [months, setMonths] = useState<number[]>([]);
  const [tab, setTab] = useState<OverviewTab>("summary");
  // The HS4/HS6 detail backs both the monthly basis and any year the annual
  // workbook never reached, so either one has to trigger the fetch.
  const detailVer = useMonthlyDetail(granularity === "month" || years.some(isDerivedYear));
  const data = useMemo(
    () => aggregate({ ...FULL_WINDOW, granularity, years, months }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [granularity, years, months, detailVer],
  );
  const k = data.kpis;
  const periodLabel = yearsLabel(years);

  const pickGranularity = (g: Granularity) => {
    if (g === granularity) return;
    setGranularity(g);
    setMonths([]);
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

  const partners = useMemo(() => {
    const all = data.partners.filter((p) => p.posT > 0);
    const total = all.reduce((s, p) => s + p.posT, 0);
    const rows: RankRow[] = all.slice(0, TOP_N).map((p) => ({
      key: p.iso3,
      code: p.iso3,
      label: p.transit ? `${p.name} ⇄` : p.name,
      value: p.posT,
      href: `/partners/${p.iso3.toLowerCase()}`,
      note: `${fmtNum(p.channels)} ${p.channels === 1 ? t("ovw.note.chapter") : t("ovw.note.chapters")}`,
    }));
    return { rows, total };
  }, [data, t]);

  const hs2 = useMemo(() => topByCode(data.channels, false, t), [data, t]);
  const hs4 = useMemo(() => topByCode(data.channels4, false, t), [data, t]);
  const hs6 = useMemo(() => topByCode(data.channels6, true, t), [data, t]);

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
      grid: { ...baseGrid, top: 40, right: 48 },
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
        valueAxis("USD"),
        {
          type: "value",
          name: shareName,
          nameTextStyle: { color: COLORS.axis, fontSize: CHART_FONT.axisName },
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
   * Which period the two-sided chart is drilled into, or null for the whole
   * window. Clicking a period asks the obvious follow-up — which partners is
   * this made of, and does the offsetting hold country by country?
   */
  const [drillYear, setDrillYear] = useState<number | null>(null);
  /** Years the current period selection actually covers, for the drill-down chips. */
  const drillPeriods = useMemo(
    () => [...new Set(data.annual.filter((a) => a.comparablePartners > 0).map((a) => a.year))],
    [data],
  );
  const drillRows = useMemo(() => {
    if (drillYear == null) return [];
    // Read the channels rather than the partner rollup: the rollup carries only
    // the positive side per year, and the point here is to see both.
    const byPartner = new Map<string, { name: string; iso3: string; positive: number; reverse: number }>();
    for (const c of data.channels) {
      for (const yr of c.years) {
        if (yr.y !== drillYear) continue;
        const e = byPartner.get(c.partnerIso)
          ?? { name: c.partner, iso3: c.partnerIso, positive: 0, reverse: 0 };
        if (yr.signed > 0) e.positive += yr.signed; else e.reverse += -yr.signed;
        byPartner.set(c.partnerIso, e);
      }
    }
    return [...byPartner.values()]
      .sort((a, b) => (b.positive + b.reverse) - (a.positive + a.reverse))
      .slice(0, TOP_N);
  }, [data, drillYear]);

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
      grid: { ...baseGrid, top: 40 },
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
      yAxis: valueAxis("USD"),
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

  /** The clicked period, opened up by partner: same two directions, same reading. */
  const drillOption = useMemo<EChartsOption>(() => {
    const positiveName = t("kpi.positive");
    const reverseName = t("qual.heatmap.reverse");
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, top: 34, left: 8 },
      legend: {
        top: 2,
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
            axisValue?: string; seriesName?: string; value?: number; marker?: string;
          }[];
          if (items.length === 0) return "";
          const row = drillRows.find((r) => r.name === items[0]?.axisValue);
          const net = row ? row.positive - row.reverse : null;
          const lines = items.map((it) => {
            const v = typeof it.value === "number" ? fmtUSDFull(Math.abs(it.value)) : t("common.notComparable");
            return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
          });
          const netLine = net == null ? "" :
            `<div style="margin-top:4px;color:${COLORS.axis}">${t("ovw.twoSided.net")}: <span style="font-weight:600">${fmtUSDFull(net)}</span></div>`;
          return `<div style="font-weight:600;margin-bottom:4px">${items[0]?.axisValue ?? ""}</div>${lines.join("")}${netLine}`;
        },
      },
      xAxis: catAxis(drillRows.map((r) => r.name)),
      yAxis: valueAxis("USD"),
      series: [
        {
          name: positiveName,
          type: "bar",
          stack: "gap",
          data: drillRows.map((r) => Math.round(r.positive)),
          barMaxWidth: 26,
          itemStyle: { color: COLORS.positive, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: reverseName,
          type: "bar",
          stack: "gap",
          data: drillRows.map((r) => -Math.round(r.reverse)),
          barMaxWidth: 26,
          itemStyle: { color: COLORS.goldDeep, borderRadius: [0, 0, 3, 3] },
        },
      ],
    };
  }, [drillRows, t]);


  return (
    <div className="space-y-6">
      {/* 1. heading + one quiet line */}
      <section className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.overview")}</h1>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          {t("ov.question")} {t("ovw.intro.whole")} {periodLabel} {t("ovw.intro.windowAll")}{" "}
          {fmtNum(meta.partners.length)} {t("ovw.intro.reportingPartners")}{" "}
          <Link href="/methodology" className="font-medium text-[var(--color-primary)] hover:underline">
            {t("nav.methodology")} →
          </Link>
        </p>
      </section>

      {/* 2. time basis + period — dropdowns of ticks — and the view switch beside them */}
      <section className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
            <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
              {(["year", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => pickGranularity(g)}
                  aria-pressed={granularity === g}
                  className={`px-2.5 py-1.5 text-[13px] whitespace-nowrap ${granularity === g ? "bg-[var(--color-primary)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
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

      {tab === "profile" && <StatisticalProfile agg={data} />}

      {tab === "summary" && (
        <div className="space-y-6">
      {/* 3. headline tiles */}
      <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <HeroStat
            label={t("kpi.positive")}
            value={fmtUSD(k.positive.central)}
            sub={`${fmtUSD(k.positive.low)}–${fmtUSD(k.positive.high)} ${t("ovw.stat.positiveSub")}`}
            info={t("ovw.stat.positive.info").split("{cif}").join(String(Math.round(FULL_WINDOW.cif * 100)))}
          />
          <Stat
            label={t("ovw.stat.partnersCovered")}
            value={fmtNum(k.partnerCount)}
            sub={`${t("ovw.stat.partnersOf")} ${fmtNum(meta.partners.length)} ${t("ovw.stat.partnersInDataset")}`}
            info={t("ovw.stat.partnersCovered.info")}
            accent={COLORS.navy2}
          />
          <Stat
            label={t("ovw.stat.yearsCovered")}
            value={periodLabel}
            sub={`${fmtNum(years.length)} ${t("ovw.stat.unit.years")} · ${fmtPct(k.coveragePct, 0)} ${t("ovw.stat.coverageSub")}`}
            info={t("ovw.stat.yearsCovered.info")}
            accent={COLORS.navy3}
          />
        </div>
      </section>

      {/* 3. overall dynamics */}
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
          <EChart
            option={twoSidedOption}
            style={{ height: 300 }}
            onEvents={{
              click: (p) => {
                // periods carry the year in the label ("2023" or "2023-05")
                const label = (p as { name?: string }).name ?? "";
                const year = Number(label.slice(0, 4));
                setDrillYear((cur) => (Number.isFinite(year) && cur !== year ? year : null));
              },
            }}
          />
          {/* The chart itself is a canvas, so the click above is mouse-only. The same
              drill-down is offered as buttons: keyboard-reachable, and it names the
              periods rather than asking the reader to guess that bars are clickable. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[12px] text-faint">{t("ovw.twoSided.clickHint")}</span>
            {drillPeriods.map((y) => (
              <button
                key={y}
                onClick={() => setDrillYear((cur) => (cur === y ? null : y))}
                aria-pressed={drillYear === y}
                className={`tabular rounded-md border px-1.5 py-0.5 text-[12px] font-medium ${
                  drillYear === y
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white"
                    : "border-[var(--color-border)] text-muted hover:text-foreground"
                }`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* the clicked period, by partner — same two directions, so the reader can
              see whether the offsetting they just saw survives country by country */}
          {drillYear != null && (
            <div className="mt-3 border-t border-[var(--color-border-soft)] pt-3">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-[13px] font-semibold">
                  {t("ovw.twoSided.byCountry")} · <span className="tabular">{drillYear}</span>
                </h3>
                <button
                  onClick={() => setDrillYear(null)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-0.5 text-[12px] font-medium text-muted hover:text-foreground"
                >
                  {t("ovw.twoSided.close")} ✕
                </button>
              </div>
              {drillRows.length === 0 ? (
                <EmptyState />
              ) : (
                <EChart option={drillOption} style={{ height: 280 }} />
              )}
            </div>
          )}

          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-faint">{t("ovw.twoSided.note")}</p>
        </div>
      </section>

      {/* 4. top partner countries */}
      <section>
        <SectionTitle
          title={t("ovw.topPartners.title")}
          desc={t("ovw.topPartners.desc")}
        />
        <RankedList rows={partners.rows} total={partners.total} codeWidth="w-10" />
      </section>

      {/* 5. top products at each HS level */}
      <section className="space-y-5">
        <SectionTitle
          title={t("ovw.topProducts.title")}
          desc={t("ovw.topProducts.desc")}
          right={
            <Link href="/products" className="text-sm font-medium text-[var(--color-primary)] hover:underline">
              {t("nav.products")} →
            </Link>
          }
        />
        <RankedBlock
          title={t("ovw.hs2.title")}
          hint={t("ovw.hs2.hint")}
          rows={hs2.rows}
          total={hs2.total}
          codeWidth="w-8"
        />
        <RankedBlock
          title={t("ovw.hs4.title")}
          hint={t("ovw.hs4.hint")}
          rows={hs4.rows}
          total={hs4.total}
          codeWidth="w-12"
        />
        <RankedBlock
          title={t("ovw.hs6.title")}
          hint={t("ovw.hs6.hint")}
          rows={hs6.rows}
          total={hs6.total}
          codeWidth="w-14"
        />
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
        <div className="text-[12px] font-semibold uppercase leading-snug tracking-[0.08em] text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tracking-tight" style={{ color: COLORS.positive }}>
          {value}
        </span>
      </div>
      {sub && <div className="mt-1.5 text-[12.5px] leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ranked list: rank · code · label · bar · value · share              */
/* ------------------------------------------------------------------ */

function RankedList({ rows, total, codeWidth }: { rows: RankRow[]; total: number; codeWidth: string }) {
  const { t } = useI18n();
  if (rows.length === 0) return <EmptyState />;
  const max = rows[0].value || 1;
  return (
    <div className="card space-y-1.5 p-4">
      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-3 text-[13px]">
          <span className="tabular w-4 shrink-0 text-right text-[12px] text-faint">{i + 1}</span>
          <span className={`tabular ${codeWidth} shrink-0 text-[12px] text-faint`}>{r.code}</span>
          <span className="w-52 shrink-0 truncate" title={r.label}>
            {r.href ? (
              <Link href={r.href} className="font-medium hover:underline">
                {r.label}
              </Link>
            ) : (
              r.label
            )}
          </span>
          <span className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-[var(--color-panel-2)]">
            <span
              className="absolute inset-y-0 left-0"
              style={{
                width: `${Math.max(1.5, (r.value / max) * 100)}%`,
                background: COLORS.positive,
                opacity: 0.65,
                borderRadius: "0 4px 4px 0",
                boxShadow: `0 0 0 1px ${COLORS.surface}`,
              }}
              title={fmtUSDFull(r.value)}
            />
          </span>
          <span className="tabular w-20 shrink-0 text-right font-medium" title={fmtUSDFull(r.value)}>
            {fmtUSD(r.value)}
          </span>
          <span
            className="tabular w-12 shrink-0 text-right text-[12px] text-faint"
            title={t("ovw.share.tip")}
          >
            {total > 0 ? fmtPct(r.value / total, 0) : "—"}
          </span>
          <span className="hidden w-20 shrink-0 text-right text-[12px] text-faint sm:block">{r.note}</span>
        </div>
      ))}
    </div>
  );
}

function RankedBlock({
  title, hint, rows, total, codeWidth,
}: {
  title: string; hint: string; rows: RankRow[]; total: number; codeWidth: string;
}) {
  return (
    <div>
      {/* the HS tier is the reader's orientation inside the top-10 block, so it
          carries ink weight rather than sitting as a faint micro-label */}
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
        {title}
        <InfoTip text={hint} />
      </p>
      <RankedList rows={rows} total={total} codeWidth={codeWidth} />
    </div>
  );
}
