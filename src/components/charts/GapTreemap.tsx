"use client";

import Link from "next/link";
import { fmtUSD, fmtUSDFull } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/**
 * Top-five treemap for the Overview: who and what carry the positive
 * discrepancy. Tile area follows the cumulative positive gap over the selected
 * period — compressed a little (area ∝ gap^0.8), so the smallest of the five
 * keeps enough width for its name instead of a strip that breaks words — and
 * is shaded from deep navy toward sky by rank. Each tile carries a name and its
 * real amount and nothing else; the area says how the five compare, a printed
 * share only added a number to read.
 *
 * The tiles are laid out once, on a fixed reference shape, and that layout is
 * stretched to whatever box the page gives the treemap. A squarified layout
 * re-run on the box itself moves the tiles whenever the box's proportions
 * change — a laptop and a monitor showed the same five in different places —
 * while a stretched one keeps every tile where it is on every screen.
 * Stretching each axis by its own factor scales every area alike, so the
 * areas still compare.
 *
 * One component serves both panels (countries and HS6 products); a tile opens
 * the page for that country or product.
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
 * One hue stepped light-ward, strongest first: rank 1 carries the deepest shade
 * and the smaller tiles lighten, so magnitude reads as depth of one colour.
 *
 * Two tones, because the overview sets two treemaps side by side — who carries
 * the gap and what — and in one blue the pair read as a single picture. Navy
 * stays the site's own; the second is sea green, the palette's teal leaned
 * green so that even its darkest steps stay apart from navy's (validator, step
 * for step: ΔE 15–19 normal vision, 14–18 colour-blind). Amber was tried first
 * and its dark steps read as brown. Its steps follow navy's lightness, so
 * neither panel outweighs the other; white ink holds at ≥ 3.5:1 on the first
 * four, dark ink on the last.
 */
export type TreemapTone = "navy" | "sea";
const RAMPS: Record<TreemapTone, { fill: string[]; ink: string[] }> = {
  navy: {
    fill: ["#0f2f6b", "#1e4a9a", "#2f63c0", "#4f86d8", "#8fb6ec"],
    ink: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#0f2547"],
  },
  sea: {
    fill: ["#05523f", "#086a52", "#0b8263", "#1d9a78", "#b2ead0"],
    ink: ["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#06302b"],
  },
};
/** Area scale: 1 is strictly proportional; below it the largest tiles give up a little room. */
const SIZE_POWER = 0.8;

/**
 * Width ÷ height of the shape the tiles are laid out on: a panel's shape on a
 * common laptop, between the wide strip of a short screen and the near-square
 * of a tall one, so no screen stretches the tiles far from it.
 */
const REFERENCE_ASPECT = 1.8;
/** The tile shape the layout aims for — ECharts' default, so tiles keep their old proportions. */
const SQUARE_RATIO = 0.5 * (1 + Math.sqrt(5));

interface Rect { x: number; y: number; w: number; h: number }

/**
 * Squarified treemap (Bruls, Huizing & van Wijk), as ECharts lays one out, on
 * a REFERENCE_ASPECT × 1 box. Values arrive largest first; each tile comes back
 * as fractions of the box, so it can be stretched onto any size.
 */
function layout(values: number[]): Rect[] {
  const total = values.reduce((s, v) => s + v, 0);
  const free = { x: 0, y: 0, w: REFERENCE_ASPECT, h: 1 };
  const areas = values.map((v) => (total > 0 ? (v / total) * free.w * free.h : 0));
  const out: Rect[] = [];

  // how far the row's worst tile is from the aimed-for shape; lower is better
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((s, a) => s + a, 0);
    if (!sum) return Infinity;
    const f = side * side * SQUARE_RATIO;
    return Math.max((f * Math.max(...row)) / (sum * sum), (sum * sum) / (f * Math.min(...row)));
  };
  // lays a row along the free box's shorter side and takes it off the box
  const place = (row: number[], flush: boolean) => {
    const sum = row.reduce((s, a) => s + a, 0);
    const across = free.w <= free.h; // the row runs across the top rather than down the left
    const length = across ? free.w : free.h;
    const room = across ? free.h : free.w;
    const thick = flush ? room : Math.min(length ? sum / length : 0, room);
    const end = across ? free.x + free.w : free.y + free.h;
    let at = across ? free.x : free.y;
    row.forEach((a, i) => {
      // the last tile runs to the end, so rounding never leaves a sliver
      const len = i === row.length - 1 ? end - at : thick ? a / thick : 0;
      out.push(across ? { x: at, y: free.y, w: len, h: thick } : { x: free.x, y: at, w: thick, h: len });
      at += len;
    });
    if (across) { free.y += thick; free.h -= thick; } else { free.x += thick; free.w -= thick; }
  };

  let row: number[] = [];
  let best = Infinity;
  for (let i = 0; i < areas.length;) {
    row.push(areas[i]);
    const score = worst(row, Math.min(free.w, free.h));
    if (score <= best) { best = score; i++; continue; }
    row.pop();
    place(row, false);
    row = [];
    best = Infinity;
  }
  if (row.length) place(row, true);
  return out.map((r) => ({ x: r.x / REFERENCE_ASPECT, y: r.y, w: r.w / REFERENCE_ASPECT, h: r.h }));
}

const pct = (f: number) => `${(f * 100).toFixed(4)}%`;

export default function GapTreemap({
  items, ariaLabel, tone = "navy",
}: {
  /** Already ranked descending; only the first five are drawn. */
  items: TreemapItem[];
  ariaLabel: string;
  tone?: TreemapTone;
}) {
  const { fill, ink } = RAMPS[tone];
  const { t } = useI18n();
  const top = items.slice(0, 5);
  const rects = layout(top.map((it) => Math.pow(it.value, SIZE_POWER)));

  // Stacked (below lg) the treemap keeps a height of its own; side by side it
  // takes what its panel is given — the overview fills the window with it —
  // and never less than a tile can hold its two lines of label in.
  return (
    <div className="card relative h-[clamp(230px,30vh,420px)] overflow-hidden p-px lg:h-auto lg:min-h-[calc(200*var(--fpx))] lg:flex-1">
      <ul className="relative h-full w-full" aria-label={ariaLabel}>
        {top.map((it, i) => {
          const r = rects[i];
          const tip = [
            it.label,
            it.detail,
            `${t("ovw.treemap.gapWord")}: ${fmtUSDFull(it.value)}`,
            t("ovw.treemap.click"),
          ].filter(Boolean).join("\n");
          return (
            <li key={it.key} className="absolute p-px" style={{ left: pct(r.x), top: pct(r.y), width: pct(r.w), height: pct(r.h) }}>
              <Link
                href={it.href}
                title={tip}
                aria-label={`${it.label}: ${fmtUSD(it.value)}`}
                className="flex h-full w-full flex-col items-center justify-center overflow-hidden px-1.5 py-1 text-center fs-13 leading-snug [overflow-wrap:anywhere] hover:brightness-110 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white"
                style={{ background: fill[i], color: ink[i] }}
              >
                <span>{it.label}</span>
                <span>{fmtUSD(it.value)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
