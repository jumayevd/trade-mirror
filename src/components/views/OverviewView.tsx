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
  aggregate, DEFAULT_FILTER, meta, hsLabel, productByCmd, yearsFor, yearsLabel,
  type Channel, type Granularity,
} from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import type { LocaleKey } from "@/lib/locales";
import { fmtUSD, fmtUSDFull, fmtPct, fmtNum, COLORS } from "@/lib/format";
import { BAR_SPEC, baseGrid, baseTextStyle, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

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
  const data = useMemo(
    () => aggregate({ ...FULL_WINDOW, granularity, years, months }),
    [granularity, years, months],
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
    const periodOf = (a: (typeof data.annual)[number]) => a.label ?? String(a.year);
    const partnersByYear = new Map(data.annual.map((a) => [periodOf(a), a.comparablePartners]));
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, top: 16 },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as { axisValue?: string | number; value?: number }[];
          if (items.length === 0) return "";
          const year = String(items[0]?.axisValue ?? "");
          const v0 = items[0]?.value;
          const v = typeof v0 === "number" ? fmtUSDFull(v0) : t("common.notComparable");
          const p = partnersByYear.get(year);
          const partnerLine =
            p !== undefined
              ? `<div style="margin-top:2px;color:${COLORS.text}">${t("ovw.tooltip.comparablePartners")}: <span style="font-weight:600">${fmtNum(p)}</span></div>`
              : "";
          return `<div style="font-weight:600;margin-bottom:4px">${year}</div>${t("kpi.positive")}: <span style="font-weight:600">${v}</span>${partnerLine}`;
        },
      },
      xAxis: catAxis(data.annual.map((a) => a.label ?? String(a.year))),
      yAxis: valueAxis("USD"),
      series: [
        {
          name: t("kpi.positive"),
          type: "bar",
          data: data.annual.map((a) => Math.round(a.positive)),
          ...BAR_SPEC,
          itemStyle: {
            ...BAR_SPEC.itemStyle,
            color: COLORS.positive,
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
        },
        // the same measure traced as a line, so the movement over time reads at a glance
        {
          name: t("kpi.positive"),
          type: "line",
          data: data.annual.map((a) => Math.round(a.positive)),
          smooth: 0.3,
          symbol: "circle",
          // on the monthly basis 90+ points would smother the line in dots
          symbolSize: data.annual.length > 24 ? 0 : 7,
          lineStyle: { width: 2, color: COLORS.gold },
          itemStyle: { color: COLORS.gold, borderColor: COLORS.surface, borderWidth: 2 },
          emphasis: { disabled: true },
          silent: true,
          z: 3,
        },
      ],
    };
  }, [data, t]);


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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{t("filter.granularity")}</span>
            <div className="flex overflow-hidden rounded-md border border-[var(--color-border)]" role="group" aria-label={t("filter.granularity")}>
              {(["year", "month"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => pickGranularity(g)}
                  aria-pressed={granularity === g}
                  title={g === "month" ? t("filter.monthlyHsTip") : undefined}
                  className={`px-2.5 py-1.5 text-[12px] whitespace-nowrap ${granularity === g ? "bg-[var(--color-primary)] font-semibold text-white" : "bg-[var(--color-panel)] font-medium text-muted hover:text-foreground"}`}
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
            info={t("ovw.stat.positive.info")}
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
        {granularity === "year" ? (
          <>
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
          </>
        ) : (
          <p className="card p-4 text-[13px] leading-relaxed text-muted">{t("filter.monthlyHsTip")}</p>
        )}
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
        <div className="text-[10.5px] font-semibold uppercase leading-snug tracking-[0.08em] text-muted">{label}</div>
        {info && <InfoTip text={info} />}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tracking-tight" style={{ color: COLORS.positive }}>
          {value}
        </span>
      </div>
      {sub && <div className="mt-1.5 text-[11.5px] leading-snug text-faint">{sub}</div>}
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
          <span className="tabular w-4 shrink-0 text-right text-[11px] text-faint">{i + 1}</span>
          <span className={`tabular ${codeWidth} shrink-0 text-[11px] text-faint`}>{r.code}</span>
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
            className="tabular w-12 shrink-0 text-right text-[11px] text-faint"
            title={t("ovw.share.tip")}
          >
            {total > 0 ? fmtPct(r.value / total, 0) : "—"}
          </span>
          <span className="hidden w-20 shrink-0 text-right text-[11px] text-faint sm:block">{r.note}</span>
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
      <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-medium text-faint">
        {title}
        <InfoTip text={hint} />
      </p>
      <RankedList rows={rows} total={total} codeWidth={codeWidth} />
    </div>
  );
}
