"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption, YAXisComponentOption } from "echarts";
import EChart from "@/components/EChart";
import FilterBar from "@/components/FilterBar";
import QueueTable, { LEVEL_LABELS, type HsLevel } from "@/components/QueueTable";
import RiskMatrix from "@/components/charts/RiskMatrix";
import { ContextLine, EmptyState, EvidenceBadge, InfoTip, SectionTitle, Stat, TransitTag } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import {
  aggregate, meta, ROBUSTNESS_LABELS,
  type Aggregate, type Channel, type Filter, type Robustness,
} from "@/lib/dataset";
import { BAR_SPEC, LINE_SPEC, baseGrid, baseTooltip, catAxis } from "@/lib/echartBase";

/**
 * Discrepancy & Risk — the analytical hub. Three quiet tabs share one HS-level state:
 *  1. Ranked components  — risk matrix + ranked table (the screening queue)
 *  2. Reverse focus      — the reverse direction, analysed separately, never netted
 *  3. Statistical profile — distribution, thresholds, concentration, robustness
 * Every number is a statistical screening signal — never a finding of wrongdoing.
 */

type TabKey = "ranked" | "reverse" | "profile";
const TABS: { key: TabKey; label: string; tip: string }[] = [
  { key: "ranked", label: "Ranked components", tip: "Risk matrix and the ranked table of all partner × code combinations under the current filters." },
  { key: "reverse", label: "Reverse focus", tip: "Reverse discrepancies (UZB records > partner) analysed separately — never netted against positive ones." },
  { key: "profile", label: "Statistical profile", tip: "Distribution, materiality thresholds, concentration and robustness of the discrepancy across base channels." },
];

/* ---------- quiet chart axis helpers (fontSize 10, palette-only) ---------- */

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
const quietLegend = { top: 0, textStyle: { color: COLORS.text, fontSize: 11 }, itemWidth: 12, itemHeight: 8 };

/** Series-identity dot for column headers — the header text itself stays ink (rule 5). */
function HeadDot({ color }: { color: string }) {
  return (
    <span aria-hidden className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: color }} />
  );
}

const levelChannels = (a: Aggregate, level: HsLevel): Channel[] =>
  level === 2 ? a.channels : level === 4 ? a.channels4 : a.channels6;
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

/* shared table cell classes (design rules) */
const TH = "px-3 py-1.5 text-left text-[10.5px] font-medium text-faint whitespace-nowrap";
const TH_NUM = `${TH} text-right`;
const TD = "px-3 py-1.5 align-middle text-[13px]";
const TD_NUM = `${TD} tabular text-right whitespace-nowrap`;

function LevelToggle({ level, onChange }: { level: HsLevel; onChange: (l: HsLevel) => void }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label="HS level">
      {([2, 4, 6] as const).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          aria-pressed={level === l}
          className={`px-2 py-1 text-[12px] whitespace-nowrap ${level === l ? "bg-[var(--color-panel-2)] font-semibold text-foreground" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
        >
          {LEVEL_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

export default function QueueView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(2);
  const [tab, setTab] = useState<TabKey>("ranked");

  const channels = levelChannels(data, level);

  // reverse aggregates — the global filter is never mutated
  const revFilter = useMemo<Filter>(() => ({ ...filter, direction: "reverse" }), [filter]);
  const rev = useMemo(() => aggregate(revFilter), [revFilter]);
  const revFull = useMemo(
    () => aggregate({ ...revFilter, from: meta.window.start, to: meta.window.end }),
    [revFilter],
  );
  const revRanked = useMemo(
    () => [...levelChannels(rev, level)].sort((a, b) => b.revT - a.revT),
    [rev, level],
  );

  const statsBase = levelBase(data, level);

  const exportCsv = () => {
    if (tab === "reverse") downloadCsv(`reverse-focus-hs${level}-${filter.from}-${filter.to}.csv`, channelsToCsv(revRanked, revFilter));
    else if (tab === "profile") downloadCsv(`statistical-profile-base-hs${level}-${filter.from}-${filter.to}.csv`, channelsToCsv(statsBase, filter));
    else downloadCsv(`discrepancy-risk-hs${level}.csv`, channelsToCsv(channels, filter));
  };
  const exportEmpty = tab === "reverse" ? revRanked.length === 0 : tab === "profile" ? statsBase.length === 0 : channels.length === 0;

  return (
    <div className="space-y-6">
      {/* header */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[10.5px] font-medium text-faint">
              UN Comtrade · {meta.window.start}–{meta.window.end} · mirror-statistics screening
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("nav.queue")}</h1>
            <p className="text-[13px] text-muted">
              Screening signals — not proof of wrongdoing ·{" "}
              <Link href="/methodology" className="hover:underline">Methodology →</Link>
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={exportEmpty}
            className="no-print rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            title={`Download the rows behind the active tab (${LEVEL_LABELS[level]}) under the current filters, with the calculation context in the header.`}
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
      </section>

      <FilterBar showMateriality />
      <ContextLine filter={filter} />

      {/* segmented tab control */}
      <div className="no-print flex overflow-hidden rounded-md border border-[var(--color-border)] self-start w-fit" role="tablist" aria-label="Analysis tabs">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            title={tb.tip}
            className={`px-2.5 py-1 text-[12px] whitespace-nowrap ${tab === tb.key ? "bg-[var(--color-panel-2)] font-semibold text-foreground" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "ranked" && (
        <RankedTab channels={channels} level={level} onLevelChange={setLevel} filter={filter} years={data.years} />
      )}
      {tab === "reverse" && (
        <ReverseTab rev={rev} revFull={revFull} revFilter={revFilter} ranked={revRanked} level={level} onLevelChange={setLevel} />
      )}
      {tab === "profile" && (
        <ProfileTab base={statsBase} seriesAgg={series} filter={filter} level={level} onLevelChange={setLevel} />
      )}
    </div>
  );
}

/* ================================ TAB 1 — ranked ================================ */

function RankedTab({
  channels, level, onLevelChange, filter, years,
}: {
  channels: Channel[]; level: HsLevel; onLevelChange: (l: HsLevel) => void;
  filter: Filter; years: number[];
}) {
  const stats = useMemo(() => {
    const investigate = channels.filter((c) => c.cls === "investigate").length;
    const sorted = [...channels].sort((a, b) => Math.abs(b.primary) - Math.abs(a.primary));
    const total = sorted.reduce((s, c) => s + Math.abs(c.primary), 0);
    const top5 = sorted.slice(0, 5).reduce((s, c) => s + Math.abs(c.primary), 0);
    const dirTotal = sorted.reduce((s, c) => s + c.primary, 0);
    return { investigate, top5Share: total > 0 ? top5 / total : 0, dirTotal };
  }, [channels]);

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle
          title="Analytical significance"
          desc="Evidence quality (x) × anomaly strength (y)."
          right={<InfoTip text={`Every ${LEVEL_LABELS[level]} combination; bubble area ∝ discrepancy in the active direction, colour = signal class. Quadrant guides mirror the classification thresholds (E 60, A 55).`} />}
        />
        <RiskMatrix channels={channels} filter={filter} />
      </section>

      <section className="space-y-3">
        <SectionTitle
          title="Ranked analytical components"
          desc="Click a row for per-year detail."
          right={<InfoTip text="Partner × code combinations at the selected HS level, ranked by signal class, anomaly strength and evidence quality. HS4 is derived from HS6 by code truncation." />}
        />

        <p className="max-w-3xl text-[12px] text-muted">
          <span className="tabular font-medium text-foreground">{fmtNum(channels.length)}</span>{" "}
          {LEVEL_LABELS[level]} combinations
          · <span className="tabular font-medium text-foreground">{fmtNum(stats.investigate)}</span>{" "}
          <span className="cursor-help" title="Investigate class: anomaly ≥ 55 and evidence ≥ 60 — a review priority, not a finding of wrongdoing.">Investigate-class</span>
          · top 5 = <span className="tabular font-medium text-foreground">{fmtPct(stats.top5Share, 0)}</span> of {fmtUSD(Math.abs(stats.dirTotal))}
        </p>

        <QueueTable channels={channels} level={level} onLevelChange={onLevelChange} filter={filter} years={years} />
      </section>
    </div>
  );
}

/* ================================ TAB 2 — reverse =============================== */

/** Neutral, non-accusatory explanations for reverse discrepancies. */
const REVERSE_EXPLANATIONS: { title: string; body: string }[] = [
  { title: "Origin vs consignment", body: "Uzbekistan records imports by country of origin while many partners record exports by last consignment — goods routed via a third country appear as an Uzbek import with no matching export in the origin's books." },
  { title: "Re-export through third countries", body: "The origin country may record its export to the hub rather than to Uzbekistan, leaving the Uzbek import record larger than the partner's directly reported export." },
  { title: "Partner under-reporting or coverage gaps", body: "Sparse reporting, mid-window reporting stops or confidentiality suppression inflate the reverse side without any real flow difference. Missing partner-years are never treated as zero." },
  { title: "Timing differences", body: "Shipments departing late in one year and clearing Uzbek customs in the next fall into different reference periods, producing offsetting discrepancies in adjacent years." },
  { title: "Classification differences", body: "The two administrations may classify the same goods under different HS codes or revisions, moving value between chapters and creating paired positive/reverse discrepancies." },
];

const FLAG_LABELS: Record<string, string> = {
  transit: "transit",
  "residual-hs": "residual HS",
  "reporting-stop": "reporting stop",
  "sparse-reporter": "sparse reporter",
  "missing-weight": "no weight data",
  "freight-sensitive": "freight-sensitive",
};

function FlagChips({ c }: { c: Channel }) {
  return (
    <span className="inline-flex max-w-[180px] flex-wrap gap-1">
      {c.flags.length === 0 && <span className="text-faint">—</span>}
      {c.flags.map((f) =>
        f === "transit" ? (
          <TransitTag key={f} />
        ) : (
          <span
            key={f}
            className="cursor-help whitespace-nowrap rounded border border-[var(--color-border)] px-1.5 py-px text-[10.5px] font-medium leading-4 text-muted"
            title={`Quality flag: ${FLAG_LABELS[f] ?? f}`}
          >
            {FLAG_LABELS[f] ?? f}
          </span>
        ),
      )}
    </span>
  );
}

function ReverseTab({
  rev, revFull, revFilter, ranked, level, onLevelChange,
}: {
  rev: Aggregate; revFull: Aggregate; revFilter: Filter; ranked: Channel[];
  level: HsLevel; onLevelChange: (l: HsLevel) => void;
}) {
  const { t } = useI18n();
  const robustCount = useMemo(() => ranked.filter((c) => c.robustness === "robust").length, [ranked]);
  const topPartner = rev.partners[0] ?? null;
  const top15 = ranked.slice(0, 15);

  const trendOption = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: { ...baseTooltip(), trigger: "axis", valueFormatter: (v) => fmtUSDFull(Number(v ?? 0)) },
    legend: quietLegend,
    xAxis: cat(revFull.annual.map((a) => a.year)),
    yAxis: moneyAxis(),
    series: [
      {
        name: "Reverse (UZB > partner)",
        type: "bar",
        data: revFull.annual.map((a) => Math.round(a.reverse)),
        ...BAR_SPEC,
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.reverse },
      },
      {
        name: "Positive, for contrast",
        type: "line",
        data: revFull.annual.map((a) => Math.round(a.positive)),
        showSymbol: true,
        ...LINE_SPEC,
        lineStyle: { ...LINE_SPEC.lineStyle, color: COLORS.positive },
        itemStyle: { ...LINE_SPEC.itemStyle, color: COLORS.positive },
      },
    ],
  }), [revFull.annual]);

  return (
    <div className="space-y-6">
      <ContextLine filter={revFilter} />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat
          label={t("kpi.reverse")}
          value={fmtUSD(rev.kpis.reverse)}
          sub={t("kpi.reverse.sub")}
          accent={COLORS.reverse}
          info="Σ max(UZB imports − expected CIF, 0) across comparable channel-years under the current filters. Shown separately — never netted against positive discrepancies."
        />
        <Stat
          label="Robust reverse channels"
          value={fmtNum(robustCount)}
          sub={`${LEVEL_LABELS[level]} · sign holds at 6–15% freight`}
          info={`Count of ${LEVEL_LABELS[level]} combinations with a reverse discrepancy whose sign holds across the whole 6% / 10% / 15% freight band, with ≥2 comparable years and no major coverage flags.`}
        />
        <Stat
          label="Top partner by reverse"
          value={topPartner ? topPartner.name : "None"}
          sub={topPartner ? `${fmtUSD(topPartner.revT)} in period` : "no comparable observations"}
          info="Partner with the largest total reverse discrepancy (Σ max(UZB imports − expected CIF, 0)) under the current filters."
        />
      </section>

      <section>
        <SectionTitle
          title="Reverse discrepancy over time"
          desc="Blue: reverse · orange: positive, contrast only."
          right={<InfoTip text={`Full ${meta.window.start}–${meta.window.end} window under the current filters. A reverse discrepancy (UZB records > expected CIF) is a statistical asymmetry between two record-keeping systems, never netted against positive discrepancies and never read as over-reporting by either side. Source: UN Comtrade.`} />}
        />
        {revFull.annual.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card p-3" style={{ height: 320 }}>
            <EChart option={trendOption} />
          </div>
        )}
      </section>

      <section>
        <SectionTitle
          title={`Largest reverse channels (${LEVEL_LABELS[level]})`}
          desc="Ranked by total reverse discrepancy."
          right={
            <span className="flex items-center gap-2" title="Evidence quality and flags show how comparable the underlying records are before any interpretation is attempted.">
              <LevelToggle level={level} onChange={onLevelChange} />
            </span>
          }
        />
        {top15.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={TH}>{LEVEL_LABELS[level]} code</th>
                  <th className={TH_NUM} title="Uzbekistan-recorded imports, CIF.">UZB imports</th>
                  <th className={TH_NUM} title={`Partner exports × (1 + ${Math.round(revFilter.cif * 100)}% freight) — the expected CIF import value.`}>Expected CIF</th>
                  <th className={TH_NUM} title="Σ max(UZB imports − expected CIF, 0) over comparable years."><HeadDot color={COLORS.reverse} />Reverse value</th>
                  <th className={TH}>{t("common.evidence")}</th>
                  <th className={TH_NUM} title="Years with a reverse discrepancy above the ±$100K noise floor, out of comparable years in the selected period.">Rev / comp. yrs</th>
                  <th className={TH}>{t("common.flags")}</th>
                </tr>
              </thead>
              <tbody className="zebra">
                {top15.map((c) => (
                  <tr key={`${c.partnerIso}-${c.cmd}`} className="border-b border-[var(--color-border-soft)]">
                    <td className={`${TD} whitespace-nowrap`}>
                      <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="font-medium hover:underline">{c.partner}</Link>
                    </td>
                    <td className={`${TD} max-w-[300px]`}>
                      <span className="tabular mr-1.5 text-xs text-faint">{c.cmd}</span>
                      <span title={c.cmdLabel}>{c.cmdLabel.length > 46 ? `${c.cmdLabel.slice(0, 46)}…` : c.cmdLabel}</span>
                    </td>
                    <td className={TD_NUM} title={fmtUSDFull(c.uiT)}>{fmtUSD(c.uiT)}</td>
                    <td className={TD_NUM} title={fmtUSDFull(c.expectedT)}>{fmtUSD(c.expectedT)}</td>
                    <td className={`${TD_NUM} font-semibold`} title={fmtUSDFull(c.revT)}>{fmtUSD(c.revT)}</td>
                    <td className={TD}><EvidenceBadge score={c.evidence} /></td>
                    <td className={TD_NUM}>{c.revYears}/{c.comparableYears} yr</td>
                    <td className={TD}><FlagChips c={c} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ranked.length > 15 && (
          <p className="mt-2 text-xs text-faint">
            Showing the 15 largest of {fmtNum(ranked.length)} reverse channels — the CSV export contains all of them. {t("common.source")}.
          </p>
        )}
      </section>

      <section className="card p-4">
        <SectionTitle
          title="How to read a reverse discrepancy"
          desc="Rule these out first." right={<InfoTip text="Several typically act at once; open trade data alone cannot separate their contributions." />}
        />
        <ul className="max-w-3xl space-y-1.5 text-[13px] leading-relaxed text-muted">
          {REVERSE_EXPLANATIONS.map((e) => (
            <li key={e.title}>
              <span className="font-medium text-foreground">{e.title}.</span> {e.body}
            </li>
          ))}
        </ul>
        <p className="mt-3 max-w-3xl text-xs text-faint">
          The site never automatically concludes that Uzbekistan over-reports imports, or that any partner
          under-reports exports. A persistent reverse discrepancy — even a robust one — remains a screening
          signal; confirmation requires declarations, audit or administrative review (evidence level 5),
          which open data cannot provide.
        </p>
      </section>
    </div>
  );
}

/* ============================= TAB 3 — statistical profile ============================= */

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
const HIST_LABELS = [...HIST_POS_LABELS.map((l) => `− ${l}`).reverse(), "± < $100K", ...HIST_POS_LABELS];

const ROB_ORDER: { key: Robustness; color: string }[] = [
  { key: "robust", color: COLORS.good },
  { key: "freight-sensitive", color: COLORS.warn },
  { key: "coverage-sensitive", color: COLORS.axis },
  { key: "insufficient", color: COLORS.grid },
];

function ProfileTab({
  base, seriesAgg, filter, level, onLevelChange,
}: {
  base: Channel[]; seriesAgg: Aggregate; filter: Filter;
  level: HsLevel; onLevelChange: (l: HsLevel) => void;
}) {
  const { t } = useI18n();
  const n = base.length;

  /* ---- (a) distribution of signedT ---- */
  const dist = useMemo(() => {
    if (n === 0) return null;
    const vals = base.map((c) => c.signedT).sort((a, b) => a - b);
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
    const center = HIST_POS_LABELS.length; // index of the ± < $100K bucket
    for (const c of base) {
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
          const side = p.dataIndex < center ? "Reverse (UZB > partner)" : p.dataIndex === center ? "Within the ±$100K noise band" : "Positive (partner > UZB)";
          return `${HIST_LABELS[p.dataIndex]}<br/>${side}<br/>${fmtNum(p.value)} channels`;
        },
      },
      xAxis: { ...cat(HIST_LABELS), axisLabel: { color: COLORS.axis, rotate: 35, fontSize: 10, interval: 0 } },
      yAxis: countAxis("channels"),
      series: [{
        name: "Channels",
        type: "bar",
        data: counts.map((v, i) => ({
          value: v,
          itemStyle: {
            // one axis, diverging: orange positive / blue reverse / neutral noise band
            color: i < center ? COLORS.reverse : i === center ? COLORS.neutralMid : COLORS.positive,
            borderRadius: [4, 4, 0, 0] as [number, number, number, number],
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
        })),
        barMaxWidth: 24,
      }],
    };
  }, [base]);

  /* ---- (b) thresholds (positive direction) ---- */
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
  // "Share of positive total" column of the table above (no dual-axis charts)
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
        return `${r.label}<br/>${fmtNum(r.count)} channels · ${fmtUSDFull(r.value)}<br/>${fmtPct(r.share)} of the positive total`;
      },
    },
    xAxis: cat(thres.rows.map((r) => r.label)),
    yAxis: countAxis("channels"),
    series: [
      {
        name: "Channels above threshold",
        type: "bar",
        data: thres.rows.map((r) => r.count),
        ...BAR_SPEC,
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.positive },
      },
    ],
  }), [thres]);

  /* ---- (c) concentration (positive direction) ---- */
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
        return `${c.partner} · ${c.cmdLabel}<br/>HS ${c.cmd}<br/>Positive discrepancy: ${fmtUSDFull(c.posT)}<br/>Cumulative share: ${fmtPct(conc.cumShares[i])}`;
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
        name: "Positive discrepancy",
        type: "bar",
        data: conc.pareto.map((c) => Math.round(c.posT)),
        ...BAR_SPEC,
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.positive },
      },
    ],
  }), [conc]);

  /* ---- (d) robustness split ---- */
  const rob = useMemo(() => {
    const by: Record<Robustness, number> = { robust: 0, "freight-sensitive": 0, "coverage-sensitive": 0, insufficient: 0 };
    for (const c of base) by[c.robustness]++;
    return { by, persistent: base.filter((c) => c.longestPosStreak >= 3).length };
  }, [base]);

  /* ---- (e) persistent channels (full window, active level) ---- */
  const persistent = useMemo(
    () =>
      levelBase(seriesAgg, level)
        .filter((c) => c.comparableYears >= 3)
        .sort(
          (a, b) =>
            b.longestPosStreak - a.longestPosStreak ||
            b.posYears / b.comparableYears - a.posYears / a.comparableYears ||
            b.posT - a.posT,
        )
        .slice(0, 10),
    [seriesAgg, level],
  );

  if (n === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted">Statistical profile of the base channel set.</p>
          <LevelToggle level={level} onChange={onLevelChange} />
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
          Computed over the <strong className="text-foreground">base</strong> channel set at the selected
          HS level — the evidence-stage, signal-class and materiality filters are intentionally not applied,
          so counts and denominators stay stable. Period, direction, partner view, freight and HS/category
          filters do apply. A channel is one partner × {LEVEL_LABELS[level]} pair observed in the selected period.
        </p>
        <LevelToggle level={level} onChange={onLevelChange} />
      </div>

      {/* (a) distribution */}
      <section className="space-y-3">
        <SectionTitle
          title="Distribution of the signed discrepancy"
          desc={`Signed discrepancy per channel = expected CIF (partner exports × 1 + ${Math.round(filter.cif * 100)}% freight) − UZB-recorded imports, summed over the selected period. Heavy-tailed: read the mean together with the median.`}
        />
        {dist && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Mean (signed)"
              value={fmtUSD(dist.mean)}
              sub={`median ${fmtUSD(dist.median)}`}
              info={`Arithmetic mean: Σ signedT / N over all N = ${fmtNum(n)} base channels. Heavily influenced by the tails — read it together with the median (50th percentile) shown beneath.`}
            />
            <Stat
              label="Std. deviation"
              value={fmtUSD(dist.sd)}
              sub="sample SD"
              info={`Sample standard deviation: √( Σ(x − mean)² / (N − 1) ) over N = ${fmtNum(n)} channels.`}
            />
            <Stat
              label="P95"
              value={fmtUSD(dist.p95)}
              sub="upper tail"
              info={`95th percentile of the signed channel discrepancy (linear interpolation, N = ${fmtNum(n)}). The upper tail carries most of the positive total.`}
            />
            <Stat
              label="P99"
              value={fmtUSD(dist.p99)}
              sub="extreme tail"
              info={`99th percentile of the signed channel discrepancy (linear interpolation, N = ${fmtNum(n)}).`}
            />
          </div>
        )}
        <div className="card p-3" style={{ height: 300 }}>
          <EChart option={histOption} />
        </div>
        <p className="max-w-3xl text-xs text-faint">
          Channels binned on a symmetric log10 scale. Blue (left) = reverse (UZB &gt; partner); orange
          (right) = positive (partner &gt; UZB); neutral centre = within the ±$100K noise band. {t("common.source")}.
        </p>
      </section>

      {/* (b) thresholds */}
      <section className="space-y-3">
        <SectionTitle
          title="Materiality thresholds"
          desc="Channels surviving each materiality floor." right={<InfoTip text="Positive direction only — reverse discrepancies are screened separately and never netted against these figures." />}
        />
        <div className="card overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="border-b border-[var(--color-border)]">
              <tr>
                <th className={TH}>
                  Threshold <InfoTip text="Materiality floor applied to the channel's total positive discrepancy, Σ max(signed, 0) over the selected period." />
                </th>
                <th className={TH_NUM}>Channels</th>
                <th className={TH_NUM}><HeadDot color={COLORS.positive} />Σ positive</th>
                <th className={TH_NUM}>
                  Share of positive total <InfoTip text={`Σ positive discrepancy of channels at or above the threshold ÷ ${fmtUSD(thres.posTotal)} (the positive total over all ${fmtNum(n)} base channels).`} />
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
          title="Concentration"
          desc="A few large channels carry most of the total." right={<InfoTip text="Concentration is not, by itself, evidence of misreporting." />}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="Top 1 / Top 5 share"
            value={`${fmtPct(conc.top1, 0)} / ${fmtPct(conc.top5, 0)}`}
            sub="of the positive total"
            info={`Σ positive of the largest 1 and 5 channels ÷ the positive total (${fmtUSD(conc.total)}). Denominator: ${fmtNum(conc.n)} channels with positive discrepancy > 0.`}
          />
          <Stat
            label="Top 10 / Top 20 share"
            value={`${fmtPct(conc.top10, 0)} / ${fmtPct(conc.top20, 0)}`}
            sub="of the positive total"
            info={`Σ positive of the largest 10 and 20 channels ÷ the positive total. Denominator: ${fmtNum(conc.n)} positive channels.`}
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
        </div>
        <div className="card p-3" style={{ height: 320 }}>
          <EChart option={paretoOption} />
        </div>
        <p className="max-w-3xl text-xs text-faint">
          Pareto: top {conc.pareto.length} of {fmtNum(conc.n)} positive channels (partner ISO3 + code on the
          axis; hover for full names). Orange bars: channel positive discrepancy; the cumulative share of the
          positive total is shown in the tooltip. {t("common.source")}.
        </p>
      </section>

      {/* (d) robustness split */}
      <section className="space-y-3">
        <SectionTitle
          title="Robustness split"
          desc="Base channels by scenario robustness." right={<InfoTip text="Sensitive channels are not discarded — they are screened at the comparable stage with lower evidence scores." />}
        />
        <div className="card p-4">
          <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-panel)]">
            {ROB_ORDER.map(({ key, color }) =>
              rob.by[key] > 0 ? (
                <div
                  key={key}
                  style={{ width: `${(rob.by[key] / n) * 100}%`, background: color }}
                  title={`${ROBUSTNESS_LABELS[key]}: ${fmtNum(rob.by[key])} channels (${fmtPct(rob.by[key] / n, 0)} of ${fmtNum(n)})`}
                />
              ) : null,
            )}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-muted">
            {ROB_ORDER.map(({ key, color }) => (
              <span key={key} className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px text-[10.5px] font-medium leading-4 text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                {ROBUSTNESS_LABELS[key]} <span className="tabular text-faint">{fmtNum(rob.by[key])} · {fmtPct(n > 0 ? rob.by[key] / n : 0, 0)}</span>
              </span>
            ))}
            <InfoTip text="Robust: the discrepancy sign holds across the whole 6% / 10% / 15% freight band, with ≥2 comparable years and no coverage flags. Freight-sensitive: the sign flips within the band. Coverage-sensitive: sparse or lapsed reporter. Insufficient: fewer than 2 comparable years in the full window." />
          </div>
          <p className="mt-2.5 text-[12px] text-muted">
            Persistent 3+ years:{" "}
            <span className="tabular font-medium text-foreground">{fmtPct(n > 0 ? rob.persistent / n : 0, 0)}</span>{" "}
            <span className="text-faint">({fmtNum(rob.persistent)} of {fmtNum(n)} channels)</span>{" "}
            <InfoTip text={`Share of base channels with a positive-discrepancy streak of at least 3 consecutive years within the selected period (longestPosStreak ≥ 3). Denominator: all ${fmtNum(n)} base channels. Persistence strengthens a screening signal but is still not proof of intent.`} />
          </p>
        </div>
      </section>

      {/* (e) persistent channels */}
      <section className="space-y-3">
        <SectionTitle
          title="Persistent channels"
          desc={`${LEVEL_LABELS[level]} channels with at least 3 comparable years over the full ${meta.window.start}–${meta.window.end} window, ranked by the longest consecutive run of positive-discrepancy years. Persistence makes a one-off artifact less likely — it is not proof of intentional misreporting.`}
        />
        {persistent.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-[var(--color-border)]">
                <tr>
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={TH}>{LEVEL_LABELS[level]} code</th>
                  <th className={TH_NUM} title="Longest consecutive run of years with a positive discrepancy (partner > UZB records) in the full window.">Streak</th>
                  <th className={TH_NUM} title="Years with a positive discrepancy out of comparable years in the full window.">Pos / comp. yrs</th>
                  <th className={TH_NUM} title="Positive discrepancy accumulated over the full window — never netted against reverse years."><HeadDot color={COLORS.positive} />Positive total</th>
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
                    <td className={TD_NUM} title={`Longest consecutive positive streak: ${c.longestPosStreak} year${c.longestPosStreak === 1 ? "" : "s"}.`}>
                      {c.longestPosStreak} yr
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
          Top 10 by streak. Comparable years count only years where both sides reported — missing
          partner-years are excluded, never treated as zero. {t("common.source")}.
        </p>
      </section>
    </div>
  );
}
