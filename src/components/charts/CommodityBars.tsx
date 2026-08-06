"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { DIRECTION_LABELS, type ChapterAgg, type Direction } from "@/lib/dataset";
import { COLORS, fmtUSD, fmtUSDFull } from "@/lib/format";
import { baseTooltip, baseTextStyle } from "@/lib/echartBase";

/**
 * Top-15 HS2 chapters ranked by the ACTIVE direction metric (spec §6.7).
 * Amber = positive (partner > UZB), blue = reverse (UZB > partner); the signed
 * (net) direction colors each bar by its own sign. Residual chapters (98/99)
 * are labelled explicitly — they are shown for transparency only.
 */
export default function CommodityBars({
  chapters,
  direction,
}: {
  chapters: ChapterAgg[];
  direction: Direction;
}) {
  const val = useMemo(
    () => (c: ChapterAgg) =>
      direction === "reverse" ? c.revT : direction === "absolute" ? c.absT : direction === "net" ? c.signedT : c.posT,
    [direction],
  );

  const top = useMemo(
    () =>
      [...chapters]
        .filter((c) => Math.abs(val(c)) > 0)
        .sort((a, b) => Math.abs(val(b)) - Math.abs(val(a)))
        .slice(0, 15)
        .reverse(),
    [chapters, val],
  );

  const barColor = (c: ChapterAgg): string =>
    direction === "reverse" ? COLORS.reverse
      : direction === "net" ? (val(c) >= 0 ? COLORS.positive : COLORS.reverse)
        : direction === "absolute" ? COLORS.text
          : COLORS.positive;

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
          return `<b>HS ${c.chapter}</b> · ${c.label}${c.residual ? " <i>(residual — transparency only)</i>" : ""}<br/>` +
            `${DIRECTION_LABELS[direction]}: <b>${fmtUSDFull(val(c))}</b><br/>` +
            `Positive ${fmtUSD(c.posT)} · Reverse ${fmtUSD(c.revT)} · Comparable trade ${fmtUSD(c.peT)}`;
        },
      },
      xAxis: {
        type: "value",
        name: DIRECTION_LABELS[direction],
        nameLocation: "end",
        nameTextStyle: { color: COLORS.axis, fontSize: 11 },
        axisLabel: { color: COLORS.axis, formatter: (v: number) => fmtUSD(v) },
        splitLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: {
        type: "category",
        data: top.map((c) => `${c.chapter} · ${c.label}${c.residual ? " (residual)" : ""}`),
        axisLabel: { color: COLORS.axis, fontSize: 11, width: 210, overflow: "truncate" as const },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: DIRECTION_LABELS[direction],
          type: "bar",
          data: top.map((c) => ({ value: Math.round(val(c)), itemStyle: { color: barColor(c), borderRadius: [0, 3, 3, 0] as [number, number, number, number] } })),
          barMaxWidth: 20,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [top, direction, val],
  );

  return (
    <div className="card p-3" style={{ height: Math.max(220, 40 + top.length * 30) }}>
      <EChart option={option} />
    </div>
  );
}
