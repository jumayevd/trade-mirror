"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { PartnerAgg } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { BAR_SPEC, baseGrid, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

/**
 * Partner profile chart (spec §6.6.4): per-year grouped bars of partner-reported
 * exports (orange, FOB) vs Uzbekistan-recorded imports (blue, CIF). The positive
 * and reverse discrepancies per year live in the tooltip — never as extra series.
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
  const reported = useMemo(() => byYear.filter((y) => y.reported), [byYear]);
  const missing = useMemo(() => byYear.filter((y) => !y.reported).map((y) => y.year), [byYear]);

  const ptnLabel = `${partner} reported exports (FOB)`;
  const uzbLabel = "Uzbekistan recorded imports (CIF)";

  const option = useMemo<EChartsOption>(() => {
    const years = reported.map((y) => y.year);
    const rowByYear = new Map(reported.map((y) => [String(y.year), y]));
    return {
      backgroundColor: "transparent",
      grid: { ...baseGrid, top: 44 },
      legend: {
        top: 0,
        textStyle: { color: COLORS.text, fontSize: 11 },
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
            const v = typeof it.value === "number" ? fmtUSDFull(it.value) : "not reported";
            return `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${v}</span></div>`;
          });
          const row = rowByYear.get(year);
          const gapLines = row
            ? `<div style="margin-top:4px;color:${COLORS.text}">Positive discrepancy: <b style="color:${COLORS.positive}">${fmtUSDFull(Math.round(row.positive))}</b></div>` +
              `<div style="margin-top:2px;color:${COLORS.text}">Reverse discrepancy: <b style="color:${COLORS.reverse}">${fmtUSDFull(Math.round(row.reverse))}</b></div>`
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
  }, [reported, ptnLabel, uzbLabel]);

  if (reported.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-muted">
        {partner} did not report to UN Comtrade in any year of the selected window, so no
        mirror comparison can be drawn. Missing partner data is a data limitation — it is
        not treated as a zero gap.
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
          Not drawn: {missing.join(", ")} — {partner} did not report to UN Comtrade in{" "}
          {missing.length === 1 ? "that year" : "those years"}, so there is no mirror
          reference and no discrepancy is computed; missing partner data is not treated as a
          zero gap. Source: UN Comtrade.
        </p>
      )}
    </div>
  );
}
