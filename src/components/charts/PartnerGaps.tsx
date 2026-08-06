"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { PartnerAgg } from "@/lib/dataset";
import { COLORS, fmtUSD } from "@/lib/format";
import { baseGrid, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";

/**
 * Partner profile chart (spec §6.6.4): per-year grouped bars of partner-reported
 * exports (amber, FOB) vs Uzbekistan-recorded imports (blue, CIF), overlaid with
 * the positive (amber dashed) and reverse (blue dashed) discrepancy lines.
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
  const posLabel = "Positive discrepancy (partner > UZB)";
  const revLabel = "Reverse discrepancy (UZB > partner)";

  const option = useMemo<EChartsOption>(() => {
    const years = reported.map((y) => y.year);
    return {
      backgroundColor: "transparent",
      grid: { ...baseGrid, top: 56 },
      legend: {
        top: 4,
        textStyle: { color: COLORS.text, fontSize: 11 },
        itemWidth: 14,
        data: [ptnLabel, uzbLabel, posLabel, revLabel],
      },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        valueFormatter: (v: unknown) => (typeof v === "number" ? fmtUSD(v) : String(v ?? "")),
      },
      xAxis: catAxis(years),
      yAxis: valueAxis(),
      series: [
        {
          name: ptnLabel,
          type: "bar",
          data: reported.map((y) => Math.round(y.pe)),
          itemStyle: { color: COLORS.partner, borderRadius: [3, 3, 0, 0] },
          barGap: "10%",
        },
        {
          name: uzbLabel,
          type: "bar",
          data: reported.map((y) => Math.round(y.ui)),
          itemStyle: { color: COLORS.uzb, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: posLabel,
          type: "line",
          data: reported.map((y) => Math.round(y.positive)),
          itemStyle: { color: COLORS.positive },
          lineStyle: { width: 2, type: "dashed", color: COLORS.positive },
          symbol: "circle",
          symbolSize: 5,
        },
        {
          name: revLabel,
          type: "line",
          data: reported.map((y) => Math.round(y.reverse)),
          itemStyle: { color: COLORS.reverse },
          lineStyle: { width: 2, type: "dashed", color: COLORS.reverse },
          symbol: "circle",
          symbolSize: 5,
        },
      ],
    };
  }, [reported, ptnLabel, uzbLabel, posLabel, revLabel]);

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
      <div className="card p-3" style={{ height: 360 }}>
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
