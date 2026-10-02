"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { COLORS, fmtUSD, fmtUSDFull } from "@/lib/format";
import { CHART_FONT, baseTooltip } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Top-five treemap for the Overview: who and what carry the positive
 * discrepancy. Tile area follows the cumulative positive gap over the selected
 * period — compressed a little (area ∝ gap^0.8), so the smallest of the five
 * keeps enough width for its name instead of a strip that breaks words — and
 * is shaded blue → teal → green by rank. Each tile carries a name and its real
 * amount and nothing else; the area says how the five compare, a printed
 * share only added a number to read.
 *
 * One component serves both panels (countries and HS6 products); a tile click
 * opens the page for that country or product.
 */

export interface TreemapItem {
  key: string;
  /** What the tile prints — kept short enough to fit. */
  label: string;
  value: number;
  href: string;
  /** The full wording for the tooltip, when the label is a shortening of it. */
  detail?: string;
}

/*
 * Blue → teal → green, strongest first: rank 1 carries the deepest blue and
 * the smaller tiles cool off toward green, so magnitude reads as depth of
 * colour without leaning on the amber the map reserves for its own ramp.
 */
const RAMP = ["#1e40af", "#2563eb", "#0891b2", "#0d9488", "#34d399"];
/** Area scale: 1 is strictly proportional; below it the largest tiles give up a little room. */
const SIZE_POWER = 0.8;
/** Ink that stays legible on each step. */
const INK = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#0b3527"];

export default function GapTreemap({
  items, ariaLabel,
}: {
  /** Already ranked descending; only the first five are drawn. */
  items: TreemapItem[];
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
        const it = (p as { data?: { item?: TreemapItem } }).data?.item;
        if (!it) return "";
        return [
          `<b>${it.label}</b>`,
          ...(it.detail ? [`<span style="font-size:0.9em;color:${COLORS.text}">${it.detail}</span>`] : []),
          `${t("ovw.treemap.gapWord")}: <b style="color:${COLORS.positive}">${fmtUSDFull(it.value)}</b>`,
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
          // the real amount sits on the item; the node's value is the layout size
          const it = p as { name: string; data?: { item?: TreemapItem } };
          return `${it.name}\n${fmtUSD(it.data?.item?.value ?? 0)}`;
        },
        fontSize: CHART_FONT.legend,
        lineHeight: CHART_FONT.legend + 4,
        // a name longer than its tile wraps onto further lines rather than
        // being cut mid-word; only a tile too short for all the lines ends in …
        overflow: "break",
        lineOverflow: "truncate",
        padding: [4, 6],
      },
      data: top.map((it, i) => ({
        name: it.label,
        value: Math.pow(it.value, SIZE_POWER),
        // the tile carries its own item, so hit-testing never depends on an index
        item: it,
        itemStyle: { color: RAMP[i] },
        label: { color: INK[i] },
      })),
    }],
  }), [top, t]);

  // resolved from the tile's own item, for the same reason the tooltip is
  const onEvents = useMemo(() => ({
    click: (params: unknown) => {
      const hit = (params as { data?: { item?: TreemapItem } }).data?.item;
      if (hit) router.push(hit.href);
    },
  }), [router]);

  return (
    <div
      className="card overflow-hidden"
      style={{ height: "clamp(230px, 30vh, 420px)" }}
      role="img"
      aria-label={ariaLabel}
    >
      <EChart option={option} onEvents={onEvents} />
    </div>
  );
}
