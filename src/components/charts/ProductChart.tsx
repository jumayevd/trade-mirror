"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { Product } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { baseGrid, baseTooltip, baseTextStyle, catAxis, valueAxis } from "@/lib/echartBase";

/**
 * Annual reported-vs-recorded chart for one HS6 product (spec §6.8).
 * Amber bars = partner-reported exports (FOB); blue bars = Uzbekistan-recorded
 * imports (CIF); dashed line = signed CIF-adjusted gap (can be negative). Years
 * are drawn only where the underlying product file has data.
 */
export default function ProductChart({ product }: { product: Product }) {
  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: baseGrid,
      legend: {
        top: 0,
        textStyle: { color: COLORS.text, fontSize: 11 },
        data: ["Partner-reported exports (FOB)", "Uzbekistan-recorded imports (CIF)", "CIF-adjusted gap (signed)"],
      },
      tooltip: { ...baseTooltip(), trigger: "axis", valueFormatter: (v: unknown) => fmtUSDFull(Number(v ?? 0)) },
      xAxis: catAxis(product.byYear.map((y) => y.y)),
      yAxis: valueAxis("USD"),
      series: [
        {
          name: "Partner-reported exports (FOB)",
          type: "bar",
          data: product.byYear.map((y) => Math.round(y.pe)),
          itemStyle: { color: COLORS.partner, borderRadius: [2, 2, 0, 0] },
          barGap: "-10%",
          barMaxWidth: 32,
        },
        {
          name: "Uzbekistan-recorded imports (CIF)",
          type: "bar",
          data: product.byYear.map((y) => Math.round(y.ui)),
          itemStyle: { color: COLORS.uzb, borderRadius: [2, 2, 0, 0] },
          barMaxWidth: 32,
        },
        {
          name: "CIF-adjusted gap (signed)",
          type: "line",
          smooth: true,
          data: product.byYear.map((y) => Math.round(y.gap)),
          itemStyle: { color: COLORS.text },
          lineStyle: { color: COLORS.text, width: 2, type: "dashed" },
          symbol: "circle",
          symbolSize: 4,
        },
      ],
    }),
    [product],
  );
  return (
    <div className="card p-3" style={{ height: 340 }}>
      <EChart option={option} />
    </div>
  );
}
