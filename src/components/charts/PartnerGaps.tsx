"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { PartnerAgg } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { BAR_SPEC, CHART_FONT, baseGrid, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Partner profile chart (spec §6.6.4): per-year grouped bars of partner-reported
 * exports (orange, FOB) vs Uzbekistan-recorded imports (blue, CIF). The positive
 * discrepancy per year lives in the tooltip — never as an extra series.
 * Years where the partner did not report are skipped entirely — a missing
 * partner-year has no mirror reference and is never drawn as a zero.
 */
export default function PartnerGaps({
  byYear,
  partner,
}: {
  byYear: PartnerAgg["byYear"];
  partner: string;
}) {
  const { t } = useI18n();
  const reported = useMemo(() => byYear.filter((y) => y.reported), [byYear]);
  const missing = useMemo(() => byYear.filter((y) => !y.reported).map((y) => y.year), [byYear]);

  const ptnLabel = `${partner} — ${t("ctry.chart.reportedExportsFob")}`;
  const uzbLabel = t("ctry.chart.uzbRecordedImportsCif");

  const option = useMemo<EChartsOption>(() => {
    const years = reported.map((y) => y.year);
    const rowByYear = new Map(reported.map((y) => [String(y.year), y]));
    return {
      backgroundColor: "transparent",
      grid: { ...baseGrid, top: 44 },
      legend: {
        top: 0,
        textStyle: { color: COLORS.text, fontSize: CHART_FONT.axisLabel },
        itemWidth: 14,
        data: [ptnLabel, uzbLabel],
      },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        formatter: (raw: unknown) => {
          const items = (Array.isArray(raw) ? raw : [raw]) as {
            seriesName?: string;
            axisValue?: string | number;
            marker?: string;
            value?: number;
          }[];
          if (items.length === 0) return "";
          const year = String(items[0]?.axisValue ?? "");
          const head = `<div style="font-weight:600;margin-bottom:4px">${year}</div>`;
          const lines = items.map((it) => {
            const v = typeof it.value === "number" ? fmtUSDFull(it.value) : t("common.notReported");
            return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
          });
          const row = rowByYear.get(year);
          const gapLines = row
            ? `<div style="margin-top:4px;color:${COLORS.text}">${t("kpi.positive")}: <b style="color:${COLORS.positive}">${fmtUSDFull(Math.round(row.positive))}</b></div>`
            : "";
          return head + lines.join("") + gapLines;
        },
      },
      xAxis: catAxis(years),
      yAxis: valueAxis(),
      series: [
        {
          name: ptnLabel,
          type: "bar",
          data: reported.map((y) => Math.round(y.pe)),
          ...BAR_SPEC,
          itemStyle: {
            ...BAR_SPEC.itemStyle,
            color: COLORS.partner,
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
          barGap: "10%",
        },
        {
          name: uzbLabel,
          type: "bar",
          data: reported.map((y) => Math.round(y.ui)),
          ...BAR_SPEC,
          itemStyle: {
            ...BAR_SPEC.itemStyle,
            color: COLORS.uzb,
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
        },
      ],
    };
  }, [reported, ptnLabel, uzbLabel, t]);

  if (reported.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-muted">
        {partner} {t("ctry.chart.noReportedYears")}
      </p>
    );
  }

  return (
    <div>
      <div className="card p-3" style={{ height: 340 }}>
        <EChart option={option} />
      </div>
      {missing.length > 0 && (
        <p className="mt-2 text-xs text-faint">
          {t("ctry.chart.notDrawn")}: {missing.join(", ")} — {partner}{" "}
          {missing.length === 1 ? t("ctry.chart.notDrawnOne") : t("ctry.chart.notDrawnMany")}{" "}
          {t("common.source")}.
        </p>
      )}
    </div>
  );
}
