"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import FilterBar from "@/components/FilterBar";
import EChart from "@/components/EChart";
import TrendChart from "@/components/charts/TrendChart";
import {
  Stat, SectionTitle, ContextLine, AnomalyBadge, EvidenceBadge,
  ClassBadge, RobustnessBadge, TransitTag, EmptyState, InfoTip,
} from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, DATA_VERSION, METHODOLOGY_VERSION, DIRECTION_LABELS, type PartnerAgg } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { channelsToCsv, downloadCsv } from "@/lib/export";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";
import { BAR_SPEC, baseGrid, baseTextStyle, baseTooltip } from "@/lib/echartBase";

export default function OverviewView() {
  const { data, series, filter } = useFilter();
  const { t } = useI18n();
  const k = data.kpis;
  const top = data.channels6.slice(0, 5);

  const exportCsv = () =>
    downloadCsv(`uzb-mirror-overview-hs6-${DATA_VERSION}.csv`, channelsToCsv(data.channels6, filter));

  return (
    <div className="space-y-6">
      {/* 1. hero: eyebrow · H1 · one compact line */}
      <section className="space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <p className="text-[11px] text-faint">
              UN Comtrade · {meta.window.start}–{meta.window.end} · mirror-statistics risk screening
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {t("nav.overview")}
            </h1>
            <p className="text-[13px] text-muted">
              Screening signals — not proof of wrongdoing ·{" "}
              <Link href="/methodology" className="font-medium text-[var(--color-primary)] hover:underline">Methodology →</Link>
            </p>
          </div>
          <button
            onClick={exportCsv}
            className="no-print shrink-0 rounded-md border border-[var(--color-border)] px-2 py-1 text-[12px] font-medium text-muted hover:text-foreground"
            title="All country × HS6 channels under the active filters, with raw and derived fields, data version and filter context."
          >
            {t("common.exportCsv")} ↓
          </button>
        </div>
      </section>

      {/* 2. filters + calculation context */}
      <FilterBar />
      <ContextLine filter={filter} />

      {/* 3. national snapshot — four non-overlapping tiles */}
      <section>
        <SectionTitle
          title="National snapshot"
          desc="Residual unexplained discrepancies under the active filters."
        />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label={t("kpi.comparableTrade")} value={fmtUSD(k.comparableTrade)}
            sub={`${t("kpi.comparableTrade.sub")} · ${fmtPct(k.coveragePct, 0)} of partner-years covered`}
            info="Partner-reported exports (FOB) in channels where both sides reported for the selected period — the denominator of the analysis. The coverage share counts partner-years where the partner actually reported; missing partner-years are never treated as zero flows (full detail on the Data Quality page)." />
          <HeroStat label={t("kpi.positive")} value={fmtUSD(k.positive.central)}
            sub={`${fmtUSD(k.positive.low)}–${fmtUSD(k.positive.high)} across 6–15% freight`}
            info="Σ max(expected CIF − UZB imports, 0) per channel-year. Expected CIF = partner exports × (1 + freight)." />
          <Stat label={t("kpi.reverse")} value={fmtUSD(k.reverse)} sub={t("kpi.reverse.sub")}
            info="Σ max(UZB imports − expected CIF, 0). Shown separately — never netted away against positive discrepancies." />
          <Stat label={t("kpi.robust")} value={String(k.robustSignals)} sub={t("kpi.robust.sub")}
            info="HS6 channels classified Investigate (high anomaly + high evidence) whose sign holds across the whole 6–15% freight band." />
        </div>
      </section>

      {/* 4. trade development (full window) */}
      <section>
        <SectionTitle
          title="Trade development"
          desc="Amber: positive · blue: reverse · line: comparable partners."
          right={<InfoTip text={`${t("ov.trend")} — full ${meta.window.start}–${meta.window.end} window under the current filters.`} />}
        />
        <TrendChart annual={series.annual} />
      </section>

      {/* 5. where it concentrates */}
      <TopCounterparts />

      {/* 6. top screening signals */}
      <section>
        <SectionTitle title={t("ov.topSignals")}
          desc="Ranked by class, anomaly strength and evidence quality."
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
                <span className="tabular inline-flex w-24 items-center justify-end gap-1.5 text-right text-sm"
                  title={c.signedT >= 0 ? "Positive discrepancy" : "Reverse discrepancy"}>
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.signedT >= 0 ? COLORS.positive : COLORS.reverse }} />
                  {fmtUSD(c.primary)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 7. dataset & grounding — one mono line */}
      <section className="card p-3">
        <p
          className="tabular text-[12px] leading-relaxed text-muted"
          title={`${fmtNum(meta.orphans.importCells)} orphan import observations (${fmtUSD(meta.orphans.importValue)}) lack a partner mirror — excluded from discrepancy metrics, never treated as zero exports. Turkmenistan does not report to UN Comtrade. Comtrade revises past years between data versions.`}
        >
          {fmtNum(meta.datasetRows)} records · {meta.window.start}–{meta.window.end} · {fmtNum(meta.partners.length)} partners ·
          UN Comtrade (HS2 + HS6) · data {DATA_VERSION} · methodology v{METHODOLOGY_VERSION} ·{" "}
          <Link href="/quality" className="font-medium text-[var(--color-primary)] hover:underline">{t("nav.quality")}</Link> ·{" "}
          <Link href="/methodology" className="font-medium text-[var(--color-primary)] hover:underline">{t("nav.methodology")}</Link>
        </p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hero stat: the ONE lead number on the page (26px; others stay 22px) */
/* ------------------------------------------------------------------ */

function HeroStat({ label, value, sub, info }: { label: string; value: string; sub?: string; info?: string }) {
  return (
    <div className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[12px] leading-snug text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-[26px] font-semibold leading-none tracking-tight">{value}</span>
      </div>
      {sub && <div className="mt-1 text-[11.5px] leading-snug text-faint">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Where it concentrates: horizontal bar (top-10 partners)             */
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
    mode === "trade" ? COLORS.baseline
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
        axisLabel: { color: COLORS.axis, fontSize: 11, formatter: (v: number) => fmtUSD(v) },
        splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
        axisLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: ordered.map((r) => (r.transit ? `${r.name} ⇄` : r.name)),
        axisLabel: { color: COLORS.text, fontSize: 11 },
        axisLine: { lineStyle: { color: COLORS.baseline } },
        axisTick: { show: false },
      },
      series: [
        {
          type: "bar",
          ...BAR_SPEC,
          data: ordered.map((r) => ({
            value: Math.round(r.value),
            // horizontal bars: rounded data-end, square at the baseline; 2px surface gap
            itemStyle: {
              color: barColor(r.value),
              borderRadius: [0, 4, 4, 0] as [number, number, number, number],
              borderColor: COLORS.surface,
              borderWidth: 1,
            },
          })),
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
      className={`rounded-md border px-2 py-1 text-[12px] font-medium ${mode === m ? "border-[var(--color-primary)] bg-[var(--color-primary)] text-white" : "border-[var(--color-border)] text-muted hover:text-foreground"}`}>
      {label}
    </button>
  );

  return (
    <section>
      <SectionTitle
        title="Where it concentrates"
        desc={`Top-10 partners by ${mode === "trade" ? "comparable trade (FOB)" : `${DIRECTION_LABELS[filter.direction].toLowerCase()} discrepancy`}.`}
        right={
          <div className="flex items-center gap-1.5">
            <InfoTip text={`Top-5 channels carry ${fmtPct(k.top5Share, 0)} of the total across ${fmtNum(k.channelCount)} country × HS2 channels (HHI ${fmtNum(k.hhi)}) — review can be targeted. Click a bar for the country page. ⇄ marks transit-sensitive partners. Values follow the active filters and freight scenario.`} />
            {modeBtn("gap", "by discrepancy", "Rank partners by the active direction's residual unexplained discrepancy.")}
            {modeBtn("trade", "by comparable trade", "Rank partners by partner-reported export value where both sides reported.")}
          </div>
        }
      />
      {rows.length === 0 ? <EmptyState /> : (
        <div className="card p-4">
          <EChart option={option} onEvents={onEvents} style={{ height: Math.max(240, rows.length * 32 + 40) }} />
        </div>
      )}
    </section>
  );
}
