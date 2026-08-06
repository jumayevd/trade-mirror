"use client";

import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { COLORS } from "@/lib/format";

export default function Sparkline({
  data,
  color = COLORS.positive,
  height = 34,
  width = 120,
  type = "line",
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number;
  type?: "bar" | "line";
}) {
  const series =
    type === "line"
      ? {
          type: "line" as const,
          data,
          showSymbol: false,
          smooth: true,
          lineStyle: { color, width: 1.5 },
          areaStyle: { color, opacity: 0.12 },
        }
      : {
          type: "bar" as const,
          data,
          itemStyle: { color, borderRadius: [2, 2, 0, 0] as [number, number, number, number] },
          barWidth: "70%",
        };
  const option: EChartsOption = {
    backgroundColor: "transparent",
    grid: { left: 1, right: 1, top: 3, bottom: 3 },
    xAxis: { type: "category", show: false, boundaryGap: type === "bar", data: data.map((_, i) => i) },
    yAxis: { type: "value", show: false, min: 0, splitLine: { show: false } },
    tooltip: { show: false },
    series: [series],
  };
  return <EChart option={option} style={{ height, width }} />;
}
