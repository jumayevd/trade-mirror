"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { EmptyState } from "@/components/ui";
import { CLASS_LABELS, type Channel, type Filter, type SignalClass } from "@/lib/dataset";
import { CLASS_COLORS, COLORS, fmtUSDFull } from "@/lib/format";
import { baseTooltip } from "@/lib/echartBase";

/**
 * Analytic risk matrix (spec §6.3, primary view of the Risk Map page).
 * X = evidence quality (0–100), Y = anomaly strength (0–100), bubble area ∝ |value
 * in the active direction|, colour = signal class. Quadrant guides mirror the
 * classification thresholds (E = 60, A = 55) documented in the Methodology.
 * Colour encodes screening priority — never wrongdoing.
 */

const A_THRESHOLD = 55;
const E_THRESHOLD = 60;
const CLS_ORDER: SignalClass[] = ["investigate", "verify", "monitor", "low", "transit"];

interface MatrixPoint {
  value: [number, number];
  symbolSize: number;
  ch: Channel;
}

function quadrantAreas() {
  const faint = (hex: string, a: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
  const area = (name: string, x0: number, y0: number, x1: number, y1: number, color: string, alpha: number, pos: string) => [
    {
      name,
      xAxis: x0,
      yAxis: y0,
      itemStyle: { color: faint(color, alpha) },
      label: { show: true, position: pos, color: "#8a948e", fontSize: 10, fontWeight: 500 as const },
    },
    { xAxis: x1, yAxis: y1 },
  ];
  return [
    area("Investigate", E_THRESHOLD, A_THRESHOLD, 100, 100, CLASS_COLORS.investigate, 0.04, "insideTopRight"),
    area("Verify data first", 0, A_THRESHOLD, E_THRESHOLD, 100, CLASS_COLORS.verify, 0.04, "insideTopLeft"),
    area("Monitor", E_THRESHOLD, 0, 100, A_THRESHOLD, CLASS_COLORS.monitor, 0.04, "insideBottomRight"),
    area("Low priority", 0, 0, E_THRESHOLD, A_THRESHOLD, CLASS_COLORS.low, 0.04, "insideBottomLeft"),
  ];
}

export default function RiskMatrix({ channels, filter }: { channels: Channel[]; filter: Filter }) {
  const router = useRouter();

  const byClass = useMemo(() => {
    const maxAbs = channels.reduce((m, c) => Math.max(m, Math.abs(c.primary)), 0);
    const sqrtMax = Math.sqrt(Math.max(maxAbs, 1));
    const groups = new Map<SignalClass, MatrixPoint[]>();
    for (const c of channels) {
      const size = 6 + 30 * (Math.sqrt(Math.abs(c.primary)) / sqrtMax);
      const pt: MatrixPoint = { value: [c.evidence, c.anomaly], symbolSize: Math.round(size * 10) / 10, ch: c };
      (groups.get(c.cls) ?? groups.set(c.cls, []).get(c.cls)!).push(pt);
    }
    return groups;
  }, [channels]);

  const period = filter.from === filter.to ? String(filter.from) : `${filter.from}–${filter.to}`;

  const option = useMemo<EChartsOption>(() => {
    const presentClasses = CLS_ORDER.filter((cls) => byClass.has(cls));
    const guideSeries = {
      name: "guides",
      type: "scatter" as const,
      data: [],
      silent: true,
      z: 1,
      markArea: { silent: true, data: quadrantAreas() as never },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed" as const, color: COLORS.axis, width: 1 },
        label: { color: COLORS.axis, fontSize: 10 },
        data: [
          { xAxis: E_THRESHOLD, label: { formatter: `E ${E_THRESHOLD}` } },
          { yAxis: A_THRESHOLD, label: { formatter: `A ${A_THRESHOLD}` } },
        ],
      },
    };
    const clsSeries = presentClasses.map((cls) => ({
      name: CLASS_LABELS[cls].label,
      type: "scatter" as const,
      z: 2,
      data: byClass.get(cls) as never,
      itemStyle: {
        color: `${CLASS_COLORS[cls]}8c`, // ~55% alpha fill
        borderColor: CLASS_COLORS[cls],
        borderWidth: 1,
      },
      emphasis: { itemStyle: { color: `${CLASS_COLORS[cls]}b3`, borderWidth: 1 } },
    }));

    return {
      backgroundColor: "transparent",
      legend: {
        top: 0,
        left: "center",
        icon: "circle",
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: COLORS.text, fontSize: 11 },
        data: presentClasses.map((cls) => CLASS_LABELS[cls].label),
      },
      grid: { left: 52, right: 28, top: 44, bottom: 48, containLabel: true },
      xAxis: {
        type: "value",
        min: 0,
        max: 100,
        name: "Evidence quality (0–100) →",
        nameLocation: "middle",
        nameGap: 28,
        nameTextStyle: { color: COLORS.axis, fontSize: 11 },
        axisLabel: { color: COLORS.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLine: { lineStyle: { color: COLORS.grid } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 100,
        name: "Anomaly strength (0–100) →",
        nameLocation: "middle",
        nameGap: 38,
        nameTextStyle: { color: COLORS.axis, fontSize: 11 },
        axisLabel: { color: COLORS.axis, fontSize: 10 },
        splitLine: { lineStyle: { color: COLORS.grid } },
        axisLine: { show: false },
      },
      tooltip: {
        ...baseTooltip(),
        trigger: "item",
        confine: true,
        formatter: (p: unknown) => {
          const it = p as { data?: { ch?: Channel } };
          const c = it.data?.ch;
          if (!c) return "";
          const dirYears = filter.direction === "reverse" ? c.revYears : c.posYears;
          const dirWord = filter.direction === "reverse" ? "reverse" : "positive";
          const flags = c.flags.length ? c.flags.join(", ") : "none";
          const mono = "font-family:var(--font-geist-mono),monospace";
          return [
            `<b>${c.partner}</b> · ${c.cmdLabel}`,
            `<span style="${mono};font-size:11px;color:${COLORS.text}">HS ${c.cmd}</span> · <span style="font-size:11px;color:${COLORS.text}">${period}</span>`,
            `<span style="color:${COLORS.positive}">Positive</span>: ${fmtUSDFull(c.posT)} · <span style="color:${COLORS.reverse}">Reverse</span>: ${fmtUSDFull(c.revT)}`,
            `Anomaly <b>${c.anomaly.toFixed(0)}</b> · Evidence <b>${c.evidence.toFixed(0)}</b> · ${CLASS_LABELS[c.cls].label}`,
            `<span style="font-size:11px;color:${COLORS.text}">Persistence: ${dirYears}/${c.comparableYears} comparable years ${dirWord}; longest streak ${c.longestPosStreak}</span>`,
            `<span style="font-size:11px;color:${COLORS.text}">Flags: ${flags}</span>`,
            `<span style="font-size:11px;color:${COLORS.text}">Click to open the channel profile. A screening signal, not evidence of wrongdoing.</span>`,
          ].join("<br/>");
        },
      },
      series: [guideSeries, ...clsSeries],
    };
  }, [byClass, filter.direction, period]);

  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const it = params as { data?: { ch?: Channel } };
        const c = it.data?.ch;
        if (c) router.push(`/channels/${c.partnerIso.toLowerCase()}/${c.cmd}`);
      },
    }),
    [router],
  );

  if (channels.length === 0) {
    return <EmptyState text="No HS6 channels match the current filters — relax the stage, signal-class or materiality filters to populate the matrix." />;
  }

  return (
    <div className="card overflow-hidden" style={{ height: 560 }}>
      <EChart option={option} onEvents={onEvents} />
    </div>
  );
}
