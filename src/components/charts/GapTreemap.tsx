"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { EChartsOption } from "echarts";
import EChart from "@/components/EChart";
import { COLORS, fmtUSD, fmtUSDFull } from "@/lib/format";
import { CHART_FONT, baseTooltip } from "@/lib/echartBase";
import { useI18n } from "@/lib/i18n";

/**
 * Top-five treemap for the Overview: who and what carry the positive
 * discrepancy. Tile area is the cumulative positive gap over the selected
 * period, shaded blue → teal → green by rank. Each tile carries a name and an
 * amount and nothing else — the area already says how the five compare, so a
 * printed share only added a number to read.
 *
 * One component serves both panels (countries and HS6 products); a tile click
 * opens the page for that country or product.
 *
 * With `fullNames` (the products panel) a tile prints the whole name, wrapped
 * to its width, and a ranked list under the chart repeats every name in full:
 * official HS6 descriptions run long, and the smallest tile has no room for one.
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
/** Ink that stays legible on each step. */
const INK = ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#0b3527"];

export default function GapTreemap({
  items, ariaLabel, fullNames = false,
}: {
  /** Already ranked descending; only the first five are drawn. */
  items: TreemapItem[];
  ariaLabel: string;
  /** Wrap full names on the tiles and list them under the chart. */
  fullNames?: boolean;
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
          const it = p as { name: string; value: number };
          return `${it.name}\n${fmtUSD(it.value)}`;
        },
        fontSize: CHART_FONT.legend,
        lineHeight: CHART_FONT.legend + 5,
        // full names wrap to the tile; lines past its height end in an ellipsis
        overflow: fullNames ? "break" : "truncate",
        ...(fullNames ? { lineOverflow: "truncate" as const } : {}),
      },
      data: top.map((it, i) => ({
        name: it.label,
        value: it.value,
        // the tile carries its own item, so hit-testing never depends on an index
        item: it,
        itemStyle: { color: RAMP[i] },
        label: { color: INK[i] },
      })),
    }],
  }), [top, t, fullNames]);

  // resolved from the tile's own item, for the same reason the tooltip is
  const onEvents = useMemo(() => ({
    click: (params: unknown) => {
      const hit = (params as { data?: { item?: TreemapItem } }).data?.item;
      if (hit) router.push(hit.href);
    },
  }), [router]);

  const chart = (
    <div style={{ height: "clamp(230px, 30vh, 420px)" }} role="img" aria-label={ariaLabel}>
      <EChart option={option} onEvents={onEvents} />
    </div>
  );
  if (!fullNames) return <div className="card overflow-hidden">{chart}</div>;
  return (
    <div className="card overflow-hidden">
      {chart}
      <ol className="divide-y divide-[var(--color-border-soft)] border-t border-[var(--color-border-soft)]">
        {top.map((it, i) => (
          <li key={it.key}>
            <Link href={it.href} className="flex items-start gap-2.5 px-3 py-2 hover:bg-[var(--color-panel-2)]">
              <span aria-hidden className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: RAMP[i] }} />
              <span className="tabular w-4 shrink-0 fs-12.5 text-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 fs-13 leading-snug">
                {it.label}
                {it.detail && <span className="block fs-12 text-faint">{it.detail}</span>}
              </span>
              <span className="tabular shrink-0 fs-13 font-medium" title={fmtUSDFull(it.value)}>{fmtUSD(it.value)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
