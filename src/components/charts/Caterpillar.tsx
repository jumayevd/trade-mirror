"use client";

import { useMemo } from "react";
import type {
  CustomSeriesRenderItemAPI, CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn, EChartsOption,
} from "echarts";
import EChart from "@/components/EChart";
import type { Cluster } from "@/lib/anomaly";
import { COLORS } from "@/lib/format";
import { CHART_FONT, baseGrid, baseTextStyle, baseTooltip } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Caterpillar plot — the centrepiece of the section. Clusters run left to right
 * by score, each drawn with its 90% posterior interval, and the threshold sits
 * across them as a line. The point of the shape is what a ranked table hides:
 * where the intervals overlap, the order between those clusters carries no
 * information, and only the handful whose whole interval clears the line are
 * distinguishable from ordinary variation.
 *
 * Intervals are drawn with a custom series rather than an error-bar overlay so
 * that one interval is one mark — the ranking is dense, and stacked candlesticks
 * would misread as a distribution.
 */
export interface CaterpillarLabels {
  score: string;
  interval: string;
  obs: string;
  threshold: string;
  tier: (tier: number) => string;
}

/**
 * Built outside the component so scripts/audit-chart-text.ts can render the real
 * option through ECharts rather than a copy of it.
 */
export function caterpillarOption(
  clusters: Pick<Cluster, "partner" | "code" | "label" | "uHat" | "lo90" | "postSd" | "nObs" | "tier">[],
  threshold: number,
  labels: CaterpillarLabels,
): EChartsOption {
  // ECharts renders a custom series against numeric axes; the index is the x.
    const bars = clusters.map((c, i) => [i, c.lo90, c.uHat + 1.645 * c.postSd, c.uHat, c.tier]);
    const tierColor = (tier: number) =>
      tier === 1 ? COLORS.investigate : tier === 2 ? COLORS.accent : COLORS.transit;

  return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, left: 60, right: 24, top: 28, bottom: 40 },
      tooltip: {
        ...baseTooltip(),
        formatter: (p: unknown) => {
          const d = (p as { data: number[] }).data;
          const c = clusters[d[0]];
          if (!c) return "";
          return (
            `<b>${c.partner} &times; ${c.code}</b><br/>${c.label}<br/>` +
            `${labels.score} ${Math.exp(c.uHat).toFixed(2)}×<br/>` +
            `${labels.interval} ${Math.exp(c.lo90).toFixed(2)}× – ` +
            `${Math.exp(c.uHat + 1.645 * c.postSd).toFixed(2)}×<br/>` +
            `${labels.obs} ${c.nObs} &middot; ${labels.tier(c.tier)}`
          );
        },
      },
      xAxis: {
        type: "value",
        min: -0.5,
        max: clusters.length - 0.5,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: COLORS.grid } },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        name: labels.score,
        nameTextStyle: { color: COLORS.axis, fontSize: CHART_FONT.axisName },
        // The model works in log points; a reader does not. The axis is still
        // linear in logs - which is what makes the intervals symmetric - but it
        // is labelled in the multiples the rest of the page uses.
        axisLabel: {
          color: COLORS.text,
          fontSize: CHART_FONT.axisLabel,
          formatter: (v: number) => `${Math.exp(v).toFixed(1)}×`,
        },
        splitLine: { lineStyle: { color: COLORS.grid, type: "dashed" } },
      },
      series: [
        {
          type: "custom",
          // one vertical whisker per cluster, plus a dot at the point estimate
          renderItem: (_params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI): CustomSeriesRenderItemReturn => {
            const num = (d: number) => api.value(d) as number;
            const i = num(0);
            const lo = api.coord([i, num(1)]);
            const hi = api.coord([i, num(2)]);
            const mid = api.coord([i, num(3)]);
            const color = tierColor(num(4));
            return {
              type: "group",
              children: [
                {
                  type: "line",
                  shape: { x1: lo[0], y1: lo[1], x2: hi[0], y2: hi[1] },
                  style: api.style({ stroke: color, lineWidth: 1, fill: undefined }),
                },
                {
                  type: "circle",
                  shape: { cx: mid[0], cy: mid[1], r: 1.6 },
                  style: api.style({ fill: color, stroke: undefined }),
                },
              ],
            };
          },
          encode: { x: 0, y: [1, 2, 3] },
          clip: true,
          data: bars,
          markLine: {
            silent: true,
            symbol: "none",
            label: {
              formatter: `${labels.threshold} ${Math.exp(threshold).toFixed(2)}×`,
              color: COLORS.axis,
              fontSize: CHART_FONT.axisLabel,
              position: "insideEndTop",
            },
            lineStyle: { color: COLORS.investigate, type: "dashed", width: 1 },
            data: [{ yAxis: threshold }],
          },
        },
      ],
  } as EChartsOption;
}

export default function Caterpillar({ clusters, threshold }: { clusters: Cluster[]; threshold: number }) {
  const { t } = useI18n();
  const option = useMemo(
    () => caterpillarOption(clusters, threshold, {
      score: t("anom.th.uhat"),
      interval: t("anom.th.interval"),
      obs: t("anom.th.n"),
      threshold: t("anom.cat.threshold"),
      tier: (tier) => t(`anom.tier.${tier}` as never),
    }),
    [clusters, threshold, t],
  );

  return (
    <div className="card p-3" style={{ height: 380 }}>
      <EChart option={option} />
    </div>
  );
}
