/**
 * What size does chart text actually render at?
 *
 * Chart text is drawn into a canvas, so it cannot be measured from the DOM and
 * it does not appear in any HTML snapshot — which made three rounds of "the
 * labels are still small" impossible to check by inspection. ECharts can render
 * the same option tree server-side to SVG, where every string carries its
 * resolved font-size, so this renders the real option through the real scaler
 * and reports what the reader will see.
 *
 * Run with: npx tsx scripts/audit-chart-text.ts
 */
import * as echarts from "echarts";
import {
  baseGrid, baseTextStyle, baseTooltip, catAxis, CHART_FONT, CHART_TEXT_BOOST, scaleFonts, valueAxis,
} from "@/lib/echartBase";
import { COLORS } from "@/lib/format";
import { ZOOM_STEPS, DEFAULT_ZOOM } from "@/lib/zoom-store";

/** The Executive Overview dynamics chart, built the way the page builds it. */
function dynamicsOption() {
  return {
    backgroundColor: "transparent",
    textStyle: baseTextStyle,
    grid: { ...baseGrid, top: 40, right: 48 },
    legend: { top: 4, textStyle: { color: COLORS.text, fontSize: CHART_FONT.legend } },
    tooltip: baseTooltip(),
    xAxis: catAxis([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]),
    yAxis: [
      valueAxis("USD"),
      {
        type: "value",
        name: "Percent share of gap",
        nameTextStyle: { color: COLORS.axis, fontSize: CHART_FONT.axisName },
        axisLabel: { color: COLORS.axis, fontSize: CHART_FONT.axisLabel },
      },
    ],
    series: [
      { name: "Positive discrepancy", type: "line", yAxisIndex: 0, data: [3.1e9, 3.3e9, 3.3e9, 3.9e9, 5.0e9, 6.6e9, 8.3e9, 6.1e9] },
      { name: "Percent share of gap", type: "line", yAxisIndex: 1, data: [0.31, 0.26, 0.26, 0.27, 0.26, 0.32, 0.33, 0.26] },
    ],
  };
}

/** Font sizes ECharts emitted, largest first, with how many strings carry each. */
function emitted(option: object): [number, number][] {
  const chart = echarts.init(null as never, undefined, { renderer: "svg", ssr: true, width: 1000, height: 320 });
  chart.setOption(option as echarts.EChartsOption);
  const svg = chart.renderToSVGString();
  chart.dispose();
  const counts = new Map<number, number>();
  for (const m of svg.matchAll(/font-size(?::|=")\s*([0-9.]+)/g)) {
    const px = Number(m[1]);
    counts.set(px, (counts.get(px) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[0] - a[0]);
}

console.log("declared chart scale:", JSON.stringify(CHART_FONT), `boost x${CHART_TEXT_BOOST}`);
console.log("\nrendered font sizes per reading step (canvas text, real pixels):");
for (const zoom of ZOOM_STEPS) {
  const k = zoom * CHART_TEXT_BOOST;
  const rows = emitted(scaleFonts({ ...dynamicsOption(), textStyle: { ...baseTextStyle } }, k));
  const tag = zoom === DEFAULT_ZOOM ? " (default)" : "";
  console.log(`  zoom ${zoom}${tag}  scale x${k.toFixed(4)}  ->  ` +
    rows.map(([px, n]) => `${px}px x${n}`).join(", "));
}

// the tooltip is DOM, not canvas, so it never reaches the SVG — assert it directly
const k = DEFAULT_ZOOM * CHART_TEXT_BOOST;
const scaledTip = scaleFonts(baseTooltip(), k) as { textStyle: { fontSize: number } };
const axisReal = CHART_FONT.axisLabel * k;
const tipReal = scaledTip.textStyle.fontSize;
console.log(`\nat the default step:`);
console.log(`  axis label  ${CHART_FONT.axisLabel} declared -> ${axisReal.toFixed(1)} real px`);
console.log(`  tooltip     ${CHART_FONT.tooltip} declared -> ${tipReal.toFixed(1)} real px`);
console.log(`  axis is ${(axisReal / tipReal).toFixed(2)}x the tooltip` +
  (axisReal > tipReal ? " — correct: the label a reader scans is larger than the panel they pointed at"
                      : " — WRONG WAY ROUND"));
if (axisReal <= tipReal) process.exitCode = 1;
