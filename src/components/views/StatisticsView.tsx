"use client";

/**
 * Statistics & Thresholds (spec §6.2) — distributional and coverage statistics of the
 * residual unexplained discrepancy across observation channels. Everything here is
 * computed from the BASE channel set (before the stage / signal-class / materiality
 * filters) so counts and denominators stay stable; period, direction, partner view,
 * freight and HS/category filters still apply. All figures are statistical screening
 * signals — never proof of smuggling, fraud or under-declaration.
 */

import { useMemo, useState } from "react";
import type { EChartsOption, YAXisComponentOption } from "echarts";
import EChart from "@/components/EChart";
import FilterBar from "@/components/FilterBar";
import { ContextLine, EmptyState, InfoTip, SectionTitle, Stat } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { useI18n } from "@/lib/i18n";
import { isResidualChapter, ROBUSTNESS_LABELS, type Channel, type Robustness } from "@/lib/dataset";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { baseGrid, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";
import { COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";

/* ---------------------------------- helpers ---------------------------------- */

/** Percentile with linear interpolation over an ascending-sorted array. */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

const countYAxis = (name?: string): YAXisComponentOption => ({
  type: "value",
  name,
  nameTextStyle: { color: COLORS.axis },
  axisLabel: { color: COLORS.axis },
  splitLine: { lineStyle: { color: COLORS.grid } },
  axisLine: { show: false },
});

const pctYAxis = (name?: string): YAXisComponentOption => ({
  type: "value",
  name,
  min: 0,
  max: 1,
  nameTextStyle: { color: COLORS.axis },
  axisLabel: { color: COLORS.axis, formatter: (v: number) => fmtPct(v, 0) },
  splitLine: { show: false },
  axisLine: { show: false },
});

const TABS = [
  { key: "coverage", label: "Coverage" },
  { key: "distribution", label: "Distribution" },
  { key: "thresholds", label: "Thresholds" },
  { key: "concentration", label: "Concentration" },
  { key: "robustness", label: "Robustness" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const THRESHOLDS = [
  { v: 100_000, label: "≥ $100K" },
  { v: 1_000_000, label: "≥ $1M" },
  { v: 5_000_000, label: "≥ $5M" },
  { v: 10_000_000, label: "≥ $10M" },
  { v: 50_000_000, label: "≥ $50M" },
];

// symmetric log10 histogram buckets for the signed discrepancy
const HIST_EDGES = [100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
const HIST_POS_LABELS = ["$100K–1M", "$1M–10M", "$10M–100M", "$100M–1B", "≥ $1B"];
const HIST_LABELS = [
  ...HIST_POS_LABELS.map((l) => `− ${l}`).reverse(),
  "± < $100K",
  ...HIST_POS_LABELS,
];

const ROB_ORDER: { key: Robustness; color: string }[] = [
  { key: "robust", color: "#15803d" },
  { key: "freight-sensitive", color: "#b45309" },
  { key: "coverage-sensitive", color: "#eab308" },
  { key: "insufficient", color: "#75847b" },
];

/* ----------------------------------- view ------------------------------------ */

export default function StatisticsView() {
  const { data, filter } = useFilter();
  const { t } = useI18n();
  const [level, setLevel] = useState<2 | 6>(2);
  const [tab, setTab] = useState<TabKey>("coverage");

  // BASE variants: stage / signal / materiality intentionally NOT applied here.
  const chans: Channel[] = level === 2 ? data.baseChannels : data.baseChannels6;
  const n = chans.length;

  /* ---- coverage ---- */
  const cov = useMemo(() => {
    const yearsN = data.years.length;
    return {
      yearsN,
      hsCodes: new Set(chans.map((c) => c.cmd)).size,
      partners: new Set(chans.map((c) => c.partnerIso)).size,
      fullBothSides: chans.filter((c) => c.comparableYears === yearsN).length,
      withWeight: chans.filter((c) => c.uvYears > 0).length,
    };
  }, [chans, data.years.length]);

  const coverageOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: baseGrid,
      tooltip: { ...baseTooltip(), trigger: "axis", axisPointer: { type: "shadow" } },
      xAxis: catAxis(data.annual.map((a) => a.year)),
      yAxis: countYAxis("partners"),
      series: [
        {
          name: "Comparable partners",
          type: "bar",
          data: data.annual.map((a) => a.comparablePartners),
          itemStyle: { color: "#15803d", borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 48,
        },
      ],
    }),
    [data.annual],
  );

  /* ---- distribution ---- */
  const dist = useMemo(() => {
    if (n === 0) return null;
    const vals = chans.map((c) => c.signedT).sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1));
    return {
      mean,
      median: quantile(vals, 0.5),
      sd,
      q1: quantile(vals, 0.25),
      q3: quantile(vals, 0.75),
      p90: quantile(vals, 0.9),
      p95: quantile(vals, 0.95),
      p99: quantile(vals, 0.99),
      min: vals[0],
      max: vals[vals.length - 1],
      posSum: chans.reduce((s, c) => s + c.posT, 0),
      revSum: chans.reduce((s, c) => s + c.revT, 0),
    };
  }, [chans, n]);

  const histOption = useMemo<EChartsOption>(() => {
    // bucket index: 0 = "within ±$100K"; k = 1..5 by log10 decade; signed by direction
    const counts = new Array(HIST_LABELS.length).fill(0) as number[];
    const center = HIST_POS_LABELS.length; // index of the ± < $100K bucket
    for (const c of chans) {
      const a = Math.abs(c.signedT);
      let k = 0;
      if (a >= HIST_EDGES[0]) {
        k = 1;
        while (k < HIST_EDGES.length && a >= HIST_EDGES[k]) k++;
      }
      counts[center + (c.signedT >= 0 ? k : -k)] += 1;
    }
    return {
      backgroundColor: "transparent",
      grid: { ...baseGrid, bottom: 48 },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const p = (params as { dataIndex: number; value: number }[])[0];
          const side =
            p.dataIndex < center
              ? "Reverse (UZB > partner)"
              : p.dataIndex === center
                ? "Within the ±$100K noise band"
                : "Positive (partner > UZB)";
          return `${HIST_LABELS[p.dataIndex]}<br/>${side}<br/>${fmtNum(p.value)} channels`;
        },
      },
      xAxis: {
        ...catAxis(HIST_LABELS),
        axisLabel: { color: COLORS.axis, rotate: 35, fontSize: 10, interval: 0 },
      },
      yAxis: countYAxis("channels"),
      series: [
        {
          name: "Channels",
          type: "bar",
          data: counts.map((v, i) => ({
            value: v,
            itemStyle: {
              color: i < center ? COLORS.reverse : i === center ? "#75847b" : COLORS.positive,
              borderRadius: [3, 3, 0, 0] as [number, number, number, number],
            },
          })),
          barMaxWidth: 42,
        },
      ],
    };
  }, [chans]);

  /* ---- thresholds (positive direction) ---- */
  const thres = useMemo(() => {
    const posTotal = chans.reduce((s, c) => s + c.posT, 0);
    const rows = THRESHOLDS.map(({ v, label }) => {
      const above = chans.filter((c) => c.posT >= v);
      const value = above.reduce((s, c) => s + c.posT, 0);
      return { label, count: above.length, value, share: posTotal > 0 ? value / posTotal : 0 };
    });
    return { rows, posTotal };
  }, [chans]);

  const thresOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: baseGrid,
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = params as { dataIndex: number }[];
          const r = thres.rows[arr[0].dataIndex];
          return `${r.label}<br/>${fmtNum(r.count)} channels · ${fmtUSDFull(r.value)}<br/>${fmtPct(r.share)} of the positive total`;
        },
      },
      legend: { top: 0, textStyle: { color: COLORS.text } },
      xAxis: catAxis(thres.rows.map((r) => r.label)),
      yAxis: [countYAxis("channels"), pctYAxis("share of total")],
      series: [
        {
          name: "Channels above threshold",
          type: "bar",
          data: thres.rows.map((r) => r.count),
          itemStyle: { color: COLORS.positive, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 48,
        },
        {
          name: "Share of positive total covered",
          type: "line",
          yAxisIndex: 1,
          data: thres.rows.map((r) => Math.round(r.share * 1000) / 1000),
          lineStyle: { color: COLORS.text, width: 1.8 },
          itemStyle: { color: COLORS.text },
          symbolSize: 6,
        },
      ],
    }),
    [thres],
  );

  /* ---- concentration (positive direction) ---- */
  const conc = useMemo(() => {
    const sorted = chans.filter((c) => c.posT > 0).sort((a, b) => b.posT - a.posT);
    const total = sorted.reduce((s, c) => s + c.posT, 0);
    const topShare = (k: number) =>
      total > 0 ? sorted.slice(0, k).reduce((s, c) => s + c.posT, 0) / total : 0;
    const hhi =
      total > 0 ? Math.round(sorted.reduce((s, c) => s + (c.posT / total) ** 2, 0) * 10000) : 0;
    const countTo = (p: number) => {
      if (total <= 0) return 0;
      let cum = 0;
      for (let i = 0; i < sorted.length; i++) {
        cum += sorted[i].posT;
        if (cum / total >= p) return i + 1;
      }
      return sorted.length;
    };
    const pareto = sorted.slice(0, 30);
    let cum = 0;
    const cumShares = pareto.map((c) => (cum += c.posT) / (total || 1));
    return {
      n: sorted.length,
      total,
      top1: topShare(1),
      top5: topShare(5),
      top10: topShare(10),
      top20: topShare(20),
      hhi,
      n50: countTo(0.5),
      n75: countTo(0.75),
      n90: countTo(0.9),
      pareto,
      cumShares,
    };
  }, [chans]);

  const paretoOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { ...baseGrid, bottom: 64 },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = params as { dataIndex: number }[];
          const i = arr[0].dataIndex;
          const c = conc.pareto[i];
          return `${c.partner} · ${c.cmdLabel}<br/>HS ${c.cmd}<br/>Positive discrepancy: ${fmtUSDFull(c.posT)}<br/>Cumulative share: ${fmtPct(conc.cumShares[i])}`;
        },
      },
      legend: { top: 0, textStyle: { color: COLORS.text } },
      xAxis: {
        ...catAxis(conc.pareto.map((c) => `${c.partnerIso} ${c.cmd}`)),
        axisLabel: {
          color: COLORS.axis,
          rotate: 45,
          fontSize: 9,
          fontFamily: "var(--font-geist-mono), monospace",
          interval: 0,
        },
      },
      yAxis: [valueAxis("positive discrepancy"), pctYAxis("cumulative")],
      series: [
        {
          name: "Positive discrepancy",
          type: "bar",
          data: conc.pareto.map((c) => Math.round(c.posT)),
          itemStyle: { color: COLORS.positive, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 26,
        },
        {
          name: "Cumulative share",
          type: "line",
          yAxisIndex: 1,
          data: conc.cumShares.map((s) => Math.round(s * 1000) / 1000),
          lineStyle: { color: COLORS.text, width: 1.8 },
          itemStyle: { color: COLORS.text },
          symbolSize: 5,
        },
      ],
    }),
    [conc],
  );

  /* ---- robustness ---- */
  const rob = useMemo(() => {
    const by: Record<Robustness, number> = {
      robust: 0,
      "freight-sensitive": 0,
      "coverage-sensitive": 0,
      insufficient: 0,
    };
    for (const c of chans) by[c.robustness]++;
    const posTotal = chans.reduce((s, c) => s + c.posT, 0);
    const transitChans = chans.filter((c) => c.transit);
    const residChans = chans.filter((c) => isResidualChapter(c.chapter));
    return {
      by,
      persistent: chans.filter((c) => c.longestPosStreak >= 3).length,
      transitN: transitChans.length,
      transitVal: transitChans.reduce((s, c) => s + c.posT, 0),
      residN: residChans.length,
      residVal: residChans.reduce((s, c) => s + c.posT, 0),
      posTotal,
    };
  }, [chans]);

  const robOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      grid: { left: 8, right: 24, top: 32, bottom: 8, containLabel: true },
      tooltip: { ...baseTooltip(), trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: COLORS.text } },
      xAxis: {
        type: "value",
        axisLabel: { color: COLORS.axis },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: ["Channels"],
        axisLabel: { color: COLORS.axis },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: ROB_ORDER.map(({ key, color }) => ({
        name: ROBUSTNESS_LABELS[key],
        type: "bar" as const,
        stack: "rob",
        data: [rob.by[key]],
        itemStyle: { color },
        barMaxWidth: 40,
      })),
    }),
    [rob],
  );

  /* ---- chrome ---- */
  const levelBtn = (lv: 2 | 6) => (
    <button
      key={lv}
      onClick={() => setLevel(lv)}
      className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
        level === lv
          ? "bg-[var(--color-primary)] text-white"
          : "bg-[var(--color-panel-2)] text-muted hover:text-foreground"
      }`}
      title={lv === 2 ? "Statistics over partner × HS2-chapter channels" : "Statistics over partner × HS6-product channels"}
    >
      HS{lv}
    </button>
  );

  const exportBtn = (
    <button
      onClick={() =>
        downloadCsv(`statistics_base_hs${level}_${filter.from}-${filter.to}.csv`, channelsToCsv(chans, filter))
      }
      className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[13px] text-muted hover:text-foreground"
      title="Export the full base channel set under the current filters (raw + derived fields, with data & methodology version)."
    >
      {t("common.exportCsv")}
    </button>
  );

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Statistics & thresholds"
        desc="Distributional properties of the residual unexplained discrepancy across observation channels — coverage, spread, materiality thresholds, concentration and robustness. Discrepancies are statistical screening signals, not proof of misreporting."
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md bg-[var(--color-panel-2)] p-0.5">
              {levelBtn(2)}
              {levelBtn(6)}
            </div>
            {exportBtn}
          </div>
        }
      />

      <FilterBar />
      <ContextLine filter={filter} />
      <p className="text-xs text-faint">
        Statistics on this page are computed over the <strong className="text-muted">base</strong>{" "}
        channel set: the evidence-stage, signal-class and materiality filters are intentionally not
        applied, so counts and denominators stay stable. Period, direction, partner view, freight
        and HS/category filters do apply. A channel is one partner × HS{level} pair observed in the
        selected period.
      </p>

      {/* tab bar */}
      <div className="no-print flex flex-wrap gap-1 border-b border-[var(--color-border-soft)] pb-2">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${
              tab === tb.key
                ? "bg-[var(--color-primary)] text-white"
                : "bg-[var(--color-panel-2)] text-muted hover:text-foreground"
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {n === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* ------------------------------ 1. coverage ------------------------------ */}
          {tab === "coverage" && (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <Stat
                  label="Observation channels"
                  value={fmtNum(n)}
                  sub={`partner × HS${level} pairs`}
                  info={`Count of partner × HS${level} pairs with at least one reported flow above the $100K noise floor in the selected period. Base set — before stage/class/materiality filters.`}
                />
                <Stat
                  label={`Unique HS${level} codes`}
                  value={fmtNum(cov.hsCodes)}
                  sub="distinct commodity codes"
                  info={`Number of distinct HS${level} codes appearing in the ${fmtNum(n)} observation channels.`}
                />
                <Stat
                  label="Partners"
                  value={fmtNum(cov.partners)}
                  sub="reporting counterparties"
                  info={`Number of distinct partner countries appearing in the ${fmtNum(n)} observation channels under the current partner view.`}
                />
                <Stat
                  label="Both sides, all years"
                  value={fmtNum(cov.fullBothSides)}
                  sub={`${fmtPct(n > 0 ? cov.fullBothSides / n : 0, 0)} of channels`}
                  info={`Channels where both the partner and Uzbekistan reported in every year of the selected period (comparableYears = ${cov.yearsN}). Denominator: all ${fmtNum(n)} channels. Missing partner-years are never treated as zero flows.`}
                />
                <Stat
                  label="With weight data"
                  value={fmtPct(n > 0 ? cov.withWeight / n : 0, 0)}
                  sub={`${fmtNum(cov.withWeight)} channels ≥ 1 dual-weight year`}
                  info={`Share of channels with at least one year where BOTH sides reported net weight (uvYears > 0), enabling the $/kg unit-value check. Denominator: all ${fmtNum(n)} channels.`}
                />
              </section>

              <section>
                <SectionTitle
                  title="Comparable partners per year"
                  desc={`Number of partner countries with at least one comparable channel in each year of the selected period (from the HS2 base set). Source: UN Comtrade mirror set under the current filters. A drop is usually a reporting lapse, not a change in trade.`}
                />
                <div className="card p-3" style={{ height: 300 }}>
                  <EChart option={coverageOption} />
                </div>
              </section>
            </div>
          )}

          {/* ---------------------------- 2. distribution ---------------------------- */}
          {tab === "distribution" && dist && (
            <div className="space-y-6">
              <p className="max-w-3xl text-sm text-muted">
                Signed discrepancy per channel = expected CIF (partner exports ×{" "}
                {`1 + ${Math.round(filter.cif * 100)}%`} freight) − Uzbekistan-recorded imports,
                summed over the selected period. The distribution is heavy-tailed: a few large
                channels dominate the mean, so always read the mean together with the median.
              </p>
              <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                <Stat
                  label="Mean (signed)"
                  value={fmtUSD(dist.mean)}
                  sub={`median ${fmtUSD(dist.median)}`}
                  info={`Arithmetic mean of the signed channel discrepancy: Σ signedT / N over all N = ${fmtNum(n)} base channels. Heavily influenced by the tails — compare with the median.`}
                />
                <Stat
                  label="Median (signed)"
                  value={fmtUSD(dist.median)}
                  sub="50th percentile"
                  info={`50th percentile of the signed channel discrepancy (linear interpolation). Denominator: all ${fmtNum(n)} base channels.`}
                />
                <Stat
                  label="Std. deviation"
                  value={fmtUSD(dist.sd)}
                  sub="sample SD"
                  info={`Sample standard deviation: √( Σ(x − mean)² / (N − 1) ) over N = ${fmtNum(n)} channels. Large relative to the mean — another sign of heavy tails.`}
                />
                <Stat
                  label="Q1 / Q3"
                  value={`${fmtUSD(dist.q1)} / ${fmtUSD(dist.q3)}`}
                  sub="interquartile range"
                  info={`25th and 75th percentiles of the signed channel discrepancy (linear interpolation, N = ${fmtNum(n)}).`}
                />
                <Stat
                  label="P90 / P95"
                  value={`${fmtUSD(dist.p90)} / ${fmtUSD(dist.p95)}`}
                  sub="upper tail"
                  info={`90th and 95th percentiles of the signed channel discrepancy (N = ${fmtNum(n)}). The upper tail is where most of the positive total sits.`}
                />
                <Stat
                  label="P99"
                  value={fmtUSD(dist.p99)}
                  sub="extreme tail"
                  info={`99th percentile of the signed channel discrepancy (N = ${fmtNum(n)}).`}
                />
                <Stat
                  label="Min / Max"
                  value={`${fmtUSD(dist.min)} / ${fmtUSD(dist.max)}`}
                  sub="signed extremes"
                  info={`Smallest (most reverse) and largest (most positive) signed channel discrepancy in the base set (N = ${fmtNum(n)}).`}
                />
                <Stat
                  label="Σ positive / Σ reverse"
                  value={`${fmtUSD(dist.posSum)} / ${fmtUSD(dist.revSum)}`}
                  sub="never netted away"
                  info={`Σ max(signed, 0) and Σ max(−signed, 0) across channel-years. Positive (amber) = partner > UZB records; reverse (blue) = UZB > partner. Shown side by side because the net alone can hide two-sided asymmetry.`}
                />
              </section>

              <section>
                <SectionTitle
                  title="Histogram of the signed discrepancy"
                  desc="Channels binned on a symmetric log10 scale. Blue (left) = reverse discrepancy (UZB > partner); amber (right) = positive (partner > UZB); grey centre = within the ±$100K noise band. Source: UN Comtrade mirror set under the current filters."
                />
                <div className="card p-3" style={{ height: 320 }}>
                  <EChart option={histOption} />
                </div>
              </section>
            </div>
          )}

          {/* ----------------------------- 3. thresholds ----------------------------- */}
          {tab === "thresholds" && (
            <div className="space-y-6">
              <p className="max-w-3xl text-sm text-muted">
                How many channels would survive a given materiality floor, and how much of the
                positive discrepancy total they carry. Computed on the{" "}
                <strong className="text-foreground">positive</strong> direction (partner &gt; UZB
                records) over all {fmtNum(n)} base channels; reverse discrepancies are screened
                separately and are never netted against these figures.
              </p>

              <section className="card overflow-x-auto">
                <table className="zebra w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-soft)] text-left text-[11px] uppercase tracking-wider text-faint">
                      <th className="p-3">
                        Threshold{" "}
                        <InfoTip text="Materiality floor applied to the channel's total positive discrepancy (Σ max(signed, 0) over the selected period)." />
                      </th>
                      <th className="p-3 text-right">
                        Channels{" "}
                        <InfoTip text={`Count of channels whose positive discrepancy is at or above the threshold. Denominator for the share column: total positive discrepancy ${fmtUSD(thres.posTotal)} across all ${fmtNum(n)} base channels.`} />
                      </th>
                      <th className="p-3 text-right">Σ positive discrepancy</th>
                      <th className="p-3 text-right">
                        Share of positive total{" "}
                        <InfoTip text={`Σ positive discrepancy of channels above the threshold ÷ ${fmtUSD(thres.posTotal)} (the positive total over all base channels).`} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {thres.rows.map((r) => (
                      <tr key={r.label} className="border-b border-[var(--color-border-soft)] last:border-0">
                        <td className="tabular p-3 font-medium">{r.label}</td>
                        <td className="tabular p-3 text-right">{fmtNum(r.count)}</td>
                        <td className="tabular p-3 text-right" style={{ color: COLORS.positive }}>
                          {fmtUSD(r.value)}
                        </td>
                        <td className="tabular p-3 text-right">{fmtPct(r.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section>
                <SectionTitle
                  title="Channels above threshold & value covered"
                  desc="Amber bars: channel count at each floor (left axis). Line: share of the total positive discrepancy those channels carry (right axis) — a small number of large channels covers most of the value. Source: UN Comtrade mirror set under the current filters."
                />
                <div className="card p-3" style={{ height: 320 }}>
                  <EChart option={thresOption} />
                </div>
              </section>
            </div>
          )}

          {/* ---------------------------- 4. concentration --------------------------- */}
          {tab === "concentration" && (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  label="Top 1 / Top 5 share"
                  value={`${fmtPct(conc.top1, 0)} / ${fmtPct(conc.top5, 0)}`}
                  sub="of the positive total"
                  info={`Share of the total positive discrepancy (${fmtUSD(conc.total)}) held by the largest 1 and 5 channels. Denominator: ${fmtNum(conc.n)} channels with a positive discrepancy > 0.`}
                />
                <Stat
                  label="Top 10 / Top 20 share"
                  value={`${fmtPct(conc.top10, 0)} / ${fmtPct(conc.top20, 0)}`}
                  sub="of the positive total"
                  info={`Share of the total positive discrepancy held by the largest 10 and 20 channels. Denominator: ${fmtNum(conc.n)} positive channels.`}
                />
                <Stat
                  label="HHI"
                  value={fmtNum(conc.hhi)}
                  sub="0–10,000 scale"
                  info={`Herfindahl–Hirschman index: Σ (channel share of the positive total)² × 10,000 over all ${fmtNum(conc.n)} positive channels. Above ~2,500 is conventionally 'highly concentrated'.`}
                />
                <Stat
                  label="Channels to 50 / 75 / 90%"
                  value={`${fmtNum(conc.n50)} / ${fmtNum(conc.n75)} / ${fmtNum(conc.n90)}`}
                  sub="smallest sets covering the total"
                  info={`Minimum number of channels (sorted by positive discrepancy, descending) whose cumulative sum reaches 50%, 75% and 90% of the positive total (${fmtUSD(conc.total)}).`}
                />
              </section>

              <section>
                <SectionTitle
                  title="Pareto: largest positive-discrepancy channels"
                  desc={`Top ${conc.pareto.length} of ${fmtNum(conc.n)} positive channels (partner ISO3 + HS${level} code on the axis; hover for full names). Amber bars: channel positive discrepancy (left axis). Line: cumulative share of the positive total (right axis). Concentration means review effort can focus on few channels — it is not, by itself, evidence of misreporting. Source: UN Comtrade mirror set under the current filters.`}
                />
                <div className="card p-3" style={{ height: 380 }}>
                  <EChart option={paretoOption} />
                </div>
              </section>
            </div>
          )}

          {/* ----------------------------- 5. robustness ----------------------------- */}
          {tab === "robustness" && (
            <div className="space-y-6">
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat
                  label="Robust channels"
                  value={`${fmtNum(rob.by.robust)} (${fmtPct(n > 0 ? rob.by.robust / n : 0, 0)})`}
                  sub="sign holds at 6–15% freight"
                  info={`Channels whose discrepancy sign holds across the whole 6% / 10% / 15% freight band, with ≥2 comparable years and no coverage flags. Denominator: all ${fmtNum(n)} base channels.`}
                />
                <Stat
                  label="Persistent 3+ years"
                  value={fmtPct(n > 0 ? rob.persistent / n : 0, 0)}
                  sub={`${fmtNum(rob.persistent)} channels`}
                  info={`Channels with a positive-discrepancy streak of at least 3 consecutive years (longest streak ≥ 3 within the selected period). Denominator: all ${fmtNum(n)} base channels. Persistence strengthens a screening signal but is still not proof of intent.`}
                />
                <Stat
                  label="Transit share"
                  value={fmtPct(n > 0 ? rob.transitN / n : 0, 0)}
                  sub={`${fmtNum(rob.transitN)} channels · ${fmtUSD(rob.transitVal)} positive`}
                  accent={COLORS.transit}
                  info={`Channels involving a transit / re-export hub partner: count ÷ ${fmtNum(n)} base channels. Value sub-line: their positive discrepancy vs the ${fmtUSD(rob.posTotal)} total. Origin-vs-consignment recording can create legitimate discrepancies here.`}
                />
                <Stat
                  label="Residual-chapter share"
                  value={fmtPct(n > 0 ? rob.residN / n : 0, 0)}
                  sub={`${fmtNum(rob.residN)} channels · ${fmtUSD(rob.residVal)} positive`}
                  info={`Channels in HS 98/99 (residual / special-transaction codes): count ÷ ${fmtNum(n)} base channels. These codes are not comparable across reporters and are excluded from the residual stage.`}
                />
              </section>

              <section>
                <SectionTitle
                  title="Robustness composition"
                  desc={`All ${fmtNum(n)} base channels by scenario robustness. Green: sign holds across the 6–15% freight band. Amber: freight-sensitive (sign flips within the band). Yellow: coverage-sensitive (sparse or lapsed reporter). Grey: fewer than 2 comparable years. Labels in the legend carry the meaning — never the color alone. Source: UN Comtrade mirror set under the current filters.`}
                />
                <div className="card p-3" style={{ height: 150 }}>
                  <EChart option={robOption} />
                </div>
                <p className="mt-2 max-w-3xl text-xs text-faint">
                  Freight- and coverage-sensitive channels are not discarded: they are screened at
                  the comparable stage with lower evidence scores. A sensitive discrepancy most
                  often reflects valuation assumptions or reporting gaps, and is not proof of
                  intentional misreporting.
                </p>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
