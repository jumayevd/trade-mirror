"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { YearRow } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { BAR_SPEC, baseGrid, baseTooltip, catAxis, moneyAxisFormatter, valueAxis } from "@/lib/echartBase";

interface Props {
  /** Comparable channel-years only — years where BOTH sides reported. */
  years: YearRow[];
  /** The full analysis window (e.g. 2017–2024). Years absent from `years` are rendered hollow. */
  windowYears: number[];
  partner: string;
}

/**
 * Channel profile chart (spec §6.9): grouped bars — partner-reported exports (FOB,
 * orange) vs Uzbekistan-recorded imports (CIF, blue) — on a single money axis.
 * The signed discrepancy at the central freight adjustment is analytically central
 * to the channel view, so it gets its own small diverging bar chart underneath
 * (orange above zero, blue below) instead of a second axis or an overlaid line.
 * Years with no partner reference show NO bars (hollow): missing partner data is
 * never drawn as a zero flow.
 */
export default function ChannelChart({ years, windowYears, partner }: Props) {
  const byYear = new Map(years.map((r) => [r.y, r]));

  const option = useMemo<EChartsOption>(() => {
    const pe = windowYears.map((y) => byYear.get(y)?.pe ?? null);
    const ui = windowYears.map((y) => byYear.get(y)?.ui ?? null);
    const peName = `${partner} reported (exports, FOB)`;
    const uiName = "Uzbekistan recorded (imports, CIF)";
    return {
      backgroundColor: "transparent",
      grid: baseGrid,
      legend: { top: 0, textStyle: { color: COLORS.text, fontSize: 11 }, data: [peName, uiName] },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        formatter: (params: unknown) => {
          const ps = params as { axisValue: string | number; seriesName: string; value: number | null; marker: string }[];
          if (!Array.isArray(ps) || ps.length === 0) return "";
          const y = Number(ps[0].axisValue);
          const row = byYear.get(y);
          if (!row) {
            return `<strong>${y}</strong><br/>Partner data missing — the pair is not comparable this year;<br/>not treated as a zero gap.`;
          }
          const rows = ps
            .filter((p) => p.value != null)
            .map((p) => `${p.marker} ${p.seriesName}: <span style="font-family:ui-monospace,monospace">${fmtUSDFull(p.value as number)}</span>`);
          const signedColor = row.signed >= 0 ? COLORS.positive : COLORS.reverse;
          rows.push(
            `Signed discrepancy (expected CIF − UZB): <b style="color:${signedColor}">${fmtUSDFull(row.signed)}</b>`,
          );
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
          ...BAR_SPEC,
          itemStyle: {
            ...BAR_SPEC.itemStyle,
            color: COLORS.partner,
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
          barGap: "0%",
          emphasis: { focus: "series" },
        },
        {
          name: uiName,
          type: "bar",
          data: ui,
          ...BAR_SPEC,
          itemStyle: {
            ...BAR_SPEC.itemStyle,
            color: COLORS.uzb,
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
          emphasis: { focus: "series" },
        },
      ],
    };
    // byYear is derived from `years`; windowYears/partner are the remaining inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, windowYears, partner]);

  const gapOption = useMemo<EChartsOption>(() => {
    const signed = windowYears.map((y) => {
      const v = byYear.get(y)?.signed;
      if (v == null) return null;
      const r = Math.round(v);
      return {
        value: r,
        itemStyle: {
          color: r >= 0 ? COLORS.positive : COLORS.reverse,
          borderColor: COLORS.surface,
          borderWidth: 1,
          borderRadius: (r >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]) as [number, number, number, number],
        },
      };
    });
    return {
      backgroundColor: "transparent",
      grid: { ...baseGrid, top: 10, bottom: 22 },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const ps = params as { axisValue: string | number; value?: { value?: number } | number | null }[];
          if (!Array.isArray(ps) || ps.length === 0) return "";
          const y = Number(ps[0].axisValue);
          const row = byYear.get(y);
          if (!row) return `<strong>${y}</strong><br/>Not comparable — no gap computed.`;
          return `<strong>${y}</strong><br/>Signed discrepancy (expected CIF − UZB): <span style="font-weight:600">${fmtUSDFull(row.signed)}</span>`;
        },
      },
      xAxis: { ...catAxis(windowYears), axisLabel: { color: COLORS.axis, fontSize: 10 } },
      yAxis: { ...valueAxis(), axisLabel: { color: COLORS.axis, fontSize: 10, formatter: moneyAxisFormatter } },
      series: [
        {
          type: "bar",
          data: signed,
          barMaxWidth: 24,
          markLine: {
            silent: true,
            symbol: "none",
            animation: false,
            label: { show: false },
            lineStyle: { color: COLORS.neutralMid, type: "solid", width: 2 },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [years, windowYears]);

  return (
    <div className="card p-3">
      <div style={{ height: 300 }}>
        <EChart option={option} />
      </div>
      <div className="mt-1" style={{ height: 110 }}>
        <EChart option={gapOption} />
      </div>
      <p className="px-1 text-[11px] text-faint">
        Signed discrepancy (expected CIF − UZB) per year — above zero the partner reports more than
        Uzbekistan records; below zero the reverse.
      </p>
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
