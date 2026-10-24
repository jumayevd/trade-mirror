"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";
import { BAND_COLORS, BAND_ON, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { labelRoom, useHoverTip, useWidth } from "@/components/charts/HoverTip";
import type { RiskBand } from "@/lib/dataset";

/**
 * Where each sector's positive discrepancy sits on the risk scale: one bar per
 * sector, split by risk band, strongest band first.
 *
 * The question is part-to-whole — how is a sector's gap divided between
 * Critical, High, Elevated and Low — so it is a stacked bar, not a grid of
 * printed cells. "Amount" keeps one scale across every bar, so sectors compare
 * by size; "Share" stretches each bar to 100%, so a small sector's mix reads as
 * clearly as a large one's. Exact figures, shares and product counts are in the
 * tooltip; the bar ends carry the total and its share of all sectors.
 *
 * Colours are the page's one band palette, in CBU colours (BAND_COLORS in
 * src/lib/format.ts): Critical in the logo's gold, High to Low down a navy
 * ramp — the cards above and the badges in the table read the same four. A 2px
 * gap separates segments as well.
 */

export const BAND_ORDER: RiskBand[] = ["critical", "high", "elevated", "low"];

// the page's one band palette (src/lib/format.ts): the cards, the badges and
// these bars all read the same four colours
const FILL = BAND_COLORS as Record<RiskBand, string>;
const INK = BAND_ON as Record<RiskBand, string>;

export interface CompositionRow {
  key: string;
  label: string;
  /** Positive discrepancy per band, in BAND_ORDER. */
  values: number[];
  /** Products (pairs) per band, in BAND_ORDER. */
  counts: number[];
}

export default function RiskComposition({
  rows, bandLabels, bandRanges, words,
}: {
  rows: CompositionRow[];
  bandLabels: Record<RiskBand, string>;
  bandRanges: Record<RiskBand, string>;
  words: {
    amount: string; share: string; view: string; all: string; total: string;
    ofSector: string; ofAll: string; products: string; aria: string;
  };
}) {
  const [mode, setMode] = useState<"amount" | "share">("amount");
  const tip = useHoverTip();
  // every bar shares one column, so one measurement sizes them all
  const [sizer, barPx] = useWidth<HTMLDivElement>();
  // one column template for every row, so labels, bars and totals line up
  const grid = "grid grid-cols-[clamp(108px,24%,220px)_1fr_7.75rem] items-center gap-x-3";

  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const allValues = BAND_ORDER.map((_, j) => sum(rows.map((r) => r.values[j])));
  const allCounts = BAND_ORDER.map((_, j) => sum(rows.map((r) => r.counts[j])));
  const grand = sum(allValues);
  const maxRow = Math.max(0, ...rows.map((r) => sum(r.values)));

  const bar = (label: string, values: number[], counts: number[], scale: number, strong = false) => {
    const total = sum(values);
    return (
      <div className={`flex ${strong ? "h-5" : "h-7"} w-full items-stretch gap-[2px]`} role="group"
        aria-label={`${label}: ${BAND_ORDER.map((b, j) => `${bandLabels[b]} ${fmtUSD(values[j])}`).join(", ")}`}>
        {BAND_ORDER.map((b, j) => {
          const v = values[j];
          if (!(v > 0) || !(scale > 0)) return null;
          const w = (v / scale) * 100;
          const ofRow = total > 0 ? v / total : 0;
          const text = mode === "share" ? fmtPct(ofRow, 0) : fmtUSD(v);
          return (
            <div
              key={b}
              tabIndex={0}
              aria-label={`${bandLabels[b]}: ${fmtUSDFull(v)}, ${fmtPct(ofRow, 1)} ${words.ofSector}, ${fmtNum(counts[j])} ${words.products}`}
              className="relative flex min-w-[2px] items-center justify-center overflow-hidden first:rounded-l-[4px] last:rounded-r-[4px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              style={{ width: `${w}%`, background: FILL[b], color: INK[b] }}
              {...tip.bind(
                <>
                  <div className="font-semibold">{label} · {bandLabels[b]}</div>
                  <div className="tabular mt-0.5">{fmtUSDFull(v)}</div>
                  <div className="tabular text-muted">{fmtPct(ofRow, 1)} {words.ofSector} · {fmtNum(counts[j])} {words.products}</div>
                </>,
              )}
            >
              {/* a figure only where its segment is wide enough to hold it, measured in
                  pixels; the tooltip has every one. The mix strip always reads in shares. */}
              {(() => {
                const shown = strong ? fmtPct(ofRow, 0) : text;
                const fits = barPx > 0 && (w / 100) * barPx >= labelRoom(shown, strong ? 11 : 11.5);
                return fits ? (
                  <span className={`tabular whitespace-nowrap px-1 ${strong ? "fs-11 font-semibold" : "fs-11.5 font-medium"}`}>{shown}</span>
                ) : null;
              })()}
            </div>
          );
        })}
      </div>
    );
  };

  const row = (key: string, label: string, values: number[], counts: number[], strong = false) => {
    const total = sum(values);
    const scale = mode === "share" ? total : maxRow;
    return (
      <div key={key} className={`${grid} py-1.5 ${strong ? "mb-1.5 border-b border-[var(--color-border)] pb-3" : ""}`}>
        <div className={`truncate fs-13 ${strong ? "font-semibold" : "font-medium"} text-foreground`} title={label}>{label}</div>
        {/* the all-sectors strip is always its own 100%: a mix, never a length to
            set against the sector bars, which share one scale below it */}
        {bar(label, values, counts, strong ? total : scale, strong)}
        <div className="text-right" title={fmtUSDFull(total)}>
          <span className={`tabular whitespace-nowrap ${strong ? "fs-14 font-bold" : "fs-13.5 font-semibold"}`}>{fmtUSD(total)}</span>
          <span className="tabular ml-2 inline-block w-[44px] whitespace-nowrap fs-12 text-faint">
            {grand > 0 ? fmtPct(total / grand, 1) : "—"}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div role="figure" aria-label={words.aria}>
      {/* the key and the view switch share one line above the bars */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {BAND_ORDER.map((b) => (
            <li key={b} className="flex items-center gap-1.5 fs-12.5">
              <span aria-hidden className="h-3 w-3 rounded-[3px]" style={{ background: FILL[b] }} />
              <span className="font-medium text-foreground">{bandLabels[b]}</span>
              <span className="tabular text-faint">{bandRanges[b]}</span>
            </li>
          ))}
        </ul>
        <Segmented
          value={mode}
          onChange={setMode}
          ariaLabel={words.view}
          options={[{ key: "amount", label: words.amount }, { key: "share", label: words.share }]}
        />
      </div>

      {/* the share of all sectors in the right column (the second figure) is constant
          across views; in Share view the bar's own split is what changes */}
      <div className={`${grid} pb-1 fs-12 text-faint`}>
        <span />
        {/* the measuring stick for the bar column */}
        <div ref={sizer} className="h-0" />
        <span className="text-right">{words.total} · {words.ofAll}</span>
      </div>
      {row("__all", words.all, allValues, allCounts, true)}
      {rows.map((r) => row(r.key, r.label, r.values, r.counts))}
      {tip.node}
    </div>
  );
}
