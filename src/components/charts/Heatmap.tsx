"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import type { Aggregate } from "@/lib/dataset";
import { COLORS, fmtUSDFull } from "@/lib/format";
import { baseTooltip, baseTextStyle } from "@/lib/echartBase";

/**
 * Chapter × partner heatmap (spec §6.7) colored by the SIGNED discrepancy:
 * amber = positive (partner > UZB records), blue = reverse (UZB > partner),
 * near-white ≈ zero. Cells only exist where both sides reported — a blank cell
 * means no comparable observation, never a zero gap. Click a cell to open the
 * partner profile.
 */
export default function Heatmap({
  data,
  chapterLabels,
}: {
  data: Aggregate["heatmap"];
  chapterLabels: Record<string, string>;
}) {
  const router = useRouter();
  const matrix = data.import;

  const { chapters, partners, cells, absMax } = useMemo(() => {
    const partners = data.partners;
    // rank chapters by total signed magnitude (desc), keep top 24 for legibility
    const chapterTotals = Object.entries(matrix).map(([ch, row]) => ({
      ch,
      tot: Object.values(row).reduce((s, v) => s + Math.abs(v), 0),
    }));
    chapterTotals.sort((a, b) => b.tot - a.tot);
    const chapters = chapterTotals.slice(0, 24).map((c) => c.ch);

    const cells: [number, number, number][] = [];
    let absMax = 1;
    chapters.forEach((ch, yi) => {
      partners.forEach((p, xi) => {
        const v = matrix[ch]?.[p.iso3];
        if (v === undefined) return; // no comparable observation — not a zero
        cells.push([xi, yi, v]);
        absMax = Math.max(absMax, Math.abs(v));
      });
    });
    return { chapters, partners, cells, absMax };
  }, [matrix, data.partners]);

  const option = useMemo<EChartsOption>(
    () => ({
      backgroundColor: "transparent",
      textStyle: baseTextStyle,
      grid: { left: 8, right: 24, top: 8, bottom: 76, containLabel: true },
      tooltip: {
        ...baseTooltip(),
        formatter: (p: unknown) => {
          const it = p as { value: [number, number, number] };
          const [xi, yi, v] = it.value;
          const dir = v >= 0 ? "Positive (partner > UZB records)" : "Reverse (UZB records > partner)";
          const color = v >= 0 ? COLORS.positive : COLORS.reverse;
          return `<b>${partners[xi].name}</b> · HS ${chapters[yi]} ${chapterLabels[chapters[yi]] ?? ""}<br/>
            ${dir}<br/>Signed discrepancy: <b style="color:${color}">${fmtUSDFull(v)}</b><br/>
            <span style="color:${COLORS.axis}">Screening signal, not proof of misreporting. Click for the partner profile.</span>`;
        },
      },
      xAxis: {
        type: "category",
        data: partners.map((p) => p.iso3),
        axisLabel: { color: COLORS.axis, rotate: 60, fontSize: 10 },
        axisLine: { lineStyle: { color: COLORS.grid } },
        splitArea: { show: false },
      },
      yAxis: {
        type: "category",
        data: chapters.map((c) => `${c} · ${chapterLabels[c] ?? ""}`),
        axisLabel: { color: COLORS.axis, fontSize: 10, width: 190, overflow: "truncate" as const },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      visualMap: {
        type: "continuous",
        min: -absMax,
        max: absMax,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 4,
        textStyle: { color: COLORS.text, fontSize: 10 },
        text: ["Positive (amber)", "Reverse (blue)"],
        inRange: { color: [COLORS.reverse, "#f7f8f7", COLORS.positive] },
        formatter: (v: unknown) => fmtUSDFull(Number(v)),
      },
      series: [
        {
          type: "heatmap",
          data: cells,
          itemStyle: { borderColor: "#ffffff", borderWidth: 1 },
          emphasis: { itemStyle: { borderColor: COLORS.text, borderWidth: 1 } },
        },
      ],
    }),
    [cells, chapters, partners, absMax, chapterLabels],
  );

  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const it = params as { value: [number, number, number] };
        const iso = partners[it.value[0]]?.iso3;
        if (iso) router.push(`/partners/${iso.toLowerCase()}`);
      },
    }),
    [partners, router],
  );

  return (
    <div>
      <div className="mb-2 text-xs text-muted">
        <span style={{ color: COLORS.positive }}>amber</span> = positive discrepancy (partner &gt; UZB records) ·{" "}
        <span style={{ color: COLORS.reverse }}>blue</span> = reverse (UZB records &gt; partner) · near-white ≈ zero ·
        blank = no comparable observation (never treated as a zero gap) · click a cell to open the partner profile
      </div>
      <div className="card p-3" style={{ height: 620 }}>
        <EChart option={option} onEvents={onEvents} />
      </div>
    </div>
  );
}
