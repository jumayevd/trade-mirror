"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { type ChapterAgg } from "@/lib/dataset";
import { useI18n } from "@/lib/i18n";
import { COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { BAR_SPEC, baseTooltip, baseTextStyle } from "@/lib/echartBase";

/**
 * Top-15 HS2 chapters ranked by the positive discrepancy (spec §6.7) — the only
 * screened metric. Residual chapters (98/99) are labelled explicitly: they are
 * shown for transparency only.
 */
export default function CommodityBars({ chapters }: { chapters: ChapterAgg[] }) {
  const { t } = useI18n();
  const metric = t("kpi.positive");

  const top = useMemo(
    () =>
      [...chapters]
        .filter((c) => c.posT > 0)
        .sort((a, b) => b.posT - a.posT)
        .slice(0, 15)
        .reverse(),
    [chapters],
  );

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { left: 8, right: 28, top: 30, bottom: 8, containLabel: true },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (p: unknown) => {
          const items = p as { dataIndex: number }[];
          const c = top[items[0]?.dataIndex];
          if (!c) return "";
          return `<b>HS ${c.chapter}</b> · ${c.label}${c.residual ? ` <i>(${t("prod.chart.residualNote")})</i>` : ""}<br/>` +
            `${metric}: <b>${fmtUSDFull(c.posT)}</b><br/>` +
            `${t("prod.col.gapRate")} ${fmtPct(c.gapRate, 1)} · ${t("prod.col.channels")}: ${fmtNum(c.channels)}`;
        },
      },
      xAxis: {
        type: "value",
        name: metric,
        nameLocation: "end",
        nameTextStyle: { color: COLORS.axis, fontSize: 11 },
        axisLabel: { color: COLORS.axis, formatter: (v: number) => fmtUSD(v) },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: {
        type: "category",
        data: top.map((c) => `${c.chapter} · ${c.label}${c.residual ? ` (${t("prod.chart.residual")})` : ""}`),
        axisLabel: { color: COLORS.axis, fontSize: 11, width: 210, overflow: "truncate" as const },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: metric,
          type: "bar",
          data: top.map((c) => ({
            value: Math.round(c.posT),
            itemStyle: {
              color: COLORS.positive,
              // data-end rounded; square at the baseline
              borderRadius: [0, 4, 4, 0] as [number, number, number, number],
            },
          })),
          barMaxWidth: BAR_SPEC.barMaxWidth,
        },
      ],
    }),
    [top, t, metric],
  );

  return (
    <div className="card p-3" style={{ height: Math.max(220, 40 + top.length * 30) }}>
      <EChart option={option} />
    </div>
  );
}
