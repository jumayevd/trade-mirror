"use client";

import { useState } from "react";
import { Segmented } from "@/components/ui";
import { BAND_COLORS, fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { quantileEdges } from "@/lib/seq-ramp";
import { useHoverTip } from "@/components/charts/HoverTip";
import type { RiskBand } from "@/lib/dataset";

/**
 * Where the positive discrepancy sits, by sector and risk band: a heatmap with
 * the band totals drawn as columns above it.
 *
 * The grid keeps what the first version got right — every sector against every
 * band, with its amount — and fixes what made it hard to read: one colour scale
 * for every cell (the CBU navy ramp, light to dark), classes cut at the
 * quantiles of the values on screen so the shades spread across the grid
 * instead of one large sector taking the dark end and the rest washing out,
 * and one figure per cell (the product count is in the tooltip). "Share of
 * sector" re-shades each row by how its gap divides across the bands, so a
 * small sector concentrated in Critical stands out as clearly as a large one.
 *
 * The band totals above the columns are vertical bars in the band colours —
 * gold for Critical, the navy ramp for the rest, as on the cards.
 *
 * Colours are CSS variables (--seq-*, --band-*, per theme in globals.css), so
 * the prerendered HTML and the browser emit the same style text.
 */

export const BAND_ORDER: RiskBand[] = ["critical", "high", "elevated", "low"];

const STEPS = 6;
const seq = (k: number) => `var(--seq-${k})`;
const seqInk = (k: number) => `var(--seq-ink-${k})`;
/** Share-of-sector classes, fixed so a shade means the same share on every row. */
const SHARE_EDGES = [0.1, 0.2, 0.3, 0.45, 0.6];

export interface HeatRow {
  key: string;
  label: string;
  /** Positive discrepancy per band, in BAND_ORDER. */
  values: number[];
  /** Products (pairs) per band, in BAND_ORDER. */
  counts: number[];
}

const classOf = (v: number, edges: number[]) => {
  let k = 1;
  for (const e of edges) if (v >= e) k++;
  return Math.min(k, STEPS);
};

export default function RiskHeatmap({
  rows, bandLabels, bandRanges, words,
}: {
  rows: HeatRow[];
  bandLabels: Record<RiskBand, string>;
  bandRanges: Record<RiskBand, string>;
  words: {
    amount: string; share: string; view: string; sector: string; all: string; total: string;
    ofSector: string; ofAll: string; products: string; aria: string;
  };
}) {
  const [mode, setMode] = useState<"amount" | "share">("amount");
  const tip = useHoverTip();

  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const colTotals = BAND_ORDER.map((_, j) => sum(rows.map((r) => r.values[j])));
  const colCounts = BAND_ORDER.map((_, j) => sum(rows.map((r) => r.counts[j])));
  const grand = sum(colTotals);
  const maxCol = Math.max(0, ...colTotals);

  const amountEdges = quantileEdges(rows.flatMap((r) => r.values).filter((v) => v > 0), STEPS);
  const edgesFor = mode === "share" ? SHARE_EDGES : amountEdges;

  // one column template for every row: sector · four bands · total · share
  const grid = "grid grid-cols-[minmax(130px,1.5fr)_repeat(4,minmax(78px,1fr))_minmax(84px,0.8fr)_3.25rem] gap-x-1.5";

  const legend = (() => {
    const fmt = mode === "share" ? (v: number) => fmtPct(v, 0) : fmtUSD;
    const e = edgesFor;
    return Array.from({ length: Math.min(STEPS, e.length + 1) }, (_, i) => ({
      k: i + 1,
      label: i === 0 ? `< ${fmt(e[0])}` : i === e.length ? `≥ ${fmt(e[e.length - 1])}` : `${fmt(e[i - 1])}–${fmt(e[i])}`,
    }));
  })();

  return (
    <div role="figure" aria-label={words.aria}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 fs-12 text-faint">
          {legend.map((l) => (
            <span key={l.k} className="flex items-center gap-1">
              <span aria-hidden className="h-3 w-5 rounded-[3px]" style={{ background: seq(l.k) }} />
              <span className="tabular">{l.label}</span>
            </span>
          ))}
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          ariaLabel={words.view}
          options={[{ key: "amount", label: words.amount }, { key: "share", label: words.share }]}
        />
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          {/* the band totals: one column per band, in its own colour */}
          <div className={`${grid} items-end`}>
            <span />
            {BAND_ORDER.map((b, j) => {
              const v = colTotals[j];
              const h = maxCol > 0 ? Math.max(4, (v / maxCol) * 72) : 0;
              return (
                <div key={b} className="flex flex-col items-center justify-end" style={{ height: 104 }} tabIndex={0}
                  aria-label={`${bandLabels[b]}: ${fmtUSDFull(v)}, ${fmtPct(grand > 0 ? v / grand : 0, 1)} ${words.ofAll}`}
                  {...tip.bind(
                    <>
                      <div className="font-semibold">{bandLabels[b]} · {words.all}</div>
                      <div className="tabular mt-0.5">{fmtUSDFull(v)}</div>
                      <div className="tabular text-muted">{fmtPct(grand > 0 ? v / grand : 0, 1)} · {fmtNum(colCounts[j])} {words.products}</div>
                    </>,
                  )}>
                  <span className="tabular mb-1 whitespace-nowrap fs-12.5 font-semibold text-foreground">{fmtUSD(v)}</span>
                  <span className="w-[46%] max-w-14 rounded-t-[4px]" style={{ height: h, background: BAND_COLORS[b] }} />
                </div>
              );
            })}
            <span />
            <span />
          </div>

          {/* column heads */}
          <div className={`${grid} items-end border-t border-[var(--color-border)] pb-1.5 pt-2 fs-12`}>
            <span className="font-medium text-faint">{words.sector}</span>
            {BAND_ORDER.map((b) => (
              <span key={b} className="text-center">
                <span className="block font-semibold text-foreground">{bandLabels[b]}</span>
                <span className="tabular block text-faint">{bandRanges[b]}</span>
              </span>
            ))}
            <span className="text-right font-medium text-faint">{words.total}</span>
            <span className="text-right font-medium text-faint">{words.ofAll}</span>
          </div>

          {/* the grid */}
          <div className="space-y-1.5">
            {rows.map((r) => {
              const total = sum(r.values);
              return (
                <div key={r.key} className={`${grid} items-stretch`}>
                  <div className="flex items-center truncate fs-13 font-medium text-foreground" title={r.label}>{r.label}</div>
                  {BAND_ORDER.map((b, j) => {
                    const v = r.values[j];
                    const share = total > 0 ? v / total : 0;
                    if (!(v > 0)) {
                      return <div key={b} className="flex h-10 items-center justify-center rounded-md bg-[var(--color-panel-2)] fs-12 text-faint">—</div>;
                    }
                    const k = classOf(mode === "share" ? share : v, edgesFor);
                    return (
                      <div key={b} tabIndex={0}
                        className="flex h-10 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)]"
                        style={{ background: seq(k), color: seqInk(k) }}
                        aria-label={`${r.label} · ${bandLabels[b]}: ${fmtUSDFull(v)}, ${fmtPct(share, 1)} ${words.ofSector}, ${fmtNum(r.counts[j])} ${words.products}`}
                        {...tip.bind(
                          <>
                            <div className="font-semibold">{r.label} · {bandLabels[b]}</div>
                            <div className="tabular mt-0.5">{fmtUSDFull(v)}</div>
                            <div className="tabular text-muted">{fmtPct(share, 1)} {words.ofSector} · {fmtNum(r.counts[j])} {words.products}</div>
                          </>,
                        )}>
                        <span className="tabular whitespace-nowrap fs-12.5 font-semibold">
                          {mode === "share" ? fmtPct(share, 0) : fmtUSD(v)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-end tabular whitespace-nowrap fs-13 font-semibold" title={fmtUSDFull(total)}>{fmtUSD(total)}</div>
                  <div className="flex items-center justify-end tabular fs-12 text-faint">{grand > 0 ? fmtPct(total / grand, 1) : "—"}</div>
                </div>
              );
            })}
          </div>

          {/* every sector */}
          <div className={`${grid} mt-2 items-center border-t border-[var(--color-border)] pt-2.5`}>
            <span className="fs-13 font-semibold text-foreground">{words.all}</span>
            {colTotals.map((v, j) => (
              <span key={j} className="text-center">
                <span className="tabular block whitespace-nowrap fs-13 font-semibold">{fmtUSD(v)}</span>
                <span className="tabular block fs-11.5 text-faint">{grand > 0 ? fmtPct(v / grand, 1) : "—"}</span>
              </span>
            ))}
            <span className="text-right tabular whitespace-nowrap fs-14 font-bold" title={fmtUSDFull(grand)}>{fmtUSD(grand)}</span>
            <span className="text-right tabular fs-12 text-faint">100%</span>
          </div>
        </div>
      </div>
      {tip.node}
    </div>
  );
}
