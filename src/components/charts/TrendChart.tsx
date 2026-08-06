"use client";

import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { COLORS, fmtNum, fmtUSD, fmtUSDFull } from "@/lib/format";

const POSITIVE_SERIES = "Positive (partner > UZB)";
const REVERSE_SERIES = "Reverse (UZB > partner)";

const INK = "#201e1d";
const MUTED = "rgba(32,30,29,.55)";

/**
 * Structural breaks (Methodology §6.10): marked so that real trade shocks are
 * not read as screening signals and data-coverage artifacts are not read as
 * real shocks. Quiet dashed lines with tiny labels.
 */
const STRUCTURAL_BREAKS: { year: number; label: string }[] = [
  { year: 2020, label: "COVID-19" },
  { year: 2022, label: "reporting stop" },
];

/**
 * Eight-year record (Modernist redesign, Screens §1): a single stacked bar per
 * year — reverse discrepancy stacked BELOW in ink-22% grey, positive stacked
 * above in the accent. Always fed the full-window `series.annual`, so the
 * chart ignores the period filter while every other filter applies.
 */
export default function TrendChart({
  annual,
  height = 236,
}: {
  annual: { year: number; pe: number; ui: number; positive: number; reverse: number; comparablePartners: number }[];
  height?: number;
}) {
  const years = annual.map((a) => String(a.year));
  const breaks = STRUCTURAL_BREAKS.filter((b) => annual.some((a) => a.year === b.year));
  const partnersByYear = new Map(annual.map((a) => [String(a.year), a.comparablePartners]));

  const option: EChartsOption = {
    backgroundColor: "transparent",
    textStyle: { color: MUTED, fontFamily: "var(--font-archivo), Archivo, sans-serif" },
    grid: { left: 52, right: 14, top: 26, bottom: 24, containLabel: true },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: MUTED, fontSize: 10.5 },
      data: [POSITIVE_SERIES, REVERSE_SERIES],
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "#f3f2f2",
      borderColor: INK,
      borderWidth: 1,
      padding: [8, 12],
      textStyle: { color: INK, fontSize: 12 },
      extraCssText: "border-radius:0;box-shadow:none",
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
          const v = typeof it.value === "number" ? fmtUSDFull(it.value) : "not reported";
          return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
        });
        const partners = partnersByYear.get(year);
        const partnersLine =
          partners !== undefined
            ? `<div style="margin-top:2px">Comparable partners: <span style="font-weight:600">${fmtNum(partners)}</span></div>`
            : "";
        return head + lines.join("") + partnersLine;
      },
    },
    xAxis: {
      type: "category",
      data: years,
      axisLabel: { color: MUTED, fontSize: 10 },
      axisLine: { lineStyle: { color: INK } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: MUTED, fontSize: 10, formatter: (v: number) => fmtUSD(v) },
      splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
      axisLine: { show: false },
    },
    series: [
      {
        // reverse sits at the bottom of the stack — ink-22% grey, never a hue
        name: REVERSE_SERIES,
        type: "bar",
        stack: "g",
        data: annual.map((a) => Math.round(a.reverse)),
        barMaxWidth: 34,
        itemStyle: { color: COLORS.reverse, borderRadius: 0 },
      },
      {
        name: POSITIVE_SERIES,
        type: "bar",
        stack: "g",
        data: annual.map((a) => Math.round(a.positive)),
        barMaxWidth: 34,
        itemStyle: { color: COLORS.positive, borderRadius: 0 },
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
                    color: MUTED,
                    fontSize: 9,
                  },
                  lineStyle: { color: MUTED, type: "dashed", width: 1 },
                })),
              }
            : undefined,
      },
    ],
  };

  return <EChart option={option} style={{ height }} />;
}
