"use client";

import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { BAR_SPEC, baseGrid, baseTextStyle, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";
import { COLORS, fmtNum, fmtUSDFull } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export default function TrendChart({
  annual,
  height = 320,
}: {
  annual: { year: number; pe: number; ui: number; positive: number; comparablePartners: number }[];
  height?: number;
}) {
  const { t } = useI18n();
  const positiveSeries = t("ovw.trend.series");
  const years = annual.map((a) => String(a.year));

  /**
   * Structural breaks (spec §6.10): marked so that real trade shocks are not read
   * as screening signals and data-coverage artifacts are not read as real shocks.
   * All markers are quiet grey solid lines with tiny labels.
   */
  const structuralBreaks: { year: number; label: string }[] = [
    { year: 2020, label: "COVID-19" },
    { year: 2022, label: t("ovw.break.reportingStop") },
    { year: 2023, label: t("ovw.break.hsExpansion") },
  ];
  const breaks = structuralBreaks.filter((b) => annual.some((a) => a.year === b.year));
  const partnersByYear = new Map(annual.map((a) => [String(a.year), a.comparablePartners]));

  const option: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: baseTextStyle,
    grid: baseGrid,
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: COLORS.text, fontSize: 11 },
      data: [positiveSeries],
    },
    tooltip: {
      ...baseTooltip(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
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
        const partners = partnersByYear.get(year);
        const partnersLine =
          partners !== undefined
            ? `<div style="margin-top:2px;color:${COLORS.text}">${t("ovw.tooltip.comparablePartners")}: <span style="font-weight:600">${fmtNum(partners)}</span></div>`
            : "";
        return head + lines.join("") + partnersLine;
      },
    },
    xAxis: catAxis(years),
    yAxis: valueAxis("USD"),
    series: [
      {
        name: positiveSeries,
        type: "bar",
        data: annual.map((a) => Math.round(a.positive)),
        ...BAR_SPEC,
        itemStyle: {
          ...BAR_SPEC.itemStyle,
          color: COLORS.positive,
          borderColor: COLORS.surface,
          borderWidth: 1,
        },
        markLine:
          breaks.length > 0
            ? {
                silent: true,
                symbol: "none",
                animation: false,
                data: breaks.map((b) => ({
                  xAxis: String(b.year),
                  label: {
                    formatter: b.label,
                    position: "insideEndTop",
                    color: COLORS.axis,
                    fontSize: 9,
                  },
                  lineStyle: { color: COLORS.axis, type: "solid", width: 1 },
                })),
              }
            : undefined,
      },
    ],
  };

  return (
    <div>
      <EChart option={option} style={{ height }} />
      <p className="mt-1.5 max-w-3xl text-xs text-faint">
        {t("ovw.trend.caption")} {t("common.source")}.
      </p>
    </div>
  );
}
