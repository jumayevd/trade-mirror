"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { COLORS, fmtUSD, fmtUSDFull, fmtPct } from "@/lib/format";
import { CHART_FONT, baseTooltip } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Top-five treemap for the Overview: who and what carry the positive
 * discrepancy. Tiles are sized by the cumulative positive gap over the selected
 * period and shaded blue → teal → green by rank — the deeper the
 * colour, the larger the gap. The share printed on each tile divides by the WHOLE
 * positive total, not the five shown, so the five tiles visibly do not sum to
 * 100% and cannot be misread as the whole story.
 *
 * One component serves both panels (countries and HS6 products); a tile click
 * opens the profile page for that country or product.
 */

export interface TreemapItem {
  key: string;
  label: string;
  value: number;
  href: string;
}

/*
 * Blue → teal → green, strongest first: rank 1 carries the deepest blue and
 * the smaller tiles cool off toward green, so magnitude reads as depth of
 * colour without leaning on the amber the map reserves for its own ramp.
 */
const RAMP = ["#1e40af", "#2563eb", "#0891b2", "#0d9488", "#34d399"];
/** Ink that stays legible on each step. */
const INK = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#0b3527"];

export default function GapTreemap({
  items, total, ariaLabel,
}: {
  /** Already ranked descending; only the first five are drawn. */
  items: TreemapItem[];
  /** The whole positive total the shares divide by. */
  total: number;
  ariaLabel: string;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const top = items.slice(0, 5);

  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(),
      formatter: (p: unknown) => {
        const it = p as { name: string; value: number };
        const share = total > 0 ? it.value / total : 0;
        return [
          `<b>${it.name}</b>`,
          `${t("ovw.treemap.gapWord")}: <b style="color:${COLORS.positive}">${fmtUSDFull(it.value)}</b>`,
          `${t("ovw.treemap.shareWord")}: <b>${fmtPct(share, 1)}</b>`,
          `<span style="font-size:0.9em;color:${COLORS.text}">${t("ovw.treemap.click")}</span>`,
        ].join("<br/>");
      },
    },
    series: [{
      type: "treemap",
      // the five tiles are the chart; no zoom, no drill, no breadcrumb chrome
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      left: 0, top: 0, right: 0, bottom: 0,
      // a canvas cannot resolve CSS variables — the themed surface is the intent
      itemStyle: { borderColor: COLORS.surface, borderWidth: 2, gapWidth: 2 },
      label: {
        show: true,
        formatter: (p: unknown) => {
          const it = p as { name: string; value: number };
          const share = total > 0 ? it.value / total : 0;
          return `${it.name}\n${fmtUSD(it.value)} · ${fmtPct(share, 0)}`;
        },
        fontSize: CHART_FONT.legend,
        lineHeight: CHART_FONT.legend + 5,
        overflow: "truncate",
      },
      data: top.map((it, i) => ({
        name: it.label,
        value: it.value,
        itemStyle: { color: RAMP[i] },
        label: { color: INK[i] },
      })),
    }],
  }), [top, total, t]);

  const onEvents = useMemo(() => ({
    click: (params: unknown) => {
      const it = params as { name?: string };
      const hit = top.find((x) => x.label === it.name);
      if (hit) router.push(hit.href);
    },
  }), [top, router]);

  return (
    <div className="card overflow-hidden" style={{ height: 280 }} role="img" aria-label={ariaLabel}>
      <EChart option={option} onEvents={onEvents} />
    </div>
  );
}
