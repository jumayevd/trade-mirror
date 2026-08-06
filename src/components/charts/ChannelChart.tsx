"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { YearRow } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { baseGrid, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

interface Props {
  /** Comparable channel-years only — years where BOTH sides reported. */
  years: YearRow[];
  /** The full analysis window (e.g. 2017–2024). Years absent from `years` are rendered hollow. */
  windowYears: number[];
  partner: string;
}

/**
 * Channel profile chart (spec §6.9): grouped bars — partner-reported exports (FOB, amber)
 * vs Uzbekistan-recorded imports (CIF, blue) — plus a dashed signed-discrepancy line at the
 * central freight adjustment. Years with no partner reference show NO bars (hollow): missing
 * partner data is never drawn as a zero flow.
 */
export default function ChannelChart({ years, windowYears, partner }: Props) {
  const byYear = new Map(years.map((r) => [r.y, r]));

  const option = useMemo<EChartsOption>(() => {
    const pe = windowYears.map((y) => byYear.get(y)?.pe ?? null);
    const ui = windowYears.map((y) => byYear.get(y)?.ui ?? null);
    const signed = windowYears.map((y) => byYear.get(y)?.signed ?? null);
    const peName = `${partner} reported (exports, FOB)`;
    const uiName = "Uzbekistan recorded (imports, CIF)";
    const sgName = "Signed discrepancy (expected CIF − UZB)";
    return {
      backgroundColor: "transparent",
      grid: baseGrid,
      legend: { top: 0, textStyle: { color: COLORS.text, fontSize: 11 }, data: [peName, uiName, sgName] },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        formatter: (params: unknown) => {
          const ps = params as { axisValue: string | number; seriesName: string; value: number | null; marker: string }[];
          if (!Array.isArray(ps) || ps.length === 0) return "";
          const y = Number(ps[0].axisValue);
          if (!byYear.has(y)) {
            return `<strong>${y}</strong><br/>Partner data missing — the pair is not comparable this year;<br/>not treated as a zero gap.`;
          }
          const rows = ps
            .filter((p) => p.value != null)
            .map((p) => `${p.marker} ${p.seriesName}: <span style="font-family:ui-monospace,monospace">${fmtUSDFull(p.value as number)}</span>`);
          return [`<strong>${y}</strong>`, ...rows].join("<br/>");
        },
      },
      xAxis: catAxis(windowYears),
      yAxis: valueAxis("USD"),
      series: [
        {
          name: peName,
          type: "bar",
          data: pe,
          itemStyle: { color: COLORS.partner, borderRadius: [2, 2, 0, 0] },
          barMaxWidth: 32,
          barGap: "-8%",
          emphasis: { focus: "series" },
        },
        {
          name: uiName,
          type: "bar",
          data: ui,
          itemStyle: { color: COLORS.uzb, borderRadius: [2, 2, 0, 0] },
          barMaxWidth: 32,
          emphasis: { focus: "series" },
        },
        {
          name: sgName,
          type: "line",
          data: signed,
          connectNulls: false,
          itemStyle: { color: COLORS.text },
          lineStyle: { width: 2, type: "dashed", color: COLORS.text },
          symbol: "circle",
          symbolSize: 4,
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: COLORS.grid, type: "solid" },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
    // byYear is derived from `years`; windowYears/partner are the remaining inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, windowYears, partner]);

  return (
    <div className="card p-3">
      <div style={{ height: 320 }}>
        <EChart option={option} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-border-soft)] px-1 pt-2 text-[11px]">
        {windowYears.map((y) => {
          const has = byYear.has(y);
          return (
            <span
              key={y}
              className="tabular rounded border px-1.5 py-0.5"
              style={{
                borderColor: has ? "color-mix(in srgb, var(--color-ok) 45%, transparent)" : "var(--color-border)",
                borderStyle: has ? "solid" : "dashed",
                color: has ? "var(--color-foreground)" : "var(--color-faint)",
                background: has ? "color-mix(in srgb, var(--color-ok) 8%, transparent)" : "transparent",
              }}
              title={has ? `${y}: both sides reported — comparable` : `${y}: partner data missing — not comparable, no gap computed`}
            >
              {has ? "●" : "○"} {y}
            </span>
          );
        })}
        <span className="ml-2 text-faint">
          Hollow years have no partner reference: the pair is not comparable there and no discrepancy is computed — missing data is never treated as a zero gap.
        </span>
      </div>
    </div>
  );
}
