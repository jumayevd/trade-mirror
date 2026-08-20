import type {
  TooltipComponentOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import { COLORS, fmtUSD } from "./format";

/**
 * Chart base per the dataviz mark specs, in CBU house colours (navy + gold):
 *  - gridlines: hairline (1px), SOLID, one step off the surface, recessive
 *  - axis text: neutral grey, 12px; baseline in the baseline grey
 *  - tooltip: card surface, navy-tinted hairline border, dark ink
 *  - legends: 12px, top; present only for >= 2 series
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
 */
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

export const baseTextStyle = { color: COLORS.text, fontFamily: "var(--font-geist-sans)" };

export function baseTooltip(): TooltipComponentOption {
  return {
    backgroundColor: COLORS.surface,
    borderColor: "rgba(22,35,59,0.16)",
    borderWidth: 1,
    textStyle: { color: "#141a26", fontSize: 13 },
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
    nameTextStyle: { color: COLORS.axis, fontSize: 11 },
    axisLabel: { color: COLORS.axis, fontSize: 12, formatter: (v: number) => fmtUSD(v) },
    splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
    axisLine: { show: false },
  };
}

export function catAxis(data: (string | number)[]): XAXisComponentOption {
  return {
    type: "category",
    data,
    axisLabel: { color: COLORS.axis, fontSize: 12 },
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
