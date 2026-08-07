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
 * Top channels by composite risk score — one horizontal bar per partner × code,
 * length = R (0–100), colour = signal class. Replaces the E×A scatter matrix:
 * a ranked bar reads at a glance where a quadrant plot needs decoding.
 */

const R_REF = Math.round(10 * Math.sqrt(55 * 60)) / 10; // 57.4 — both class thresholds met exactly
const TOP_N = 15;
const CLS_ORDER: SignalClass[] = ["investigate", "verify", "monitor", "low", "transit"];

export default function RiskBars({ channels, filter }: { channels: Channel[]; filter: Filter }) {
  const router = useRouter();

  const top = useMemo(
    () => [...channels].sort((a, b) => b.risk - a.risk || Math.abs(b.primary) - Math.abs(a.primary)).slice(0, TOP_N),
    [channels],
  );
  const period = filter.from === filter.to ? String(filter.from) : `${filter.from}–${filter.to}`;

  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    grid: { left: 8, right: 44, top: 8, bottom: 30, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      name: "Risk score R = √(A × E) →",
      nameLocation: "middle",
      nameGap: 24,
      nameTextStyle: { color: COLORS.axis, fontSize: 11 },
      axisLabel: { color: COLORS.axis, fontSize: 10 },
      splitLine: { lineStyle: { color: COLORS.grid, width: 1, type: "solid" } },
      axisLine: { show: false },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: top.map((c) => `${c.partnerIso} ${c.cmd}`),
      axisLabel: { color: COLORS.text, fontSize: 10.5, fontFamily: "var(--font-geist-mono), monospace" },
      axisTick: { show: false },
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
        return [
          `<b>${c.partner}</b> · ${c.cmdLabel}`,
          `<span style="font-size:11px;color:${COLORS.text}">HS ${c.cmd} · ${period}</span>`,
          `Risk <b>${c.risk.toFixed(1)}</b> = √(A ${c.anomaly.toFixed(1)} × E ${c.evidence.toFixed(1)}) · ${CLASS_LABELS[c.cls].label}`,
          `Positive: <b style="color:${COLORS.positive}">${fmtUSDFull(c.posT)}</b> · Reverse: <b style="color:${COLORS.reverse}">${fmtUSDFull(c.revT)}</b>`,
          `<span style="font-size:11px;color:${COLORS.text}">Click to open the channel profile.</span>`,
        ].join("<br/>");
      },
    },
    series: [
      {
        type: "bar",
        data: top.map((c) => ({
          value: c.risk,
          ch: c,
          itemStyle: {
            color: `${CLASS_COLORS[c.cls]}cc`,
            borderColor: CLASS_COLORS[c.cls],
            borderWidth: 1,
            borderRadius: [0, 4, 4, 0] as [number, number, number, number],
          },
        })) as never,
        barMaxWidth: 16,
        label: {
          show: true,
          position: "right",
          fontSize: 10.5,
          color: COLORS.text,
          formatter: (p: { value?: unknown }) => Number(p.value ?? 0).toFixed(0),
        },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { type: "dashed" as const, color: COLORS.baseline, width: 1 },
          label: { color: COLORS.axis, fontSize: 10, formatter: `R ${R_REF}` },
          data: [{ xAxis: R_REF }],
        },
      },
    ],
  }), [top, period]);

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

  if (top.length === 0) {
    return <EmptyState text="No channels match the current filters — relax the stage, signal-class or materiality filters." />;
  }

  const presentClasses = CLS_ORDER.filter((cls) => top.some((c) => c.cls === cls));

  return (
    <div className="card p-3">
      <div style={{ height: Math.max(200, 30 + top.length * 26) }}>
        <EChart option={option} onEvents={onEvents} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted">
        {presentClasses.map((cls) => (
          <span key={cls} className="inline-flex items-center gap-1.5" title={CLASS_LABELS[cls].desc}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CLASS_COLORS[cls] }} />
            {CLASS_LABELS[cls].label}
          </span>
        ))}
      </div>
    </div>
  );
}
