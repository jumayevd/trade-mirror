"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { CHART_FONT, baseTooltip } from "@/lib/echartBase";
import { COLORS, fmtUSD } from "@/lib/format";
import { rampPieces } from "@/lib/seq-ramp";

export interface HeatRow { key: string; label: string; values: number[] }

/** Row height in CSS pixels: room for a label and a 2px gap between cells. */
const ROW_PX = 30;

/**
 * A grid of positive-discrepancy amounts — rows down, columns across — with a
 * total for every row (right) and every column (bottom).
 *
 * Data cells are shaded on the portal's sequential ramp, the same classes and
 * shades as the partner map, so a dark cell reads as a large gap on both; an
 * empty cell sits on the neutral fill. The cells carry no numbers — hover gives
 * the figure — while the totals are plain cells that print their sum, so the
 * size of each row and column reads without hovering. Cells are separated by a
 * 2px surface gap.
 */
export default function GapHeatmap({ rows, columns, cellTooltip, totalWord, noneWord, overWord, underWord, ariaLabel }: {
  rows: HeatRow[];
  /** Column headings, in the order of each row's values. */
  columns: string[];
  /** Tooltip HTML for data cell (row i, column j). */
  cellTooltip: (i: number, j: number) => string;
  totalWord: string;
  noneWord: string;
  overWord: string;
  underWord: string;
  ariaLabel: string;
}) {
  const option = useMemo<EChartsOption>(() => {
    const nR = rows.length, nC = columns.length;
    const rowTotals = rows.map((r) => r.values.reduce((a, b) => a + b, 0));
    const colTotals = columns.map((_, j) => rows.reduce((s, r) => s + r.values[j], 0));
    const grand = rowTotals.reduce((a, b) => a + b, 0);

    const ramp = rampPieces(rows.flatMap((r) => r.values), fmtUSD, overWord, underWord);
    // the zero class is the neutral fill: keep the lowest ramp class strictly above it
    const low = ramp[ramp.length - 1];
    if (low && low.min === undefined) low.min = Number.MIN_VALUE;
    // a horizontal legend reads left to right, smallest first
    const pieces = [{ min: 0, max: 0, label: noneWord, color: COLORS.neutralMid }, ...ramp.reverse()];

    const cells = rows.flatMap((r, i) => r.values.map((v, j) => [j, i, v > 0 ? v : 0]));
    const totals = [
      ...rowTotals.map((v, i) => [nC, i, v]),
      ...colTotals.map((v, j) => [j, nR, v]),
      [nC, nR, grand],
    ];
    const small = `font-size:0.9em;color:${COLORS.text}`;
    const cellBorder = { borderColor: COLORS.surface, borderWidth: 2, borderRadius: 3 };

    return {
      backgroundColor: "transparent",
      grid: { left: 8, right: 8, top: 28, bottom: 64, containLabel: true },
      tooltip: {
        ...baseTooltip(),
        trigger: "item",
        confine: true,
        formatter: (p: unknown) => {
          const { seriesIndex, value } = p as { seriesIndex: number; value: [number, number, number] };
          const [j, i, v] = value;
          if (seriesIndex === 0) return cellTooltip(i, j);
          const name = i === nR && j === nC ? totalWord : i === nR ? `${columns[j]} · ${totalWord}` : `${rows[i].label} · ${totalWord}`;
          return `<b>${name}</b><br/><span style="${small}">${fmtUSD(v)}</span>`;
        },
      },
      xAxis: {
        type: "category",
        position: "top",
        data: [...columns, totalWord],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.text, fontSize: CHART_FONT.axisLabel, interval: 0 },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: [...rows.map((r) => r.label), totalWord],
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: COLORS.text, fontSize: CHART_FONT.axisLabel, width: 210, overflow: "truncate" },
      },
      visualMap: {
        type: "piecewise",
        seriesIndex: 0,
        pieces,
        orient: "horizontal",
        left: "center",
        bottom: 8,
        textStyle: { color: COLORS.text, fontSize: CHART_FONT.axisLabel },
        itemWidth: 14,
        itemHeight: 10,
        itemGap: 14,
      },
      series: [
        {
          type: "heatmap",
          data: cells,
          itemStyle: cellBorder,
          emphasis: { itemStyle: { borderColor: COLORS.text, borderWidth: 1 } },
        },
        {
          // totals: plain cells that print their sum
          type: "heatmap",
          data: totals,
          itemStyle: { ...cellBorder, color: COLORS.neutralMid },
          label: {
            show: true,
            color: COLORS.text,
            fontSize: CHART_FONT.axisLabel - 1,
            fontWeight: 600,
            formatter: (p: unknown) => fmtUSD((p as { value: [number, number, number] }).value[2]),
          },
          emphasis: { itemStyle: { borderColor: COLORS.text, borderWidth: 1 } },
        },
      ],
    };
  }, [rows, columns, cellTooltip, totalWord, noneWord, overWord, underWord]);

  return (
    <div role="img" aria-label={ariaLabel}>
      <EChart option={option} style={{ height: (rows.length + 1) * ROW_PX + 100 }} />
    </div>
  );
}
