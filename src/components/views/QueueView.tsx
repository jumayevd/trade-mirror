"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption, TooltipComponentOption, YAXisComponentOption } from "echarts";
import EChart from "@/components/EChart";
import QueueTable, { FLAG_INFO, LEVEL_LABELS, type HsLevel } from "@/components/QueueTable";
import RiskMatrix from "@/components/charts/RiskMatrix";
import { EmptyState } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { useI18n } from "@/lib/i18n";
import { Cite } from "@/lib/references";
import { COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import {
  aggregate, meta, ROBUSTNESS_LABELS,
  type Aggregate, type Channel, type Filter, type Robustness,
} from "@/lib/dataset";
import { BAR_SPEC, LINE_SPEC, baseGrid, catAxis } from "@/lib/echartBase";

/**
 * Discrepancy & Risk (Modernist redesign, README §4) — the queue at full
 * width. Three square-segmented tabs share one HS-level state; charts inherit
 * the two-colour palette (positive accent, reverse ink-22%). Every number is
 * a statistical screening signal — never a finding of wrongdoing.
 */

type TabKey = "ranked" | "reverse" | "profile";
const TABS: { key: TabKey; label: string; tip: string }[] = [
  { key: "ranked", label: "Ranked components", tip: "The ranked queue of all partner × code combinations under the current filters." },
  { key: "reverse", label: "Reverse focus", tip: "Reverse discrepancies (UZB records > partner) analysed separately — never netted against positive ones." },
  { key: "profile", label: "Statistical profile", tip: "Distribution, thresholds, concentration and robustness of the discrepancy across base channels." },
];

/* ---------------- shared chrome ---------------- */

const TH = "py-2 pr-2.5 text-left align-bottom text-[10px] font-semibold uppercase tracking-[.1em] text-faint whitespace-nowrap";
const THN = `${TH} text-right`;
const TD = "py-[7px] pr-2.5 align-middle text-[13px]";
const TDN = `${TD} tabular text-right whitespace-nowrap`;
const HEAD_ROW = "border-b-2 border-[rgba(32,30,29,.4)]";
const BODY_ROW = "border-b border-[rgba(32,30,29,.18)]";

/** Mono § method-reference chip. */
function Ref({ s }: { s: string }) {
  return (
    <Link
      href="/methodology"
      className="tabular whitespace-nowrap bg-[rgba(32,30,29,.08)] px-1.5 py-px text-[10.5px] text-[rgba(32,30,29,.7)] hover:text-foreground"
      title={`Methodology ${s}`}
    >
      {s}
    </Link>
  );
}

/** Stat strip framed by 2px rules top and bottom. */
function Strip({ cells, colsClass = "grid-cols-2 lg:grid-cols-4" }: {
  cells: { value: string; label: string; color?: string }[]; colsClass?: string;
}) {
  return (
    <div className={`grid ${colsClass} border-y-2 border-[rgba(32,30,29,.4)]`}>
      {cells.map((s, i) => (
        <div key={s.label} className={`py-3 pr-3.5 ${i > 0 ? "pl-3.5" : ""} ${i < cells.length - 1 ? "border-r border-[rgba(32,30,29,.2)]" : ""}`}>
          <div className="tabular text-[22px] font-semibold leading-none" style={s.color ? { color: s.color } : undefined}>
            {s.value}
          </div>
          <div className="mt-1 text-[11.5px] leading-snug text-[rgba(32,30,29,.62)]">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Square segmented HS-level toggle. */
function LevelToggle({ level, onChange }: { level: HsLevel; onChange: (l: HsLevel) => void }) {
  return (
    <div className="flex self-start border border-[rgba(32,30,29,.4)]" role="group" aria-label="HS level">
      {([2, 4, 6] as const).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          aria-pressed={level === l}
          className={`px-2.5 py-[5px] text-[11.5px] font-extrabold whitespace-nowrap ${
            level === l ? "bg-[#201e1d] text-[#f3f2f2]" : "text-muted hover:text-foreground"
          }`}
        >
          {LEVEL_LABELS[l]}
        </button>
      ))}
    </div>
  );
}

/* ---------------- quiet chart helpers (two-colour palette, square tooltip) ---------------- */

const sqTooltip = (): TooltipComponentOption => ({
  backgroundColor: "#f3f2f2",
  borderColor: "#201e1d",
  borderWidth: 1,
  textStyle: { color: "#201e1d", fontSize: 12 },
  padding: [8, 12],
  extraCssText: "border-radius:0;box-shadow:none",
});

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
const quietLegend = {
  top: 0, right: 0, icon: "rect", itemWidth: 12, itemHeight: 8,
  textStyle: { color: "#201e1d", fontSize: 10.5 },
} as const;
const SQUARE_BAR = { ...BAR_SPEC, itemStyle: { borderRadius: [0, 0, 0, 0] as [number, number, number, number] } };

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

  return (
    <div className="space-y-5">
      {/* header */}
      <section>
        <h1 className="text-[20px] font-extrabold tracking-tight">{t("nav.queue")}</h1>
        <p className="mt-1 max-w-[44rem] text-[13px] leading-[1.55] text-[rgba(32,30,29,.68)]">
          The ranked queue — every row is a partner × code channel with the components behind its
          ranking (<Ref s="§4" /> anomaly, <Ref s="§5" /> evidence, <Ref s="§6" /> class); click a row
          for the per-year record and the alternative explanations to rule out.
        </p>
      </section>

      {/* square segmented tabs */}
      <div className="no-print flex w-fit self-start border border-[rgba(32,30,29,.4)]" role="tablist" aria-label="Analysis tabs">
        {TABS.map((tb) => (
          <button
            key={tb.key}
            role="tab"
            aria-selected={tab === tb.key}
            onClick={() => setTab(tb.key)}
            title={tb.tip}
            className={`px-3 py-[6px] text-[11.5px] font-extrabold whitespace-nowrap ${
              tab === tb.key ? "bg-[#201e1d] text-[#f3f2f2]" : "text-muted hover:text-foreground"
            }`}
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
  return (
    <div className="space-y-5">
      <section className="rule-2 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Analytical significance</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] text-[rgba(32,30,29,.62)]">
          Every {LEVEL_LABELS[level]} combination positioned by evidence quality (x, <Ref s="§5" />) and
          anomaly strength (y, <Ref s="§4" />); bubble area ∝ discrepancy in the active direction, quadrant
          guides mirror the classification thresholds (E 60, A 55).
        </p>
        <div className="mt-3">
          <RiskMatrix channels={channels} filter={filter} />
        </div>
      </section>

      <section className="rule-2 pt-3">
        <QueueTable channels={channels} level={level} onLevelChange={onLevelChange} filter={filter} years={years} />
      </section>

      <p className="max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
        Anomaly and evidence are scored independently (<Ref s="§4" />, <Ref s="§5" />): a strong anomaly
        on weak data is labelled “verify data first”, never escalated. Screening ranks blend both
        components <Cite ids={["imf2023", "kellenberg2019"]} /> — see{" "}
        <Link href="/methodology" className="underline hover:text-foreground">Methodology</Link>.
      </p>
    </div>
  );
}

/* ================================ TAB 2 — reverse =============================== */

/** Neutral, non-accusatory explanations for reverse discrepancies (compressed). */
const REVERSE_EXPLANATIONS: { title: string; body: string }[] = [
  { title: "Origin vs consignment", body: "goods routed via a third country appear as an Uzbek import with no matching export in the origin's books." },
  { title: "Re-export through third countries", body: "the origin may record its export to the hub rather than to Uzbekistan." },
  { title: "Partner under-reporting or coverage gaps", body: "sparse reporting or mid-window stops inflate the reverse side; missing partner-years are never treated as zero." },
  { title: "Timing differences", body: "shipments crossing year-ends fall into different reference periods, producing offsetting discrepancies." },
  { title: "Classification differences", body: "the same goods classified under different HS codes move value between chapters, creating paired discrepancies." },
];

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
    tooltip: { ...sqTooltip(), trigger: "axis", valueFormatter: (v) => fmtUSDFull(Number(v ?? 0)) },
    legend: quietLegend,
    xAxis: cat(revFull.annual.map((a) => a.year)),
    yAxis: moneyAxis(),
    series: [
      {
        name: "Reverse (UZB > partner)",
        type: "bar",
        data: revFull.annual.map((a) => Math.round(a.reverse)),
        ...SQUARE_BAR,
        barMaxWidth: 34,
        itemStyle: { ...SQUARE_BAR.itemStyle, color: COLORS.reverse },
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
    <div className="space-y-5">
      <p className="max-w-[44rem] text-[13px] leading-[1.55] text-[rgba(32,30,29,.68)]">
        A reverse discrepancy means Uzbekistan&apos;s import record exceeds the partner&apos;s expected
        export <Ref s="§2.1" /> — analysed separately, never netted;{" "}
        <strong className="text-foreground">this site never automatically concludes that Uzbekistan
        over-reports imports</strong>.
      </p>

      <Strip
        colsClass="grid-cols-1 sm:grid-cols-3"
        cells={[
          { value: fmtUSD(rev.kpis.reverse), label: `${t("kpi.reverse")} · ${t("kpi.reverse.sub")} (§2.1)` },
          { value: fmtNum(robustCount), label: `robust reverse channels (${LEVEL_LABELS[level]}) · sign holds at 6–15% freight` },
          { value: topPartner ? topPartner.name : "None", label: topPartner ? `top partner by reverse · ${fmtUSD(topPartner.revT)} in period` : "no comparable observations" },
        ]}
      />

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-extrabold tracking-tight">Reverse discrepancy over time</h2>
          <span className="tabular text-[10.5px] text-[rgba(32,30,29,.5)]">
            full {meta.window.start}–{meta.window.end} window · never netted · {t("common.source")}
          </span>
        </div>
        {revFull.annual.length === 0 ? (
          <div className="mt-3"><EmptyState /></div>
        ) : (
          <div className="mt-2" style={{ height: 300 }}>
            <EChart option={trendOption} />
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-extrabold tracking-tight">Largest reverse channels</h2>
          <LevelToggle level={level} onChange={onLevelChange} />
        </div>
        {top15.length === 0 ? (
          <div className="mt-3"><EmptyState /></div>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={TH}>Code · label</th>
                  <th className={THN} title="Uzbekistan-recorded imports, CIF.">UZB imports</th>
                  <th className={THN} title={`Partner exports × (1 + ${Math.round(revFilter.cif * 100)}% freight) — the expected CIF import value (§2.1).`}>Expected CIF</th>
                  <th className={THN} title="Σ max(UZB imports − expected CIF, 0) over comparable years (§2.1).">Reverse value</th>
                  <th className={THN} title="Evidence quality 0–100 (§5).">E</th>
                  <th className={THN} title="Years with a reverse discrepancy above the ±$100K noise floor, out of comparable years.">Rev / comp. yrs</th>
                  <th className={TH}>{t("common.flags")}</th>
                </tr>
              </thead>
              <tbody>
                {top15.map((c) => (
                  <tr key={`${c.partnerIso}-${c.cmd}`} className={BODY_ROW}>
                    <td className={`${TD} whitespace-nowrap font-extrabold`}>
                      <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="hover:underline">{c.partner}</Link>
                    </td>
                    <td className={`${TD} max-w-[300px]`}>
                      <span className="tabular mr-1.5 text-[11px] text-[rgba(32,30,29,.5)]">{c.cmd}</span>
                      <span className="text-[rgba(32,30,29,.75)]" title={c.cmdLabel}>
                        {c.cmdLabel.length > 46 ? `${c.cmdLabel.slice(0, 46)}…` : c.cmdLabel}
                      </span>
                    </td>
                    <td className={TDN} title={fmtUSDFull(c.uiT)}>{fmtUSD(c.uiT)}</td>
                    <td className={TDN} title={fmtUSDFull(c.expectedT)}>{fmtUSD(c.expectedT)}</td>
                    <td className={`${TDN} font-semibold`} title={fmtUSDFull(c.revT)}>{fmtUSD(c.revT)}</td>
                    <td className={`${TDN} text-[rgba(32,30,29,.7)]`}>{c.evidence.toFixed(0)}</td>
                    <td className={TDN}>{c.revYears}/{c.comparableYears} yr</td>
                    <td className={`${TD} max-w-[200px] text-[11px] text-[rgba(32,30,29,.6)]`} title={c.flags.map((f) => FLAG_INFO[f]?.hint ?? f).join("\n")}>
                      {c.flags.length === 0 ? <span className="text-faint">—</span> : c.flags.map((f) => FLAG_INFO[f]?.chip ?? f).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ranked.length > 15 && (
          <p className="mt-2 text-[11.5px] text-[rgba(32,30,29,.55)]">
            Showing the 15 largest of {fmtNum(ranked.length)} reverse channels. {t("common.source")}.
          </p>
        )}
      </section>

      <section className="rule-1 pt-3">
        <div className="lbl">How to read a reverse discrepancy — rule these out first</div>
        <ul className="mt-2 flex max-w-[44rem] flex-col gap-1.5 text-[12.5px] leading-normal text-[rgba(32,30,29,.7)]">
          {REVERSE_EXPLANATIONS.map((e) => (
            <li key={e.title} className="flex gap-2">
              <span className="font-extrabold text-[#ec3013]" aria-hidden>!</span>
              <span><span className="font-extrabold text-foreground">{e.title}</span> — {e.body}</span>
            </li>
          ))}
        </ul>
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
  { key: "robust", color: "#201e1d" },
  { key: "freight-sensitive", color: "#605d5d" },
  { key: "coverage-sensitive", color: "rgba(32,30,29,.35)" },
  { key: "insufficient", color: "rgba(32,30,29,.14)" },
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
        ...sqTooltip(),
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
            // one accent, diverging by tone: accent positive / ink-22% reverse / faint noise band
            color: i < center ? COLORS.reverse : i === center ? COLORS.grid : COLORS.positive,
            borderRadius: [0, 0, 0, 0] as [number, number, number, number],
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

  const thresOption = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    grid: baseGrid,
    tooltip: {
      ...sqTooltip(),
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
        ...SQUARE_BAR,
        itemStyle: { ...SQUARE_BAR.itemStyle, color: COLORS.positive },
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
      ...sqTooltip(),
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
      axisLabel: { color: COLORS.axis, rotate: 45, fontSize: 10, fontFamily: "ui-monospace, Menlo, monospace", interval: 0 },
    },
    yAxis: moneyAxis(),
    series: [
      {
        name: "Positive discrepancy",
        type: "bar",
        data: conc.pareto.map((c) => Math.round(c.posT)),
        ...SQUARE_BAR,
        itemStyle: { ...SQUARE_BAR.itemStyle, color: COLORS.positive },
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-[rgba(32,30,29,.68)]">Statistical profile of the base channel set.</p>
          <LevelToggle level={level} onChange={onLevelChange} />
        </div>
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[44rem] text-[13px] leading-[1.55] text-[rgba(32,30,29,.68)]">
          Computed over the <strong className="text-foreground">base</strong> channel set at the
          selected HS level — stage, signal-class and materiality filters are intentionally not
          applied, so counts and denominators stay stable <Ref s="§2.2" />.
        </p>
        <LevelToggle level={level} onChange={onLevelChange} />
      </div>

      {/* (a) distribution */}
      <section>
        <h2 className="text-[16px] font-extrabold tracking-tight">Distribution of the signed discrepancy</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] text-[rgba(32,30,29,.62)]">
          Signed discrepancy per channel <Ref s="§2.1" /> at the {Math.round(filter.cif * 100)}% freight
          assumption — heavy-tailed, so read the mean together with the median.
        </p>
        {dist && (
          <div className="mt-3">
            <Strip
              cells={[
                { value: fmtUSD(dist.mean), label: `mean (signed) · median ${fmtUSD(dist.median)}` },
                { value: fmtUSD(dist.sd), label: "sample standard deviation" },
                { value: fmtUSD(dist.p95), label: "P95 · upper tail" },
                { value: fmtUSD(dist.p99), label: "P99 · extreme tail" },
              ]}
            />
          </div>
        )}
        <div className="mt-3" style={{ height: 280 }}>
          <EChart option={histOption} />
        </div>
        <p className="max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
          Symmetric log10 bins: accent right = positive (partner &gt; UZB), grey left = reverse, faint
          centre = within the ±$100K noise band. {t("common.source")}.
        </p>
      </section>

      {/* (b) thresholds */}
      <section className="rule-1 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Materiality thresholds</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] text-[rgba(32,30,29,.62)]">
          Channels surviving a materiality floor on the positive direction, and the share of the
          positive total they carry — reverse is screened separately, never netted.
        </p>
        <div className="mt-3 max-w-[640px] overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className={HEAD_ROW}>
                <th className={TH}>Threshold</th>
                <th className={THN}>Channels</th>
                <th className={THN}>Σ positive</th>
                <th className={THN} title={`Σ positive at or above the threshold ÷ ${fmtUSD(thres.posTotal)} (the positive total over all ${fmtNum(n)} base channels).`}>Share of total</th>
              </tr>
            </thead>
            <tbody>
              {thres.rows.map((r) => (
                <tr key={r.label} className={BODY_ROW}>
                  <td className={`${TD} tabular font-semibold`}>{r.label}</td>
                  <td className={TDN}>{fmtNum(r.count)}</td>
                  <td className={TDN}>{fmtUSD(r.value)}</td>
                  <td className={TDN}>{fmtPct(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3" style={{ height: 260 }}>
          <EChart option={thresOption} />
        </div>
      </section>

      {/* (c) concentration */}
      <section className="rule-1 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Concentration</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] text-[rgba(32,30,29,.62)]">
          A small number of large channels carries most of the positive total — concentration is not,
          by itself, evidence of misreporting.
        </p>
        <div className="mt-3">
          <Strip
            cells={[
              { value: `${fmtPct(conc.top1, 0)} / ${fmtPct(conc.top5, 0)}`, label: "top-1 / top-5 share of the positive total" },
              { value: `${fmtPct(conc.top10, 0)} / ${fmtPct(conc.top20, 0)}`, label: "top-10 / top-20 share" },
              { value: fmtNum(conc.hhi), label: "HHI · 0–10,000 scale" },
              { value: `${fmtNum(conc.n50)} / ${fmtNum(conc.n75)} / ${fmtNum(conc.n90)}`, label: "channels to 50 / 75 / 90% of the total" },
            ]}
          />
        </div>
        <div className="mt-3" style={{ height: 300 }}>
          <EChart option={paretoOption} />
        </div>
        <p className="max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
          Pareto: top {conc.pareto.length} of {fmtNum(conc.n)} positive channels; the cumulative share
          lives in the tooltip. {t("common.source")}.
        </p>
      </section>

      {/* (d) robustness split */}
      <section className="rule-1 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Robustness split</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] text-[rgba(32,30,29,.62)]">
          All base channels by scenario robustness <Ref s="§2.3" /> — sensitive channels are not
          discarded, they screen at the comparable stage with lower evidence scores.
        </p>
        <div className="mt-3 flex h-4 w-full border border-[rgba(32,30,29,.4)]">
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
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-[rgba(32,30,29,.7)]">
          {ROB_ORDER.map(({ key, color }) => (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 border border-[rgba(32,30,29,.35)]" style={{ background: color }} />
              {ROBUSTNESS_LABELS[key]}{" "}
              <span className="tabular text-faint">{fmtNum(rob.by[key])} · {fmtPct(n > 0 ? rob.by[key] / n : 0, 0)}</span>
            </span>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[rgba(32,30,29,.7)]">
          Persistent 3+ years:{" "}
          <span className="tabular font-semibold text-foreground">{fmtPct(n > 0 ? rob.persistent / n : 0, 0)}</span>{" "}
          <span className="text-faint">({fmtNum(rob.persistent)} of {fmtNum(n)} channels — persistence strengthens a signal, never proves intent)</span>
        </p>
      </section>

      {/* (e) persistent channels */}
      <section className="rule-1 pt-3">
        <h2 className="text-[16px] font-extrabold tracking-tight">Persistent channels</h2>
        <p className="mt-0.5 max-w-[44rem] text-[12.5px] text-[rgba(32,30,29,.62)]">
          Top 10 by the longest consecutive run of positive-discrepancy years over the full{" "}
          {meta.window.start}–{meta.window.end} window — persistence makes a one-off artifact less
          likely, not misreporting more proven.
        </p>
        {persistent.length === 0 ? (
          <div className="mt-3"><EmptyState /></div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr className={HEAD_ROW}>
                  <th className={TH}>{t("common.partner")}</th>
                  <th className={TH}>Code · label</th>
                  <th className={THN} title="Longest consecutive run of positive-discrepancy years in the full window.">Streak</th>
                  <th className={THN} title="Years with a positive discrepancy out of comparable years in the full window.">Pos / comp. yrs</th>
                  <th className={THN} title="Positive discrepancy accumulated over the full window — never netted against reverse years.">Positive total</th>
                </tr>
              </thead>
              <tbody>
                {persistent.map((c) => (
                  <tr key={`${c.partnerIso}-${c.cmd}`} className={BODY_ROW}>
                    <td className={`${TD} whitespace-nowrap font-extrabold`}>
                      <Link href={`/partners/${c.partnerIso.toLowerCase()}`} className="hover:underline">{c.partner}</Link>
                      {c.transit && <span className="tabular ml-1.5 text-[10.5px] font-normal text-[rgba(32,30,29,.5)]">transit hub</span>}
                    </td>
                    <td className={`${TD} max-w-[320px]`}>
                      <span className="tabular mr-1.5 text-[11px] text-[rgba(32,30,29,.5)]">{c.cmd}</span>
                      <span className="text-[rgba(32,30,29,.75)]" title={c.cmdLabel}>
                        {c.cmdLabel.length > 52 ? `${c.cmdLabel.slice(0, 52)}…` : c.cmdLabel}
                      </span>
                    </td>
                    <td className={TDN}>{c.longestPosStreak} yr</td>
                    <td className={TDN}>{c.posYears}/{c.comparableYears}</td>
                    <td className={`${TDN} font-semibold`} title={fmtUSDFull(c.posT)}>{fmtUSD(c.posT)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 max-w-[44rem] text-[11.5px] leading-normal text-[rgba(32,30,29,.55)]">
          Comparable years count only years where both sides reported — missing partner-years are
          excluded, never treated as zero. {t("common.source")}.
        </p>
      </section>
    </div>
  );
}
