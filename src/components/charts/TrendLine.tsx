"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { EmptyState } from "@/components/ui";
import { periodLabel, trendSeries } from "@/lib/anomaly";
import { COLORS, fmtUSD } from "@/lib/format";
import { CHART_FONT, LINE_SPEC, baseGrid, baseTooltip, catAxis, valueAxis } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Monthly unexplained gap for one partner or chapter — the only place the
 * monthly books are read. Shipping lag puts a January departure in Uzbekistan's
 * February or March record, so a single month is not a reading; the line is here
 * for its shape. Values arrive in USD millions from the precomputed layer.
 */
export default function TrendLine({
  kind,
  seriesKey,
}: {
  kind: "partners" | "chapters";
  seriesKey: string;
}) {
  const { t } = useI18n();
  const data = useMemo(() => trendSeries(kind, seriesKey), [kind, seriesKey]);

  const option = useMemo<EChartsOption>(() => {
    if (!data) return {};
    return {
      backgroundColor: "transparent",
      grid: { ...baseGrid, top: 24 },
      tooltip: {
        ...baseTooltip(),
        formatter: (params: unknown) => {
          const arr = params as { name: string; value: number }[];
          const p = arr[0];
          if (!p) return "";
          return `${p.name}<br/><b>${fmtUSD(p.value * 1e6)}</b>`;
        },
      },
      xAxis: catAxis(data.p.map(periodLabel)),
      yAxis: {
        ...valueAxis(t("anom.trend.axis")),
        axisLabel: { color: COLORS.text, fontSize: CHART_FONT.axisLabel },
      },
      series: [
        {
          ...LINE_SPEC,
          type: "line",
          name: seriesKey,
          data: data.v,
          itemStyle: { color: COLORS.positive },
          lineStyle: { color: COLORS.positive, width: 2 },
          areaStyle: { color: COLORS.positive, opacity: 0.08 },
        },
      ],
    };
  }, [data, seriesKey, t]);

  if (!data) return <EmptyState />;
  return (
    <div className="card p-3" style={{ height: 300 }}>
      <EChart option={option} />
    </div>
  );
}
