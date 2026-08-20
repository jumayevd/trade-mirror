"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import LevelTabs, { type HsLevel } from "@/components/LevelTabs";
import EChart from "@/components/EChart";
import { SectionTitle, QualityTag, TransitTag, Pill, EmptyState, InfoTip } from "@/components/ui";
import { useFilter } from "@/lib/filter-context";
import { meta, partnerName, regionLabel, RISK_CONFIG, type PartnerMeta } from "@/lib/dataset";
import { labelsFor } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";
import { fmtNum, fmtPct, fmtUSDFull, COLORS } from "@/lib/format";
import { BAR_SPEC, baseGrid, baseTextStyle, baseTooltip, catAxis } from "@/lib/echartBase";

/** Fill {placeholders} in a translated string with dataset values. */
const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

/** Bare code name for sentence interpolation — the tab label carries the "derived" qualifier. */
const LEVEL_CODE: Record<HsLevel, string> = { 2: "HS2", 4: "HS4", 6: "HS6" };

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
  const { t } = useI18n();
  const state = cellState(p, y);
  if (state === "reported") {
    return (
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-full"
        style={{ background: COLORS.good }}
        title={fill(t("qual.cell.reported"), { name: partnerName(p.iso3), year: y })}
      />
    );
  }
  if (state === "stopMarker") {
    return (
      <span
        className="mx-auto block h-2.5 w-2.5 rounded-sm border-2"
        style={{ borderColor: "var(--color-serious)" }}
        title={fill(t("qual.cell.stopMarker"), { name: partnerName(p.iso3), year: p.lastReportedYear })}
      />
    );
  }
  if (state === "stopped") {
    return (
      <span
        className="mx-auto block h-[3px] w-2.5 rounded-full bg-[var(--color-border)]"
        title={fill(t("qual.cell.stopped"), { name: partnerName(p.iso3), year: p.lastReportedYear })}
      />
    );
  }
  return (
    <span
      className="mx-auto block h-2.5 w-2.5 rounded-full border"
      style={{ borderColor: COLORS.baseline }}
      title={fill(t("qual.cell.missing"), { name: partnerName(p.iso3), year: y })}
    />
  );
}

/** Legend chips — DotChip pattern: identity via a small mark beside ink text. */
function LegendChip({ marker, children }: { marker: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-1.5 py-px text-[10.5px] font-medium leading-4 text-muted">
      {marker}
      {children}
    </span>
  );
}

function CoverageLegend() {
  const { t } = useI18n();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <LegendChip marker={<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS.good }} />}>
        {t("qual.legend.reported")}
      </LegendChip>
      <LegendChip marker={<span className="h-2 w-2 shrink-0 rounded-full border" style={{ borderColor: COLORS.baseline }} />}>
        {t("qual.legend.notReported")}
      </LegendChip>
      <LegendChip marker={<span className="h-2 w-2 shrink-0 rounded-sm border-2" style={{ borderColor: "var(--color-serious)" }} />}>
        {t("qual.legend.stopsHere")}
      </LegendChip>
      <LegendChip marker={<span className="h-[3px] w-2 shrink-0 rounded-full bg-[var(--color-border)]" />}>
        {t("qual.legend.noLonger")}
      </LegendChip>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* View                                                                */
/* ------------------------------------------------------------------ */

/**
 * Data Quality — a description of the record itself: who reported when, how much
 * product detail exists, and what is excluded.
 * Deliberately unfiltered. These are the properties every other page's numbers
 * rest on, so narrowing them to a partner or a chapter would make the page argue
 * for a selection instead of describing the source.
 */
export default function QualityView() {
  const { series } = useFilter();
  const { t, lang } = useI18n();

  // Partner names are data-derived: translate them, and break coverage ties in
  // the reader's own alphabet rather than the English one.
  const partnersByCoverage = useMemo(
    () => labelsFor(lang, () =>
      [...meta.partners]
        .map((p) => ({ ...p, name: partnerName(p.iso3) }))
        .sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name, lang))),
    [lang],
  );
  const transitPartners = useMemo(() => partnersByCoverage.filter((p) => p.transit), [partnersByCoverage]);

  // ---- 2. product coverage per year at the chosen HS level, from the full-window aggregate ----
  const [level, setLevel] = useState<HsLevel>(6);
  const levelCode = LEVEL_CODE[level];
  const levelChannels =
    level === 2 ? series.baseChannels : level === 4 ? series.baseChannels4 : series.baseChannels6;

  const hs6ByYear = useMemo(() => {
    const m = new Map<number, { count: number; pe: number }>();
    for (const c of levelChannels) {
      for (const yr of c.years) {
        const e = m.get(yr.y) ?? { count: 0, pe: 0 };
        e.count += 1;
        e.pe += yr.pe;
        m.set(yr.y, e);
      }
    }
    return meta.years.map((y) => ({ y, count: m.get(y)?.count ?? 0, pe: m.get(y)?.pe ?? 0 }));
  }, [levelChannels]);

  // Single measure on the axis (channel counts); partner-reported USD value is a
  // second measure of a different scale, so it lives in the tooltip — never a dual axis.
  const coverageOption = useMemo<EChartsOption>(() => {
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: baseGrid,
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        formatter: (params: unknown) => {
          const p = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number; axisValueLabel?: string };
          const row = hs6ByYear[p?.dataIndex ?? -1];
          if (!row) return "";
          return [
            `<b>${p?.axisValueLabel ?? row.y}</b>`,
            `${fill(t("qual.level.channelsWithData"), { level: levelCode })}: <b>${fmtNum(row.count)}</b>`,
            `${t("qual.level.partnerValue")}: ${fmtUSDFull(row.pe)}`,
          ].join("<br/>");
        },
      },
      xAxis: catAxis(hs6ByYear.map((r) => r.y)),
      yAxis: {
        type: "value",
        name: fill(t("qual.level.axis"), { level: levelCode }),
        nameTextStyle: { color: COLORS.axis, fontSize: 11 },
        axisLabel: { color: COLORS.axis, fontSize: 11, formatter: (v: number) => fmtNum(v) },
        splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
        axisLine: { show: false },
      },
      series: [
        {
          name: fill(t("qual.level.channelsWithData"), { level: levelCode }),
          type: "bar",
          ...BAR_SPEC,
          data: hs6ByYear.map((r) => r.count),
          itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.baseline },
        },
      ],
    };
  }, [hs6ByYear, levelCode, t]);

  return (
    <div className="space-y-8">
      {/* header */}
      <section className="space-y-2">
        <p className="text-[11px] text-faint">
          UN Comtrade · {meta.window.start}–{meta.window.end} · {t("qual.header.kicker")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("nav.quality")}</h1>
      </section>

      {/* 1. reporter coverage heatmap */}
      <section>
        <SectionTitle
          title={t("qual.coverage.title")}
          desc={fill(t("qual.coverage.desc"), { start: meta.window.start, end: meta.window.end })}
        />
        <CoverageLegend />
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] text-faint">
                <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                {meta.years.map((y) => (
                  <th key={y} className="tabular px-1.5 py-2 text-center font-medium">{y}</th>
                ))}
                <th className="px-3 py-2 text-right font-medium">{t("kpi.coverage")}</th>
                <th className="px-3 py-2 font-medium">{t("qual.coverage.status")}</th>
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
                      {p.lapse && <Pill>{fill(t("qual.coverage.stoppedAfter"), { year: p.lastReportedYear })}</Pill>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 max-w-3xl text-xs text-faint">
          {t("qual.coverage.note")}
        </p>
      </section>

      {/* 2. product coverage — at the HS level chosen here, independent of the page filters */}
      <section>
        <SectionTitle
          title={t("qual.level.title")}
          desc={fill(t("qual.level.desc"), { level: levelCode })}
          right={<InfoTip text={t("qual.level.tip")} />}
        />
        <div className="mb-3">
          <LevelTabs level={level} onChange={setLevel} />
        </div>
        {levelChannels.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="card p-4">
            <EChart option={coverageOption} style={{ height: 300 }} />
            <p className="mt-2 max-w-3xl text-xs text-faint">
              {fill(t("qual.level.note"), { level: levelCode })}
            </p>
          </div>
        )}
      </section>

      {/* 3. transit metadata */}
      <section>
        <SectionTitle
          title={t("qual.transit.title")}
          desc={t("qual.transit.desc")} right={<InfoTip text={t("qual.transit.tip")} />}
        />
        <p className="mb-3 max-w-3xl rounded-md border-l-2 border-l-[var(--color-transit)] bg-[var(--color-panel)] px-4 py-2.5 text-sm text-muted">
          <strong className="text-foreground">{t("qual.transit.calloutTitle")}</strong>{" "}
          {t("qual.transit.callout1")} <em>{t("qual.transit.origin")}</em>
          {t("qual.transit.callout2")} <em>{t("qual.transit.consignment")}</em>
          {t("qual.transit.callout3")}
        </p>
        {transitPartners.length === 0 ? (
          <EmptyState text={t("qual.transit.empty")} />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[10.5px] text-faint">
                  <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                  <th className="px-3 py-2 font-medium">{t("qual.transit.region")}</th>
                  <th className="px-3 py-2 font-medium">{t("qual.transit.reporting")}</th>
                  <th className="tabular px-3 py-2 text-right font-medium">{t("kpi.coverage")}</th>
                  <th className="px-3 py-2 font-medium">{t("qual.transit.basis")}</th>
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
                    <td className="px-3 py-2 text-muted">{regionLabel(p.region)}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <QualityTag tier={p.tier} />
                        {p.lapse && <Pill>{fill(t("qual.coverage.stoppedAfter"), { year: p.lastReportedYear })}</Pill>}
                      </span>
                    </td>
                    <td className="tabular px-3 py-2 text-right text-muted">{fmtPct(p.coverage, 0)}</td>
                    <td className="px-3 py-2 text-muted">
                      {t("qual.transit.basisValue")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. excluded observations */}
      <section>
        <SectionTitle
          title={t("qual.excl.title")}
          desc={t("qual.excl.desc")} right={<InfoTip text={t("qual.excl.tip")} />}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">{t("qual.excl.chaptersTitle")}</h3>
            <p className="text-sm text-muted">
              {t("qual.excl.chapters1")} <span className="tabular">98</span>,{" "}
              <span className="tabular">99</span>
              {t("qual.excl.chapters2")}
            </p>
          </div>
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">{t("qual.excl.noiseTitle")}</h3>
            <p className="text-sm text-muted">
              {t("qual.excl.noiseBody")}
            </p>
          </div>
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">{t("qual.excl.floorTitle")}</h3>
            <p className="text-sm text-muted">
              {t("qual.excl.floor1")}{" "}
              <span className="tabular">${fmtNum(RISK_CONFIG.materialityFloor)}</span>{" "}
              {t("qual.excl.floor2")}
            </p>
          </div>
          <div className="card p-4">
            <h3 className="mb-1.5 text-sm font-semibold">{t("qual.excl.missingTitle")}</h3>
            <p className="text-sm text-muted">
              {t("qual.excl.missing1")} &quot;{t("common.notReported")}&quot; {t("qual.excl.missing2")}
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
