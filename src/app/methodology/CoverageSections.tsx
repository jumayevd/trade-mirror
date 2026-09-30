"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EChartsOption } from "echarts";
import LevelTabs, { type HsLevel } from "@/components/LevelTabs";
import EChart from "@/components/EChart";
import { QualityTag, TransitTag, Pill, EmptyState, InfoTip } from "@/components/ui";
import { aggregate, DEFAULT_FILTER, meta, partnerName, regionLabel, yearsFor } from "@/lib/dataset";
import { labelsFor } from "@/lib/labels";
import { useI18n } from "@/lib/i18n";
import { fmtNum, fmtPct, fmtUSDFull, COLORS } from "@/lib/format";
import { BAR_SPEC, CHART_FONT, baseGrid, baseTextStyle, baseTooltip, catAxis } from "@/lib/echartBase";

/**
 * The two record-level sections that used to close the Data Quality page:
 * product-level coverage per year, and the transit hubs. Both describe the
 * source rather than a selection, so they read the whole 2017–2026 window with
 * no partner or product filter, whatever is ticked elsewhere.
 */

const fill = (s: string, vals: Record<string, string | number>) =>
  Object.entries(vals).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s);

const LEVEL_CODE: Record<HsLevel, string> = { 2: "HS2", 4: "HS4", 6: "HS6" };

/**
 * Partner × code pairs with data per year. A pair has data in a year when both
 * books report at least one of its HS6 lines, so HS2 and HS4 are counted from
 * the same HS6 lines, and the partner-reported value is the same total at
 * every level.
 */
export function ProductCoverage() {
  const { t } = useI18n();
  const [level, setLevel] = useState<HsLevel>(6);
  const levelCode = LEVEL_CODE[level];
  const whole = useMemo(() => aggregate({ ...DEFAULT_FILTER, years: [...yearsFor("year")], minGap: 0 }), []);
  const pairs = level === 2 ? whole.baseChannels : level === 4 ? whole.baseChannels4 : whole.baseChannels6;

  const byYear = useMemo(() => {
    const m = new Map<number, { count: number; pe: number }>();
    for (const c of pairs) {
      for (const yr of c.years) {
        const e = m.get(yr.y) ?? { count: 0, pe: 0 };
        e.count += 1;
        e.pe += yr.pe;
        m.set(yr.y, e);
      }
    }
    return yearsFor("year").map((y) => ({ y, count: m.get(y)?.count ?? 0, pe: m.get(y)?.pe ?? 0 }));
  }, [pairs]);

  // one measure on the axis (pair counts); the USD value is a different scale,
  // so it lives in the tooltip — never a dual axis
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    textStyle: baseTextStyle,
    grid: baseGrid,
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      formatter: (params: unknown) => {
        const p = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number; axisValueLabel?: string };
        const row = byYear[p?.dataIndex ?? -1];
        if (!row) return "";
        return [
          `<b>${p?.axisValueLabel ?? row.y}</b>`,
          `${fill(t("qual.level.channelsWithData"), { level: levelCode })}: <b>${fmtNum(row.count)}</b>`,
          `${t("qual.level.partnerValue")}: ${fmtUSDFull(row.pe)}`,
        ].join("<br/>");
      },
    },
    xAxis: catAxis(byYear.map((r) => r.y)),
    yAxis: {
      type: "value",
      name: fill(t("qual.level.axis"), { level: levelCode }),
      nameTextStyle: { color: COLORS.axis, fontSize: CHART_FONT.axisName },
      axisLabel: { color: COLORS.axis, fontSize: CHART_FONT.axisLabel, formatter: (v: number) => fmtNum(v) },
      splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
      axisLine: { show: false },
    },
    series: [
      {
        name: fill(t("qual.level.channelsWithData"), { level: levelCode }),
        type: "bar",
        ...BAR_SPEC,
        data: byYear.map((r) => r.count),
        itemStyle: { ...BAR_SPEC.itemStyle, color: COLORS.baseline },
      },
    ],
  }), [byYear, levelCode, t]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <LevelTabs level={level} onChange={setLevel} />
        <InfoTip text={t("qual.level.tip")} />
      </div>
      {pairs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="card max-w-4xl p-4">
          <EChart option={option} style={{ height: 300 }} />
          <p className="mt-2 max-w-3xl text-xs text-faint">{fill(t("qual.level.note"), { level: levelCode })}</p>
        </div>
      )}
    </div>
  );
}

/** Partners flagged as re-export or consignment hubs, with their reporting record. */
export function TransitPartners() {
  const { t, lang } = useI18n();
  const hubs = useMemo(
    () => labelsFor(lang, () =>
      meta.partners
        .filter((p) => p.transit)
        .map((p) => ({ ...p, name: partnerName(p.iso3) }))
        .sort((a, b) => b.coverage - a.coverage || a.name.localeCompare(b.name, lang))),
    [lang],
  );

  return (
    <div className="space-y-3">
      <p className="max-w-3xl rounded-md border-l-2 border-l-[var(--color-transit)] bg-[var(--color-panel)] px-4 py-2.5 text-[13px] text-muted">
        <strong className="text-foreground">{t("qual.transit.calloutTitle")}</strong>{" "}
        {t("qual.transit.callout1")} <em>{t("qual.transit.origin")}</em>
        {t("qual.transit.callout2")} <em>{t("qual.transit.consignment")}</em>
        {t("qual.transit.callout3")}
      </p>
      {hubs.length === 0 ? (
        <EmptyState text={t("qual.transit.empty")} />
      ) : (
        <div className="card max-w-4xl overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-[12px] text-faint">
                <th className="px-3 py-2 font-medium">{t("common.partner")}</th>
                <th className="px-3 py-2 font-medium">{t("qual.transit.region")}</th>
                <th className="px-3 py-2 font-medium">{t("qual.transit.reporting")}</th>
                <th className="tabular px-3 py-2 text-right font-medium">{t("kpi.coverage")}</th>
                <th className="px-3 py-2 font-medium">{t("qual.transit.basis")}</th>
              </tr>
            </thead>
            <tbody className="zebra">
              {hubs.map((p) => (
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
                  <td className="tabular px-3 py-2 text-right text-muted" title={`${p.reportedYears.length} / ${yearsFor("year").length}`}>
                    {fmtPct(p.coverage, 0)}
                  </td>
                  <td className="px-3 py-2 text-muted">{t("qual.transit.basisValue")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
