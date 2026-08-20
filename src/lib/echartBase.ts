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
 *  - legends: 13px, top; present only for >= 2 series
 *  - bars <= 24px with 4px rounded data-end (square at baseline); lines 2px;
 *    markers >= 8px with a 2px surface ring — applied per chart
 *  - fills are SOLID: never washed out with an alpha suffix
 */
/**
 * Chart text has to be scaled by hand.
 *
 * `.chart-frame` cancels the page zoom so the canvas and ECharts' pointer maths
 * share one coordinate system. That also means one CSS pixel inside a chart is
 * one on-screen pixel, while the same declaration in the surrounding page is
 * multiplied by the reading scale — so an 11px axis label sat at 11 real pixels
 * next to body text rendered at 16. Every fontSize in the option tree is
 * multiplied here instead, at one choke point, so charts track the header's
 * text-size control without each chart knowing about it.
 *
 * Formatters and other functions are passed through by reference: `typeof fn`
 * is neither "object" nor an array, so they fall straight through.
 *
 * CHART_TEXT_BOOST sets chart text a step ABOVE the surrounding prose rather
 * than level with it: axis labels and legends are scanned at a glance, from
 * further back than body copy, and they sit on a busy field of marks and
 * gridlines rather than on clean paper.
 */
export const CHART_TEXT_BOOST = 1.15;

/**
 * The chart type scale, named rather than sprinkled as literals.
 *
 * Axis labels and legends are the text a reader scans; the tooltip is text they
 * have already pointed at, and it arrives in a panel of its own with nothing
 * competing. So the axis is the largest step here and the tooltip the smallest —
 * the reverse of the usual instinct, and deliberately so, because a tooltip set
 * level with the axis reads as shouting once the reading scale is turned up.
 */
export const CHART_FONT = {
  axisLabel: 15,
  axisName: 14,
  legend: 14,
  tooltip: 11,
} as const;

export function scaleFonts<T>(node: T, k: number): T {
  if (Array.isArray(node)) return node.map((v) => scaleFonts(v, k)) as unknown as T;
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
      out[key] = key === "fontSize" && typeof val === "number" ? val * k : scaleFonts(val, k);
    }
    return out as unknown as T;
  }
  return node;
}

export const moneyAxisFormatter = (v: number) => fmtUSD(v);

/**
 * Root text style every chart inherits. The fontSize matters as much as the
 * family: anything a chart does not size explicitly — series labels, axis
 * pointer labels, visualMap and dataZoom text — otherwise falls back to
 * ECharts' own built-in 12, which never passes through the reading scale and so
 * stayed at 12 real pixels no matter what the reader chose. EChart merges this
 * in as the default, so a chart gets it whether or not it spreads it itself.
 */
export const baseTextStyle = { color: COLORS.text, fontFamily: "var(--font-geist-sans)", fontSize: CHART_FONT.legend };

export function baseTooltip(): TooltipComponentOption {
  return {
    backgroundColor: COLORS.surface,
    borderColor: "rgba(22,35,59,0.16)",
    borderWidth: 1,
    textStyle: { color: "#141a26", fontSize: CHART_FONT.tooltip },
    padding: [8, 12],
    // no glide: the default 0.4s easing makes the tooltip trail the cursor,
    // which reads as lag and as pointing at the previous mark
    transitionDuration: 0,
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
