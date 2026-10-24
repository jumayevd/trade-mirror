"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";
import { IS_DARK, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { useHoverTip } from "@/components/charts/HoverTip";
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
 * The bands are ORDERED, so their fills step by lightness — more severe reads
 * as more contrast against the card, in both themes — inside the hue family of
 * each band's card above (red, orange, ochre, grey). Validated with the dataviz
 * palette script for adjacent pairs: light ΔE 14.7 colour-blind / 16.5 normal
 * vision, dark 12.3 / 15.5. (The cards' own status colours sit apart, one per
 * card; side by side in one bar the ochre and the orange were ΔE 1.2 apart for
 * a protan reader.) A 2px gap separates segments as well.
 */

export const BAND_ORDER: RiskBand[] = ["critical", "high", "elevated", "low"];

const FILL: Record<RiskBand, string> = IS_DARK
  ? { critical: "#ffbcae", high: "#ee8838", elevated: "#946f22", low: "#4a5366" }
  : { critical: "#9e2a20", high: "#d96f24", elevated: "#e6b84a", low: "#d2d7df" };
/** Ink on each fill, for a label printed inside a wide segment. */
const INK: Record<RiskBand, string> = IS_DARK
  ? { critical: "#3a0d07", high: "#2a1300", elevated: "#fff", low: "#fff" }
  : { critical: "#fff", high: "#fff", elevated: "#3a2a00", low: "#2b3443" };

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
              {/* a figure only where it fits with room to spare; the tooltip has every one.
                  The mix strip always reads in shares. */}
              <span className={`tabular whitespace-nowrap px-1 ${strong ? "fs-11 font-semibold" : "fs-11.5 font-medium"}`}
                style={{ visibility: w >= (mode === "share" || strong ? 7 : 9) ? "visible" : "hidden" }}>
                {strong ? fmtPct(ofRow, 0) : text}
              </span>
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
      <div key={key} className={`grid grid-cols-[minmax(120px,210px)_1fr_auto] items-center gap-x-3 py-1.5 ${strong ? "border-b border-[var(--color-border)] pb-3 mb-1.5" : ""}`}>
        <div className={`truncate fs-13 ${strong ? "font-semibold" : "font-medium"} text-foreground`} title={label}>{label}</div>
        {/* the all-sectors strip is always its own 100%: a mix, never a length to
            set against the sector bars, which share one scale below it */}
        {bar(label, values, counts, strong ? total : scale, strong)}
        <div className="w-[118px] text-right" title={fmtUSDFull(total)}>
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
      <div className="grid grid-cols-[minmax(120px,210px)_1fr_auto] gap-x-3 pb-1 fs-12 text-faint">
        <span />
        <span />
        <span className="w-[118px] text-right">{words.total} · {words.ofAll}</span>
      </div>
      {row("__all", words.all, allValues, allCounts, true)}
      {rows.map((r) => row(r.key, r.label, r.values, r.counts))}
      {tip.node}
    </div>
  );
}
