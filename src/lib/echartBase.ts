import type {
  TooltipComponentOption,
  XAXisComponentOption,
  YAXisComponentOption,
} from "echarts";
import { COLORS, fmtUSD } from "./format";

export const moneyAxisFormatter = (v: number) => fmtUSD(v);

export const baseTextStyle = { color: COLORS.text, fontFamily: "var(--font-geist-sans)" };

export function baseTooltip(): TooltipComponentOption {
  return {
    backgroundColor: "#ffffff",
    borderColor: COLORS.grid,
    borderWidth: 1,
    textStyle: { color: "#16241b", fontSize: 12 },
    padding: [8, 12],
    extraCssText: "border-radius:8px;box-shadow:0 4px 16px rgba(22,36,27,.12)",
  };
}

export function valueAxis(name?: string): YAXisComponentOption {
  return {
    type: "value",
    name,
    nameTextStyle: { color: COLORS.axis },
    axisLabel: { color: COLORS.axis, formatter: (v: number) => fmtUSD(v) },
    splitLine: { lineStyle: { color: COLORS.grid } },
    axisLine: { show: false },
  };
}

export function catAxis(data: (string | number)[]): XAXisComponentOption {
  return {
    type: "category",
    data,
    axisLabel: { color: COLORS.axis },
    axisLine: { lineStyle: { color: COLORS.grid } },
    axisTick: { show: false },
  };
}

export const baseGrid = { left: 56, right: 20, top: 36, bottom: 36, containLabel: true };

export const TRANSPARENT = "transparent";
