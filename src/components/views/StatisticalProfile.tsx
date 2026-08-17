"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption, YAXisComponentOption } from "echarts";
import EChart from "@/components/EChart";
import LevelTabs, { LEVEL_LABEL_KEYS, type HsLevel } from "@/components/LevelTabs";
import { EmptyState, InfoTip, SectionTitle, Stat, TransitTag } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { meta, yearsLabel, type Aggregate, type Channel } from "@/lib/dataset";
import { BAR_SPEC, baseGrid, baseTooltip, catAxis } from "@/lib/echartBase";

/**
 * Statistical profile — how the positive discrepancy is distributed, how much of
 * it clears each materiality threshold, how concentrated it is, and which
 * channels carry it year after year. Descriptive throughout: nothing here is a
 * risk score, so it reads from the unfiltered base channels rather than the
 * screened queue.
 */

const cat = (data: (string | number)[]) => ({
  ...catAxis(data),
  axisLabel: { color: COLORS.axis, fontSize: 10 },
});
const moneyAxis = (name?: string): YAXisComponentOption => ({
  type: "value", name,
  nameTextStyle: { color: COLORS.axis, fontSize: 10 },
  axisLabel: { color: COLORS.axis, fontSize: 10, formatter: (v: number) => fmtUSD(v) },
  splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
  axisLine: { show: false },
});
const countAxis = (name?: string): YAXisComponentOption => ({
  type: "value", name,
  nameTextStyle: { color: COLORS.axis, fontSize: 10 },
  axisLabel: { color: COLORS.axis, fontSize: 10 },
  splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
  axisLine: { show: false },
});

/** Series-identity dot for column headers — the header text itself stays ink. */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

const levelBase = (a: Aggregate, level: HsLevel): Channel[] =>
  level === 2 ? a.baseChannels : level === 4 ? a.baseChannels4 : a.baseChannels6;

/** Percentile with linear interpolation over an ascending-sorted array. */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

const TH = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint whitespace-nowrap";
const TH_NUM = `${TH} text-right`;
const TD = "px-3 py-1.5 align-middle text-[13px]";
const TD_NUM = `${TD} tabular text-right whitespace-nowrap`;

const THRESHOLDS = [
  { v: 100_000, label: "≥ $100K" },
  { v: 1_000_000, label: "≥ $1M" },
  { v: 5_000_000, label: "≥ $5M" },
  { v: 10_000_000, label: "≥ $10M" },
  { v: 50_000_000, label: "≥ $50M" },
];

// log10 histogram buckets for the gap (positive discrepancy only)
const HIST_EDGES = [100_000, 1_000_000, 10_000_000, 100_000_000, 1_000_000_000];
const HIST_LABELS = ["< $100K", "$100K–1M", "$1M–10M", "$10M–100M", "$100M–1B", "≥ $1B"];

export default function StatisticalProfile({ agg }: { agg: Aggregate }) {
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(2);
  const base = levelBase(agg, level);
  const n = base.length;
  const filter = agg.filter;

  /* ---- (a) distribution of the gap ---- */
  const dist = useMemo(() => {
    if (n === 0) return null;
    const vals = base.map((c) => c.posT).sort((a, b) => a - b);
    const mean = vals.reduce((s, v) => s + v, 0) / n;
    const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(n - 1, 1));
    return {
      mean, sd,
      median: quantile(vals, 0.5),
      p95: quantile(vals, 0.95), p99: quantile(vals, 0.99),
    };
  }, [base, n]);

  const histOption = useMemo<EChartsOption>(() => {
    const counts = new Array(HIST_LABELS.length).fill(0) as number[];
    for (const c of base) {
      let k = 0;
      while (k < HIST_EDGES.length && c.posT >= HIST_EDGES[k]) k++;
      counts[k] += 1;
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
          return `${HIST_LABELS[p.dataIndex]}<br/>${fmtNum(p.value)} ${t("risk.channelsCount")}`;
        },
      },
      xAxis: { ...cat(HIST_LABELS), axisLabel: { color: COLORS.axis, rotate: 35, fontSize: 10, interval: 0 } },
      yAxis: countAxis(t("risk.channelsCount")),
      series: [{
        name: t("risk.channelsCount"),
        type: "bar",
        data: counts,
        ...BAR_SPEC,
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.positive },
        barMaxWidth: 32,
      }],
    };
  }, [base, t]);

  /* ---- (b) materiality thresholds ---- */
  const thres = useMemo(() => {
    const posTotal = base.reduce((s, c) => s + c.posT, 0);
    const rows = THRESHOLDS.map(({ v, label }) => {
      const above = base.filter((c) => c.posT >= v);
      const value = above.reduce((s, c) => s + c.posT, 0);
      return { label, count: above.length, value, share: posTotal > 0 ? value / posTotal : 0 };
    });
    return { rows, posTotal };
  }, [base]);

  // single value axis — the cumulative share lives in the tooltip and in the
  // "Share of the total" column of the table above (no dual-axis charts)
  const thresOption = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const arr = params as { dataIndex: number }[];
        const r = thres.rows[arr[0].dataIndex];
        return `${r.label}<br/>${fmtNum(r.count)} ${t("risk.channelsCount")} · ${fmtUSDFull(r.value)}<br/>${fmtPct(r.share)} ${t("risk.ofTotalGap")}`;
      },
    },
    xAxis: cat(thres.rows.map((r) => r.label)),
    yAxis: countAxis(t("risk.channelsCount")),
    series: [
      {
        name: t("risk.series.aboveThreshold"),
        type: "bar",
        data: thres.rows.map((r) => r.count),
        ...BAR_SPEC,
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.positive },
      },
    ],
  }), [thres, t]);

  /* ---- (c) concentration ---- */
  const conc = useMemo(() => {
    const sorted = base.filter((c) => c.posT > 0).sort((a, b) => b.posT - a.posT);
    const total = sorted.reduce((s, c) => s + c.posT, 0);
    const topShare = (k: number) => (total > 0 ? sorted.slice(0, k).reduce((s, c) => s + c.posT, 0) / total : 0);
    const hhi = total > 0 ? Math.round(sorted.reduce((s, c) => s + (c.posT / total) ** 2, 0) * 10000) : 0;
    const countTo = (p: number) => {
      if (total <= 0) return 0;
      let cum = 0;
      for (let i = 0; i < sorted.length; i++) {
        cum += sorted[i].posT;
        if (cum / total >= p) return i + 1;
      }
      return sorted.length;
    };
    const pareto = sorted.slice(0, 15);
    const cumShares: number[] = [];
    pareto.reduce((cum, c) => {
      const next = cum + c.posT;
      cumShares.push(next / (total || 1));
      return next;
    }, 0);
    return {
      n: sorted.length, total, hhi,
      top1: topShare(1), top5: topShare(5), top10: topShare(10), top20: topShare(20),
      n50: countTo(0.5), n75: countTo(0.75), n90: countTo(0.9),
      pareto, cumShares,
    };
  }, [base]);

  const paretoOption = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    grid: { ...baseGrid, bottom: 56 },
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const arr = params as { dataIndex: number }[];
        const i = arr[0].dataIndex;
        const c = conc.pareto[i];
        return `${c.partner} · ${c.cmdLabel}<br/>HS ${c.cmd}<br/>${t("risk.th.gap")}: ${fmtUSDFull(c.posT)}<br/>${t("risk.cumulativeShare")}: ${fmtPct(conc.cumShares[i])}`;
      },
    },
    xAxis: {
      ...cat(conc.pareto.map((c) => `${c.partnerIso} ${c.cmd}`)),
      axisLabel: { color: COLORS.axis, rotate: 45, fontSize: 10, fontFamily: "var(--font-geist-mono), monospace", interval: 0 },
    },
    // single money axis — the cumulative share lives in the tooltip only (no dual-axis charts)
    yAxis: moneyAxis(),
    series: [
      {
        name: t("risk.th.gap"),
        type: "bar",
        data: conc.pareto.map((c) => Math.round(c.posT)),
        ...BAR_SPEC,
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.positive },
      },
    ],
  }), [conc, t]);

  /* ---- (d) persistent channels ---- */
  const persistent = useMemo(
    () =>
      base
        .filter((c) => c.comparableYears >= 3)
        .sort(
          (a, b) =>
            b.longestPosStreak - a.longestPosStreak ||
            b.posYears / b.comparableYears - a.posYears / a.comparableYears ||
            b.posT - a.posT,
        )
        .slice(0, 10),
    [base],
  );
  const persistentShare = useMemo(
    () => (n > 0 ? base.filter((c) => c.longestPosStreak >= 3).length / n : 0),
    [base, n],
  );

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-3xl space-y-1.5">
        <p className="text-[13px] leading-relaxed text-muted">
          {t("risk.profile.introA")} <strong className="text-foreground">{t("risk.profile.baseWord")}</strong>{" "}
          {t("risk.profile.introB")} {t("risk.profile.channelDef")} {t(LEVEL_LABEL_KEYS[level])} ·{" "}
          {yearsLabel(filter.years)} · {fmtNum(n)} {t("risk.channelsCount")}.
        </p>
        {/* the level tabs and the page filters both change WHICH channels these
            statistics describe, which is the usual source of confusion here */}
        <p className="text-[11.5px] leading-relaxed text-faint">{t("risk.profile.whyChanges")}</p>
      </div>
      <LevelTabs level={level} onChange={setLevel} label={null} />
    </div>
  );

  if (n === 0) {
    return <div className="space-y-4">{header}<EmptyState /></div>;
  }

  return (
    <div className="space-y-6">
      {header}

      {/* (a) distribution */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.dist.title")}
          desc={`${t("risk.dist.desc")} ${Math.round(filter.cif * 100)}%. ${t("risk.dist.descTail")}`}
        />
        {dist && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label={t("risk.dist.mean")}
              value={fmtUSD(dist.mean)}
              sub={`${t("risk.dist.medianWord")} ${fmtUSD(dist.median)}`}
              info={`${t("risk.dist.mean.info")} N = ${fmtNum(n)}.`}
            />
            <Stat
              label={t("risk.dist.sd")}
              value={fmtUSD(dist.sd)}
              sub={t("risk.dist.sd.sub")}
              info={`${t("risk.dist.sd.info")} N = ${fmtNum(n)}.`}
            />
            <Stat
              label="P95"
              value={fmtUSD(dist.p95)}
              sub={t("risk.dist.p95.sub")}
              info={`${t("risk.dist.p95.info")} N = ${fmtNum(n)}.`}
            />
            <Stat
              label="P99"
              value={fmtUSD(dist.p99)}
              sub={t("risk.dist.p99.sub")}
              info={`${t("risk.dist.p99.info")} N = ${fmtNum(n)}.`}
            />
          </div>
        )}
        <div className="card p-3" style={{ height: 300 }}>
          <EChart option={histOption} />
        </div>
        <p className="max-w-3xl text-xs text-faint">
          {t("risk.dist.footnote")} {t("common.source")}.
        </p>
      </section>

      {/* (b) thresholds */}
      <section className="space-y-3">
        <SectionTitle title={t("risk.thres.title")} desc={t("risk.thres.desc")} />
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>
                  {t("risk.th.threshold")} <InfoTip text={t("risk.thres.thresholdInfo")} />
                </th>
                <th className={TH_NUM}>{t("risk.th.channels")}</th>
                <th className={TH_NUM}><HeadDot color={COLORS.positive} />{t("risk.th.sumGap")}</th>
                <th className={TH_NUM}>
                  {t("risk.th.shareOfTotal")} <InfoTip text={`${t("risk.thres.shareInfo")} ${fmtUSD(thres.posTotal)} (N = ${fmtNum(n)}).`} />
                </th>
              </tr>
            </thead>
            <tbody className="zebra">
              {thres.rows.map((r) => (
                <tr key={r.label} className="border-b border-[var(--color-border-soft)] last:border-0">
                  <td className={`${TD} tabular font-medium`}>{r.label}</td>
                  <td className={TD_NUM}>{fmtNum(r.count)}</td>
                  <td className={TD_NUM}>{fmtUSD(r.value)}</td>
                  <td className={TD_NUM}>{fmtPct(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card p-3" style={{ height: 300 }}>
          <EChart option={thresOption} />
        </div>
      </section>

      {/* (c) concentration */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.conc.title")}
          desc={t("risk.conc.desc")}
          right={<InfoTip text={`${t("risk.conc.info")} N = ${fmtNum(conc.n)}.`} />}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={t("risk.conc.top1top5")}
            value={`${fmtPct(conc.top1, 0)} / ${fmtPct(conc.top5, 0)}`}
            sub={t("risk.ofTotalGap")}
            info={`${t("risk.conc.top1top5.info")} ${fmtUSD(conc.total)}. N = ${fmtNum(conc.n)}.`}
          />
          <Stat
            label={t("risk.conc.top10top20")}
            value={`${fmtPct(conc.top10, 0)} / ${fmtPct(conc.top20, 0)}`}
            sub={t("risk.ofTotalGap")}
            info={`${t("risk.conc.top10top20.info")} ${fmtUSD(conc.total)}. N = ${fmtNum(conc.n)}.`}
          />
          <Stat
            label="HHI"
            value={fmtNum(conc.hhi)}
            sub={t("risk.conc.hhi.sub")}
            info={`${t("risk.conc.hhi.info")} N = ${fmtNum(conc.n)}.`}
          />
          <Stat
            label={t("risk.conc.coverage")}
            value={`${fmtNum(conc.n50)} / ${fmtNum(conc.n75)} / ${fmtNum(conc.n90)}`}
            sub={t("risk.conc.coverage.sub")}
            info={`${t("risk.conc.coverage.info")} ${fmtUSD(conc.total)}.`}
          />
        </div>
        <div className="card p-3" style={{ height: 320 }}>
          <EChart option={paretoOption} />
        </div>
        <p className="max-w-3xl text-xs text-faint">
          {t("risk.conc.paretoTop")} {conc.pareto.length} / {fmtNum(conc.n)}{" "}
          {t("risk.conc.channelsWithGap")}. {t("risk.conc.paretoNote")} {t("common.source")}.
        </p>
      </section>

      {/* (d) persistent channels */}
      <section className="space-y-3">
        <SectionTitle
          title={t("risk.persist.title")}
          desc={`${t(LEVEL_LABEL_KEYS[level])} · ${yearsLabel(filter.years)}. ${t("risk.persist.desc")}`}
          right={<InfoTip text={`${t("risk.persist.info")} ${fmtPct(persistentShare, 0)} (N = ${fmtNum(n)}).`} />}
        />
        {persistent.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={TH}>{t(LEVEL_LABEL_KEYS[level])} · {t("risk.th.code")}</th>
                  <th className={TH_NUM} title={t("risk.persist.streakTip")}>{t("risk.th.streak")}</th>
                  <th className={TH_NUM} title={t("risk.persist.gapYearsTip")}>{t("risk.th.gapCompYrs")}</th>
                  <th className={TH_NUM} title={t("risk.persist.totalGapTip")}><HeadDot color={COLORS.positive} />{t("risk.th.totalGap")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {persistent.map((c) => (
                  <tr key={`${c.partnerIso}-${c.cmd}`} className="border-b border-[var(--color-border-soft)]">
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="font-medium hover:underline">{c.partner}</Link>
                      {c.transit && <span className="ml-1.5"><TransitTag /></span>}
                    </td>
                    <td className={`${TD} max-w-[320px]`}>
                      <span className="tabular mr-1.5 text-xs text-faint">{c.cmd}</span>
                      <span title={c.cmdLabel}>{c.cmdLabel.length > 52 ? `${c.cmdLabel.slice(0, 52)}…` : c.cmdLabel}</span>
                    </td>
                    <td className={TD_NUM} title={`${t("risk.persist.streakTip")}: ${c.longestPosStreak}`}>
                      {c.longestPosStreak} {t("risk.unit.yr")}
                    </td>
                    <td className={TD_NUM}>{c.posYears}/{c.comparableYears}</td>
                    <td className={TD_NUM} title={fmtUSDFull(c.posT)}>{fmtUSD(c.posT)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="max-w-3xl text-xs text-faint">
          {t("risk.persist.footnote")} {t("common.source")}. {meta.window.start}–{meta.window.end}.
        </p>
      </section>
    </div>
  );
}
