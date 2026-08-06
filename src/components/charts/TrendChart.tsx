"use client";

import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { baseGrid, baseTextStyle, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";
import { COLORS, fmtNum, fmtUSDFull } from "@/lib/format";

const POSITIVE_SERIES = "Positive discrepancy (partner > UZB)";
const REVERSE_SERIES = "Reverse discrepancy (UZB > partner)";
const PARTNERS_SERIES = "Comparable partners";

/**
 * Structural breaks (spec §6.10): marked so that real trade shocks are not read
 * as screening signals and data-coverage artifacts are not read as real shocks.
 * Grey = external shock; purple-grey = reporting/coverage artifact.
 */
const STRUCTURAL_BREAKS: { year: number; label: string; color: string }[] = [
  { year: 2020, label: "COVID-19", color: "#75847b" },
  { year: 2022, label: "Partner reporting stop", color: "#8b80ad" },
  { year: 2023, label: "HS granularity expansion", color: "#75847b" },
];

export default function TrendChart({
  annual,
  height = 320,
}: {
  annual: { year: number; pe: number; ui: number; positive: number; reverse: number; comparablePartners: number }[];
  height?: number;
}) {
  const years = annual.map((a) => String(a.year));
  const breaks = STRUCTURAL_BREAKS.filter((b) => annual.some((a) => a.year === b.year));

  const option: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: baseTextStyle,
    grid: { ...baseGrid, right: 64 },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 8,
      textStyle: { color: COLORS.text, fontSize: 12 },
      data: [POSITIVE_SERIES, REVERSE_SERIES, PARTNERS_SERIES],
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
        const head = `<div style="font-weight:600;margin-bottom:4px">${items[0]?.axisValue ?? ""}</div>`;
        const lines = items.map((it) => {
          const v =
            typeof it.value === "number"
              ? it.seriesName === PARTNERS_SERIES
                ? fmtNum(it.value)
                : fmtUSDFull(it.value)
              : "not reported";
          return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
        });
        return head + lines.join("");
      },
    },
    xAxis: catAxis(years),
    yAxis: [
      valueAxis("USD"),
      {
        type: "value",
        name: "comparable partners",
        nameTextStyle: { color: COLORS.axis },
        position: "right",
        minInterval: 1,
        axisLabel: { color: COLORS.axis },
        splitLine: { show: false },
        axisLine: { show: false },
      },
    ],
    series: [
      {
        name: POSITIVE_SERIES,
        type: "bar",
        data: annual.map((a) => Math.round(a.positive)),
        itemStyle: { color: COLORS.positive, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 28,
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
                    color: b.color,
                    fontSize: 10,
                  },
                  lineStyle: { color: b.color, type: "dashed", width: 1 },
                })),
              }
            : undefined,
      },
      {
        name: REVERSE_SERIES,
        type: "bar",
        data: annual.map((a) => Math.round(a.reverse)),
        itemStyle: { color: COLORS.reverse, borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 28,
      },
      {
        name: PARTNERS_SERIES,
        type: "line",
        yAxisIndex: 1,
        data: annual.map((a) => a.comparablePartners),
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { color: COLORS.ok, width: 1.8 },
        itemStyle: { color: COLORS.ok },
      },
    ],
  };

  return (
    <div>
      <EChart option={option} style={{ height }} />
      <p className="mt-1.5 max-w-3xl text-xs text-faint">
        Amber bars: positive discrepancy (partner &gt; UZB records). Blue bars: reverse (UZB records &gt;
        partner) — accumulated separately, never netted. Green line (right axis): partners with comparable
        data that year. Dashed markers flag structural breaks — 2020 COVID-19, 2022 partner reporting stop,
        2023 HS granularity expansion — to separate real trade shocks from data-coverage artifacts; a step
        change at a marker may reflect reporting, not flows. Source: UN Comtrade.
      </p>
    </div>
  );
}
