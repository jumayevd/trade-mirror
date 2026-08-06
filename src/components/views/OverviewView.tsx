"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import FilterBar from "@/components/FilterBar";
import EChart from "@/components/EChart";
import TrendChart from "@/components/charts/TrendChart";
import {
  Stat, SectionTitle, ContextLine, EvidenceLadder, AnomalyBadge, EvidenceBadge,
  ClassBadge, RobustnessBadge, TransitTag, EmptyState, InfoTip,
} from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, DATA_VERSION, METHODOLOGY_VERSION, DIRECTION_LABELS, type PartnerAgg } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";
import { baseGrid, baseTextStyle, baseTooltip } from "@/lib/echartBase";

const CAN = [
  "Identify where partner-reported exports and Uzbekistan's import records diverge, and by how much under stated freight scenarios.",
  "Separate discrepancies with complete, comparable data from cases driven by missing reporting, transit routing or residual codes.",
  "Rank country × HS6 channels by anomaly strength and evidence quality as priorities for further statistical or customs review.",
  "Show whether a discrepancy is persistent across years and robust to the freight assumption.",
];
const CANNOT = [
  "Prove smuggling, fraud, illegal imports or any specific violation — that requires declarations, audit or inspection (evidence level 5).",
  "Measure the size of the shadow economy or precise budget losses.",
  "Attribute a discrepancy to a single cause: valuation, timing, classification, re-export and reporting differences all contribute.",
  "Establish that any named country or company acted improperly.",
];

export default function OverviewView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const k = data.kpis;
  const top = data.channels6.slice(0, 8);
  const flipPct = fmtPct(k.flipShare, 0);

  const exportCsv = () =>
    downloadCsv(`uzb-mirror-overview-hs6-${DATA_VERSION}.csv`, channelsToCsv(data.channels6, filter));

  // largest counterparts over the full window (for the dataset prose)
  const topNames = useMemo(
    () => [...series.partners].sort((a, b) => b.peT - a.peT).slice(0, 4).map((p) => p.name),
    [series],
  );

  return (
    <div className="space-y-8">
      {/* 1. hero: eyebrow · H1 · subtitle · export · disclaimer · ladder */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-faint">
              UN Comtrade · {meta.window.start}–{meta.window.end} · statistical reconciliation &amp; risk screening
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[32px] sm:leading-tight">
              {t("nav.overview")}
            </h1>
            <p className="max-w-3xl text-[15px] leading-relaxed text-muted">{t("ov.question")}</p>
          </div>
          <button
            onClick={exportCsv}
            className="no-print shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[13px] font-medium text-foreground hover:border-[var(--color-primary)]"
            title="All country × HS6 channels under the active filters, with raw and derived fields, data version and filter context."
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted">
          Every trade flow is recorded at least twice — as a partner&apos;s export and as Uzbekistan&apos;s
          import. This platform systematically detects where the two diverge, tests how robust and
          well-evidenced each divergence is, and prioritises channels for further review.
        </p>
        <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-primary)] bg-[var(--color-panel)] px-4 py-2.5 text-sm text-muted">
          <strong className="text-foreground">{t("ov.disclaimer")}</strong>
        </p>
        <div className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">{t("ov.ladder")}</h2>
          <EvidenceLadder compact />
        </div>
      </section>

      {/* 2. filters + calculation context */}
      <FilterBar />
      <ContextLine filter={filter} />

      {/* 3. national snapshot */}
      <section>
        <SectionTitle
          title="National snapshot"
          desc="Headline reconciliation figures for the selected period and filters. All values are residual unexplained discrepancies unless stated otherwise — screening signals, not findings."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label={t("kpi.comparableTrade")} value={fmtUSD(k.comparableTrade)} sub={t("kpi.comparableTrade.sub")}
            info="Partner-reported exports (FOB) in channels where both sides reported for the selected period — the denominator of the analysis." />
          <Stat label={t("kpi.positive")} value={fmtUSD(k.positive.central)}
            sub={`${fmtUSD(k.positive.low)}–${fmtUSD(k.positive.high)} across 6–15% freight`} accent={COLORS.positive}
            info="Σ max(expected CIF − UZB imports, 0) per channel-year. Expected CIF = partner exports × (1 + freight)." />
          <Stat label={t("kpi.reverse")} value={fmtUSD(k.reverse)} sub={t("kpi.reverse.sub")} accent={COLORS.reverse}
            info="Σ max(UZB imports − expected CIF, 0). Shown separately — never netted away against positive discrepancies." />
          <Stat label={t("kpi.absolute")} value={fmtUSD(k.absolute)} sub={t("kpi.absolute.sub")}
            info="Positive + reverse: the total two-sided asymmetry." />
          <Stat label={t("kpi.coverage")} value={fmtPct(k.coveragePct, 0)} sub={t("kpi.coverage.sub")}
            info="Share of partner-years in the selected period where the partner actually reported. Missing partner-years are never treated as zero flows." />
          <Stat label={t("kpi.robust")} value={String(k.robustSignals)} sub={t("kpi.robust.sub")} accent="var(--color-primary)"
            info="HS6 channels classified Investigate (high anomaly + high evidence) whose sign holds across the whole 6–15% freight band." />
        </div>
      </section>

      {/* 4. about the dataset */}
      <section>
        <SectionTitle
          title="About the dataset"
          desc="What the site is computed from: one versioned UN Comtrade snapshot, fully documented. These figures describe the whole dataset and do not change with the filters above."
        />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Source records" value={fmtNum(meta.datasetRows)} sub="raw UN Comtrade rows in the snapshot"
            info="Annual trade records (HS2 + HS6, both reporting sides) pulled from the UN Comtrade API into this snapshot." />
          <Stat label="Window" value={`${meta.window.start}–${meta.window.end}`} sub={`${meta.years.length} years, annual data`}
            info="Analysis window. Comtrade revises past years, so totals can change between data versions." />
          <Stat label="Partners" value={fmtNum(meta.partners.length)} sub="mirror counterparts tracked"
            info="Partner countries whose exports to Uzbekistan are mirrored against Uzbekistan's import records. Turkmenistan does not report to UN Comtrade and cannot be mirrored." />
          <Stat label="HS2 chapters" value={fmtNum(meta.chapters.length)} sub="2-digit sectors"
            info="Harmonized System chapters present in the dataset." />
          <Stat label="HS4 · derived" value={fmtNum(Object.keys(meta.hs4labels).length)} sub="truncated from HS6"
            info="HS4 is not pulled separately — it is derived by truncating HS6 codes, and is always labelled 'HS4 · derived' across the site." />
          <Stat label="HS6 products" value={fmtNum(Object.keys(meta.hs6labels).length)} sub="6-digit codes above materiality floors"
            info="HS6 codes retained after the materiality floors documented on the Data Quality page." />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Source &amp; versioning</h3>
              <InfoTip text="Every figure on the site is computed from this single snapshot; the identifiers appear in the context line and in every CSV export." />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              UN Comtrade annual trade data (HS2 + HS6), data version{" "}
              <span className="tabular font-medium text-foreground">{DATA_VERSION}</span>, methodology{" "}
              <span className="tabular font-medium text-foreground">v{METHODOLOGY_VERSION}</span>. The
              dataset covers {fmtNum(meta.partners.length)} partner countries — the largest counterparts
              are {topNames.length > 0 ? topNames.join(", ") : "not available under the current filters"} —
              across {fmtNum(meta.chapters.length)} HS2 chapters and{" "}
              {fmtNum(Object.keys(meta.hs6labels).length)} HS6 product codes. Turkmenistan does not report
              to UN Comtrade, so no mirror comparison is possible for it.
            </p>
          </div>
          <div className="card p-4">
            <div className="mb-1.5 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold">Orphan flows — excluded, never zero</h3>
              <InfoTip text="An orphan flow is an Uzbekistan-recorded import with no partner-reported mirror. Without a second record there is nothing to reconcile, so it is excluded rather than compared against a fabricated zero." />
            </div>
            <p className="text-sm leading-relaxed text-muted">
              <span className="tabular font-medium text-foreground">{fmtUSD(meta.orphans.importValue)}</span>{" "}
              of Uzbekistan-recorded imports (
              <span className="tabular">{fmtNum(meta.orphans.importCells)}</span> country-chapter-year
              observations) lack a partner mirror — the partner did not report that year or does not report
              at all. These flows are excluded from all discrepancy metrics: treating the missing side as a
              zero export would fabricate a reverse discrepancy. They appear as &quot;{t("common.notReported")}&quot;
              throughout the site and lower the coverage KPI instead.
            </p>
          </div>
        </div>
      </section>

      {/* 5. trade development (full window) */}
      <section>
        <SectionTitle
          title="Trade development"
          desc={`${t("ov.trend")} — full ${meta.window.start}–${meta.window.end} window under the current filters. Amber: positive discrepancy. Blue: reverse. Line: comparable partners per year.`}
        />
        <TrendChart annual={series.annual} />
      </section>

      {/* 6. top counterparts + concentration */}
      <TopCounterparts />

      {/* 7a. uncertainty band */}
      <section className="card p-4">
        <SectionTitle title={t("ov.uncertainty")} desc={t("ov.uncertainty.desc")} />
        <div className="flex flex-wrap items-center gap-6">
          <UncBar low={k.positive.low} central={k.positive.central} high={k.positive.high} />
          <p className="max-w-xs text-xs text-muted">
            {fmtUSD(k.positive.low)} at 6% freight · {fmtUSD(k.positive.central)} at 10% ·{" "}
            {fmtUSD(k.positive.high)} at 15%. <strong className="text-foreground">{flipPct}</strong> of
            comparable channels change sign across this band (freight-sensitive).
          </p>
        </div>
      </section>

      {/* 7b. reconciliation funnel */}
      <section className="card p-4">
        <SectionTitle title={t("ov.funnel")} desc="How observation channels narrow from everything observed to residual unexplained discrepancies." />
        <Funnel
          steps={[
            { label: `${t("ov.ladder.observed")} / ${t("ov.ladder.comparable")}`, count: data.funnel.comparableChannels, value: data.funnel.comparableValue, note: "channels with both sides reported (value = partner exports)" },
            { label: t("stage.residual"), count: data.funnel.residualChannels, value: data.funnel.residualValue, note: "pass transit/residual/coverage/freight flags (value = positive discrepancy)" },
            { label: t("kpi.robust"), count: k.robustSignals, value: null, note: "Investigate class, robust across the freight band (HS6)" },
          ]}
        />
      </section>

      {/* 8. top screening signals */}
      <section>
        <SectionTitle title={t("ov.topSignals")}
          desc="Country × HS6 channels ranked by class, anomaly strength and evidence quality under the current filters."
          right={<Link href="/risk" className="text-sm font-medium text-[var(--color-primary)] hover:underline">{t("nav.queue")} →</Link>} />
        {top.length === 0 ? <EmptyState /> : (
          <div className="card zebra divide-y divide-[var(--color-border-soft)]">
            {top.map((c) => (
              <div key={`${c.partnerIso}-${c.cmd}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <ClassBadge cls={c.cls} />
                <AnomalyBadge score={c.anomaly} />
                <EvidenceBadge score={c.evidence} />
                <Link href={`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {c.partner} · {c.cmdLabel} <span className="tabular text-xs text-faint">HS {c.cmd}</span>
                </Link>
                {c.transit && <TransitTag />}
                <RobustnessBadge r={c.robustness} />
                <span className="tabular w-24 text-right text-sm" style={{ color: c.signedT >= 0 ? COLORS.positive : COLORS.reverse }}>
                  {fmtUSD(c.primary)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 9. what can / cannot be concluded */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold" style={{ color: "var(--color-quality)" }}>{t("ov.can")}</h3>
          <ul className="space-y-2 text-sm text-muted">
            {CAN.map((x, i) => <li key={i} className="flex gap-2"><span style={{ color: "var(--color-quality)" }}>✓</span><span>{x}</span></li>)}
          </ul>
        </div>
        <div className="card p-4">
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-investigate)]">{t("ov.cannot")}</h3>
          <ul className="space-y-2 text-sm text-muted">
            {CANNOT.map((x, i) => <li key={i} className="flex gap-2"><span className="text-[var(--color-investigate)]">✕</span><span>{x}</span></li>)}
          </ul>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Top counterparts: horizontal bar (top-10 partners) + concentration  */
/* ------------------------------------------------------------------ */

type RankMode = "gap" | "trade";

function partnerValue(p: PartnerAgg, mode: RankMode, direction: string): number {
  if (mode === "trade") return p.peT;
  return direction === "reverse" ? p.revT : direction === "absolute" ? p.absT : direction === "net" ? p.signedT : p.posT;
}

function TopCounterparts() {
  const { data, filter } = useFilter();
  const { t } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<RankMode>("gap");
  const k = data.kpis;

  const rows = useMemo(() => {
    return [...data.partners]
      .map((p) => ({ iso3: p.iso3, name: p.name, transit: p.transit, value: partnerValue(p, mode, filter.direction) }))
      .filter((r) => Math.abs(r.value) > 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 10);
  }, [data, mode, filter.direction]);

  const barColor = (v: number) =>
    mode === "trade" ? "#75847b"
      : filter.direction === "reverse" ? COLORS.reverse
        : filter.direction === "net" ? (v >= 0 ? COLORS.positive : COLORS.reverse)
          : COLORS.positive;

  const option = useMemo<EChartsOption>(() => {
    const ordered = [...rows].reverse(); // largest on top with inverse-free layout
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, left: 8, top: 12, bottom: 8 },
      tooltip: {
        ...baseTooltip(),
        formatter: (raw: unknown) => {
          const p = raw as { name?: string; value?: number };
          const metric = mode === "trade" ? "Comparable trade (partner FOB)" : DIRECTION_LABELS[filter.direction];
          return `<b>${p.name ?? ""}</b><br/>${metric}: <b>${fmtUSDFull(p.value ?? 0)}</b><br/><span style="font-size:11px">Click the bar for the country page.</span>`;
        },
      },
      xAxis: {
        type: "value",
        axisLabel: { color: COLORS.axis, formatter: (v: number) => fmtUSD(v) },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: ordered.map((r) => (r.transit ? `${r.name} ⇄` : r.name)),
        axisLabel: { color: COLORS.text, fontSize: 12 },
        axisLine: { lineStyle: { color: COLORS.grid } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          data: ordered.map((r) => ({ value: Math.round(r.value), itemStyle: { color: barColor(r.value), borderRadius: [0, 3, 3, 0] } })),
          barMaxWidth: 18,
          cursor: "pointer",
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, mode, filter.direction]);

  const onEvents = useMemo(() => ({
    click: (params: unknown) => {
      const { dataIndex } = params as { dataIndex: number };
      const ordered = [...rows].reverse();
      const iso = ordered[dataIndex]?.iso3;
      if (iso) router.push(`/partners/${iso.toLowerCase()}`);
    },
  }), [rows, router]);

  const modeBtn = (m: RankMode, label: string, tip: string) => (
    <button key={m} onClick={() => setMode(m)} title={tip}
      className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${mode === m ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-panel-2)] text-muted hover:text-foreground"}`}>
      {label}
    </button>
  );

  return (
    <section>
      <SectionTitle
        title="Top counterparts"
        desc={`Top-10 partner countries under the current filters, ranked ${mode === "trade" ? "by comparable trade (partner-reported exports, FOB)" : `by ${DIRECTION_LABELS[filter.direction].toLowerCase()} discrepancy`}. A large discrepancy is a screening signal, not a finding — click a bar to open the country page. ⇄ marks transit-sensitive partners.`}
        right={
          <div className="flex items-center gap-1">
            {modeBtn("gap", "by discrepancy", "Rank partners by the active direction's residual unexplained discrepancy.")}
            {modeBtn("trade", "by comparable trade", "Rank partners by partner-reported export value where both sides reported.")}
          </div>
        }
      />
      <div className="grid gap-3 lg:grid-cols-[1fr_260px]">
        {rows.length === 0 ? <EmptyState /> : (
          <div className="card p-4">
            <EChart option={option} onEvents={onEvents} style={{ height: Math.max(240, rows.length * 32 + 40) }} />
            <p className="mt-1.5 text-xs text-faint">{t("common.source")} · values under the active filters and freight scenario.</p>
          </div>
        )}
        <div className="card p-4">
          <div className="mb-2 flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold">Concentration</h3>
            <InfoTip text="How concentrated the active direction's discrepancy is across country × HS2 channels under the current filters. High concentration means a few channels drive the total — review can be targeted." />
          </div>
          <dl className="space-y-3">
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">Top-5 channel share</dt>
              <dd className="tabular text-xl font-semibold">{fmtPct(k.top5Share, 0)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">HHI (0–10,000)</dt>
              <dd className="tabular text-xl font-semibold">{fmtNum(k.hhi)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">Partners with signal</dt>
              <dd className="tabular text-xl font-semibold">{fmtNum(k.partnerCount)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-medium uppercase tracking-wider text-faint">Channels (HS2)</dt>
              <dd className="tabular text-xl font-semibold">{fmtNum(k.channelCount)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Uncertainty band + reconciliation funnel                            */
/* ------------------------------------------------------------------ */

function UncBar({ low, central, high }: { low: number; central: number; high: number }) {
  const max = Math.max(high, 1);
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div className="min-w-[260px] flex-1">
      <div className="relative h-8 overflow-hidden rounded-md bg-[var(--color-panel-2)]">
        <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: pct(high), background: "color-mix(in srgb, var(--color-positive) 18%, transparent)" }} />
        <div className="absolute inset-y-0 left-0 rounded-md" style={{ width: pct(low), background: "color-mix(in srgb, var(--color-positive) 38%, transparent)" }} />
        <div className="absolute inset-y-0 w-[3px] bg-[var(--color-positive)]" style={{ left: pct(central) }} title={`Central (10%): ${fmtUSD(central)}`} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>6%: {fmtUSD(low)}</span><span>10%: {fmtUSD(central)}</span><span>15%: {fmtUSD(high)}</span>
      </div>
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; count: number; value: number | null; note: string }[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {steps.map((s) => (
        <div key={s.label} className="flex items-center gap-3">
          <span className="w-52 shrink-0 truncate text-sm text-muted" title={s.note}>{s.label}</span>
          <div className="h-6 flex-1 overflow-hidden rounded bg-[var(--color-panel-2)]">
            <div className="flex h-full items-center rounded bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)] px-2 text-[11px] font-medium text-[var(--color-primary)]"
              style={{ width: `${Math.max(4, (s.count / max) * 100)}%` }}>
              {s.count.toLocaleString()}
            </div>
          </div>
          <span className="tabular w-20 shrink-0 text-right text-sm text-muted">{s.value != null ? fmtUSD(s.value) : "—"}</span>
        </div>
      ))}
    </div>
  );
}
