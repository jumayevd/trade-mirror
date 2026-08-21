/**
 * What size does chart text actually render at?
 *
 * Chart text is drawn into a canvas, so it cannot be read from the DOM and it
 * appears in no HTML snapshot — which is why "the labels are still small" went
 * four rounds without being checkable. ECharts can render the same option tree
 * server-side to SVG, where every string carries its resolved font-size, so this
 * renders the real options and reports what the reader will actually see.
 *
 * Charts inherit the page's reading scale, so the screen size of a label is the
 * size ECharts resolves multiplied by that scale. The tooltip is a DOM element
 * and never reaches the SVG, so it is asserted directly against the same scale —
 * the point being that both now live in one coordinate space, which is what
 * stops the tooltip drifting larger than the axis.
 *
 * Run with: npm run audit:charts
 */
import * as echarts from "echarts";
import {
  baseGrid, baseTextStyle, baseTooltip, catAxis, CHART_FONT, valueAxis,
} from "@/lib/echartBase";
import { COLORS } from "@/lib/format";
import { caterpillarOption } from "@/components/charts/Caterpillar";
import type { Tier } from "@/lib/anomaly";
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

/** Font sizes ECharts resolved, largest first, with how many strings carry each. */
function resolvedSizes(option: object): [number, number][] {
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

/*
 * The caterpillar plot draws one custom-series mark per cluster, so it is the one
 * chart whose renderItem can fail at runtime without failing the type check.
 * Rendering it here proves the series definition is valid ECharts and that its
 * text obeys the same scale as every other chart.
 */
function caterpillarSample() {
  const clusters = Array.from({ length: 40 }, (_, i) => ({
    partner: `Partner ${i}`, code: String(1000 + i), label: `Product ${i}`,
    uHat: 1.2 - i * 0.03, lo90: 0.9 - i * 0.03, postSd: 0.18, nObs: 3 + (i % 5),
    tier: (i < 3 ? 1 : i < 10 ? 2 : 0) as Tier,
  }));
  return caterpillarOption(clusters, 0.45, {
    score: "Score", interval: "90% interval", obs: "Obs", threshold: "Threshold",
    tier: (x) => ["Not flagged", "Confirmed", "Provisional", "Suppressed"][x] ?? "",
  });
}

const cat = resolvedSizes(caterpillarSample());
console.log(`caterpillar plot: rendered, resolved sizes ` +
  cat.map(([px, k]) => `${px}px x${k}`).join(", "));
if (cat.length === 0) {
  console.log("  WRONG: the custom series produced no text at all");
  process.exitCode = 1;
}

const declared = resolvedSizes(dynamicsOption());
console.log("declared chart scale:", JSON.stringify(CHART_FONT));
console.log("\nresolved by ECharts (declared, before the reading scale):");
console.log("  " + declared.map(([px, n]) => `${px}px x${n}`).join(", "));

console.log("\nscreen size per reading step — canvas text inherits the page zoom:");
for (const zoom of ZOOM_STEPS) {
  const tag = zoom === DEFAULT_ZOOM ? " (default)" : "";
  const shown = declared.map(([px, n]) => `${(px * zoom).toFixed(1)}px x${n}`).join(", ");
  console.log(`  zoom ${zoom}${tag}  ->  ${shown}`);
}

// the tooltip is a DOM element, so it never reaches the SVG — assert it directly
const tip = baseTooltip().textStyle as { fontSize: number };
const axisScreen = CHART_FONT.axisLabel * DEFAULT_ZOOM;
const tipScreen = tip.fontSize * DEFAULT_ZOOM;
console.log(`\nat the default step:`);
console.log(`  axis label  ${CHART_FONT.axisLabel} declared -> ${axisScreen.toFixed(1)} screen px`);
console.log(`  tooltip     ${tip.fontSize} declared -> ${tipScreen.toFixed(1)} screen px`);
const ok = axisScreen > tipScreen;
console.log(`  axis is ${(axisScreen / tipScreen).toFixed(2)}x the tooltip` +
  (ok ? " — correct: the label a reader scans is larger than the panel they pointed at"
      : " — WRONG WAY ROUND"));
if (!ok) process.exitCode = 1;
