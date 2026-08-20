"use client";

import { useMemo } from "react";
import { useI18n } from "@/lib/i18n";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { Product } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { BAR_SPEC, baseGrid, baseTooltip, baseTextStyle, catAxis, moneyAxisFormatter, valueAxis } from "@/lib/echartBase";

/**
 * Annual reported-vs-recorded chart for one HS6 product (spec §6.8).
 * Orange bars = partner-reported exports (FOB); blue bars = Uzbekistan-recorded
 * imports (CIF) — both on one money axis. The signed CIF-adjusted gap is central
 * to the product view, so it is rendered as a small diverging bar chart underneath
 * (orange above zero, blue below) and repeated in the tooltip — never as an
 * overlaid line or a second axis. Years are drawn only where the underlying
 * product file has data.
 */
export default function ProductChart({ product }: { product: Product }) {
  const { t } = useI18n();
  const ptnName = t("ctry.partnerExportsFob");
  const uzbName = t("ctry.uzbImportsCif");
  const gapName = t("pchart.gapSigned");
  const option = useMemo<EChartsOption>(() => {
    const gapByYear = new Map(product.byYear.map((y) => [String(y.y), y.gap]));
    return {
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: baseGrid,
      legend: {
        top: 0,
        textStyle: { color: COLORS.text, fontSize: 11 },
        data: [ptnName, uzbName],
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
          const lines = items.map(
            (it) =>
              `<div style="margin-top:2px">${it.marker ?? ""}${it.seriesName}: <span style="font-weight:600">${fmtUSDFull(Number(it.value ?? 0))}</span></div>`,
          );
          const gap = gapByYear.get(year);
          const gapLine =
            gap !== undefined
              ? `<div style="margin-top:4px;color:${COLORS.text}">${gapName}: <b style="color:${gap >= 0 ? COLORS.positive : COLORS.reverse}">${fmtUSDFull(Math.round(gap))}</b></div>`
              : "";
          return head + lines.join("") + gapLine;
        },
      },
      xAxis: catAxis(product.byYear.map((y) => y.y)),
      yAxis: valueAxis("USD"),
      series: [
        {
          name: ptnName,
          type: "bar",
          data: product.byYear.map((y) => Math.round(y.pe)),
          ...BAR_SPEC,
          itemStyle: {
            ...BAR_SPEC.itemStyle,
            color: COLORS.partner,
            borderColor: COLORS.surface,
            borderWidth: 1,
          },
          barGap: "0%",
        },
        {
          name: uzbName,
          type: "bar",
          data: product.byYear.map((y) => Math.round(y.ui)),
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
  }, [product, ptnName, uzbName, gapName]);

  const gapOption = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { ...baseGrid, top: 10, bottom: 22 },
      tooltip: {
        ...baseTooltip(),
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const ps = params as { axisValue: string | number; dataIndex: number }[];
          if (!Array.isArray(ps) || ps.length === 0) return "";
          const row = product.byYear[ps[0].dataIndex];
          if (!row) return "";
          return `<strong>${row.y}</strong><br/>${gapName}: <span style="font-weight:600">${fmtUSDFull(Math.round(row.gap))}</span>`;
        },
      },
      xAxis: { ...catAxis(product.byYear.map((y) => y.y)), axisLabel: { color: COLORS.axis, fontSize: 11 } },
      yAxis: { ...valueAxis(), axisLabel: { color: COLORS.axis, fontSize: 11, formatter: moneyAxisFormatter } },
      series: [
        {
          type: "bar",
          data: product.byYear.map((y) => {
            const v = Math.round(y.gap);
            return {
              value: v,
              itemStyle: {
                color: v >= 0 ? COLORS.positive : COLORS.reverse,
                borderColor: COLORS.surface,
                borderWidth: 1,
                borderRadius: (v >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4]) as [number, number, number, number],
              },
            };
          }),
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
    }),
    [product, gapName],
  );

  return (
    <div className="card p-3">
      <div style={{ height: 300 }}>
        <EChart option={option} />
      </div>
      <div className="mt-1" style={{ height: 110 }}>
        <EChart option={gapOption} />
      </div>
      <p className="px-1 text-[11px] text-faint">
        {t("pchart.caption")}
      </p>
    </div>
  );
}
