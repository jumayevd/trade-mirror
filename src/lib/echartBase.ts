import type {
  TooltipComponentOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import { COLORS, fmtUSD } from "./format";

/**
 * Chart base per the dataviz mark specs, in CBU house colours (navy + gold):
 *  - gridlines: hairline (1px), SOLID, one step off the surface, recessive
 *  - axis text: neutral grey, CHART_FONT.axisLabel before the reading scale; baseline in the baseline grey
 *  - tooltip: card surface, navy-tinted hairline border, dark ink
 *  - legends: CHART_FONT.legend, top; present only for >= 2 series
 *  - bars <= 24px with 4px rounded data-end (square at baseline); lines 2px;
 *    markers >= 8px with a 2px surface ring — applied per chart
 *  - fills are SOLID: never washed out with an alpha suffix
 */
/**
 * The chart type scale, named rather than sprinkled as literals.
 *
 * Charts inherit the page's reading scale and the fluid pixel, so these are
 * declared sizes the two multiply. They sit level with the table text beside
 * the charts (13–14px at the 1:1 default): the old 17/15 was tuned while every
 * canvas label was silently drawn at 10px (see CHART_FAMILY), and once that was
 * fixed it put axis labels a third larger than the figures in the tables.
 *
 * The ordering is deliberate and is the reverse of the usual instinct. Axis
 * labels and legends are the text a reader scans, and they sit on a busy field of
 * marks and gridlines; a tooltip is text they have already pointed at, alone in
 * its own panel with nothing competing. A tooltip set level with the axis reads
 * as shouting once the scale is turned up.
 */
export const CHART_FONT = {
  axisLabel: 13,
  axisName: 12,
  legend: 13,
  tooltip: 12,
} as const;

const FALLBACK_FAMILY = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * The font family for canvas text, resolved to real names. A canvas cannot read
 * CSS variables: given "16px var(--font-geist-sans)" it rejects the whole font
 * string and draws in its default 10px sans-serif — which is how every chart
 * label used to render, whatever size it declared. The variable is read once
 * from the document (next/font sets it on <html>) and inlined.
 */
export const CHART_FAMILY = (() => {
  if (typeof document === "undefined") return FALLBACK_FAMILY;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-sans").trim();
  return v ? `${v}, ${FALLBACK_FAMILY}` : FALLBACK_FAMILY;
})();

export const moneyAxisFormatter = (v: number) => fmtUSD(v);

/**
 * Root text style every chart inherits. The fontSize matters as much as the
 * family: anything a chart does not size explicitly — series labels, axis
 * pointer labels, visualMap and dataZoom text — otherwise falls back to
 * ECharts' own built-in 12 rather than the dashboard's scale. EChart merges this
 * in as the default, so a chart gets it whether or not it spreads it itself.
 */
export const baseTextStyle = { color: COLORS.text, fontFamily: CHART_FAMILY, fontSize: CHART_FONT.legend };

export function baseTooltip(): TooltipComponentOption {
  return {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.baseline,
    borderWidth: 1,
    textStyle: { color: COLORS.text, fontSize: CHART_FONT.tooltip },
    padding: [8, 12],
    // no glide: the default 0.4s easing makes the tooltip trail the cursor,
    // which reads as lag and as pointing at the previous mark
    transitionDuration: 0,
    appendToBody: true,
    extraCssText: "border-radius:8px;box-shadow:0 6px 20px rgba(22,35,59,.12)",
  };
}

export function valueAxis(name?: string): YAXisComponentOption {
  return {
    type: "value",
    name,
    nameTextStyle: { color: COLORS.axis, fontSize: CHART_FONT.axisName },
    axisLabel: { color: COLORS.axis, fontSize: CHART_FONT.axisLabel, formatter: (v: number) => fmtUSD(v) },
    splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
    axisLine: { show: false },
  };
}

export function catAxis(data: (string | number)[]): XAXisComponentOption {
  return {
    type: "category",
    data,
    axisLabel: { color: COLORS.axis, fontSize: CHART_FONT.axisLabel },
    axisLine: { lineStyle: { color: COLORS.baseline, width: 1 } },
    axisTick: { show: false },
  };
}

/** Shared mark specs — spread into series definitions. */
export const BAR_SPEC = {
  barMaxWidth: 24,
  itemStyle: { borderRadius: [4, 4, 0, 0] as [number, number, number, number] },
} as const;

export const LINE_SPEC = {
  lineStyle: { width: 2 },
  symbolSize: 8,
  // 2px surface ring keeps markers legible where they cross lines
  itemStyle: { borderColor: COLORS.surface, borderWidth: 2 },
} as const;

export const baseGrid = { left: 56, right: 20, top: 36, bottom: 36, containLabel: true };

export const TRANSPARENT = "transparent";
