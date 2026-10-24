"use client";

import { useState, type ReactNode } from "react";
import { Segmented } from "@/components/ui";
import { fmtNum, fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { quantileEdges } from "@/lib/seq-ramp";
import { useHoverTip } from "@/components/charts/HoverTip";

/**
 * A heatmap of positive-discrepancy amounts, rows × columns — shared by
 * Product Analysis (sectors × years) and Discrepancy & Risk (sectors × risk
 * bands). Column totals are the bottom row.
 *
 * Built to read, not just to hold figures:
 *  - every cell's darkness is one scale (classes cut at the quantiles of the
 *    values on screen, so shades spread across the grid instead of one large
 *    row taking the dark end and the rest washing out); one figure per cell,
 *    the rest in the tooltip
 *  - "Share" re-shades by each cell's share of its row or of its column
 *  - a partial column (a year the books cover only in part) is marked:
 *    dashed cells and a star on its head
 *
 * Colours are CSS variables (--seq-*, per theme in globals.css), so
 * the prerendered HTML and the browser emit the same style text.
 */

const STEPS = 6;
/** Row shares on fixed classes, so a shade means the same share on every row. */
const ROW_SHARE_EDGES = [0.1, 0.2, 0.3, 0.45, 0.6];

export interface HeatColumn {
  key: string;
  label: string;
  /** A second line under the head: a score range, a month range. */
  sub?: string;
  /** A year the books cover only in part. */
  partial?: boolean;
  /** Extra tooltip line for every cell in this column. */
  note?: string;
}

export interface HeatRow {
  key: string;
  label: string;
  values: number[];
  /** Products (pairs) per column, for the tooltip. */
  counts?: number[];
  /** An "every other …" row: set in italics. */
  muted?: boolean;
}

const fill = (k: number) => `var(--seq-${k})`;
const ink = (k: number) => `var(--seq-ink-${k})`;
const classOf = (v: number, edges: number[]) => {
  let k = 1;
  for (const e of edges) if (v >= e) k++;
  return Math.min(k, STEPS);
};

export default function HeatGrid({
  rows, columns, shareBasis, words, footnote,
}: {
  rows: HeatRow[];
  columns: HeatColumn[];
  /** What "Share" divides by: the cell's row or its column. */
  shareBasis: "row" | "column";
  words: {
    amount: string; share: string; view: string; rowHead: string; all: string; total: string;
    ofAll: string; shareOf: string; products?: string; aria: string;
  };
  footnote?: ReactNode;
}) {
  const [mode, setMode] = useState<"amount" | "share">("amount");
  const tip = useHoverTip();

  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const n = columns.length;
  const colTotals = columns.map((_, j) => sum(rows.map((r) => r.values[j] || 0)));
  const rowTotals = rows.map((r) => sum(r.values));
  const grand = sum(colTotals);
  const shareOf = (i: number, j: number) => {
    const d = shareBasis === "row" ? rowTotals[i] : colTotals[j];
    return d > 0 ? (rows[i].values[j] || 0) / d : 0;
  };

  const amountEdges = quantileEdges(rows.flatMap((r) => r.values).filter((v) => v > 0), STEPS);
  const shareEdges = shareBasis === "row"
    ? ROW_SHARE_EDGES
    : quantileEdges(rows.flatMap((_, i) => columns.map((__, j) => shareOf(i, j))).filter((v) => v > 0), STEPS);
  const edges = mode === "share" ? shareEdges : amountEdges;
  const fmtClass = mode === "share" ? (v: number) => fmtPct(v, v < 0.1 ? 1 : 0) : fmtUSD;
  const legend = Array.from({ length: Math.min(STEPS, edges.length + 1) }, (_, i) => ({
    k: i + 1,
    label: i === 0 ? `< ${fmtClass(edges[0])}` : i === edges.length ? `≥ ${fmtClass(edges[edges.length - 1])}` : `${fmtClass(edges[i - 1])}–${fmtClass(edges[i])}`,
  }));

  // one column template for every row: label · the columns · total · share
  const minCell = n > 8 ? 64 : n > 5 ? 72 : 84;
  const grid = { display: "grid", gridTemplateColumns: `minmax(130px,1.4fr) repeat(${n}, minmax(${minCell}px,1fr)) minmax(80px,0.8fr) 3.25rem`, columnGap: 6 } as const;
  const dense = n > 7;

  return (
    <div role="figure" aria-label={words.aria}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 fs-12 text-faint">
          {legend.map((l) => (
            <span key={l.k} className="flex items-center gap-1">
              <span aria-hidden className="h-3 w-5 rounded-[3px]" style={{ background: fill(l.k) }} />
              <span className="tabular">{l.label}</span>
            </span>
          ))}
        </div>
        <Segmented value={mode} onChange={setMode} ariaLabel={words.view}
          options={[{ key: "amount", label: words.amount }, { key: "share", label: words.share }]} />
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 230 + n * (minCell + 6) + 140 }}>
          {/* column heads */}
          <div style={grid} className="items-end pb-2 fs-12">
            <span className="font-medium text-faint">{words.rowHead}</span>
            {columns.map((c) => (
              <span key={c.key} className="text-center" title={c.note}>
                <span className="block fs-15 font-bold leading-tight text-foreground">{c.label}{c.partial ? "*" : ""}</span>
                {c.sub && <span className="tabular mt-0.5 block truncate fs-12 text-faint">{c.sub}</span>}
              </span>
            ))}
            <span className="text-right font-medium text-faint">{words.total}</span>
            <span className="text-right font-medium text-faint">{words.ofAll}</span>
          </div>

          {/* the grid */}
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.key} style={grid} className="items-stretch">
                <div className={`flex items-center truncate fs-13 ${r.muted ? "italic text-muted" : "font-medium text-foreground"}`} title={r.label}>{r.label}</div>
                {columns.map((c, j) => {
                  const v = r.values[j] || 0;
                  const share = shareOf(i, j);
                  const dashed = c.partial ? "outline outline-1 outline-dashed outline-offset-[-3px] outline-[color-mix(in_srgb,currentColor_45%,transparent)]" : "";
                  if (!(v > 0)) {
                    return <div key={c.key} className={`flex h-10 items-center justify-center rounded-md bg-[var(--color-panel-2)] fs-12 text-faint ${dashed}`}>—</div>;
                  }
                  const k = classOf(mode === "share" ? share : v, edges);
                  return (
                    <div key={c.key} tabIndex={0}
                      className={`flex h-10 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] ${dashed}`}
                      style={{ background: fill(k), color: ink(k) }}
                      aria-label={`${r.label} · ${c.label}: ${fmtUSDFull(v)}, ${fmtPct(share, 1)} ${words.shareOf}${r.counts ? `, ${fmtNum(r.counts[j])} ${words.products ?? ""}` : ""}`}
                      {...tip.bind(
                        <>
                          <div className="font-semibold">{r.label} · {c.label}{c.sub ? ` (${c.sub})` : ""}</div>
                          <div className="tabular mt-0.5">{fmtUSDFull(v)}</div>
                          <div className="tabular text-muted">
                            {fmtPct(share, 1)} {words.shareOf}{r.counts ? ` · ${fmtNum(r.counts[j])} ${words.products ?? ""}` : ""}
                          </div>
                          {c.note && <div className="mt-1 text-faint">{c.note}</div>}
                        </>,
                      )}>
                      <span className={`tabular whitespace-nowrap font-semibold ${dense ? "fs-11.5" : "fs-12.5"}`}>
                        {mode === "share" ? fmtPct(share, share < 0.1 ? 1 : 0) : fmtUSD(v)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-end tabular whitespace-nowrap fs-13 font-semibold" title={fmtUSDFull(rowTotals[i])}>{fmtUSD(rowTotals[i])}</div>
                <div className="flex items-center justify-end tabular fs-12 text-faint">{grand > 0 ? fmtPct(rowTotals[i] / grand, 1) : "—"}</div>
              </div>
            ))}
          </div>

          {/* every row together */}
          <div style={grid} className="mt-2 items-center border-t border-[var(--color-border)] pt-2.5">
            <span className="fs-13 font-semibold text-foreground">{words.all}</span>
            {colTotals.map((v, j) => (
              <span key={j} className="text-center">
                <span className={`tabular block whitespace-nowrap font-semibold ${dense ? "fs-12" : "fs-13"}`}>{v > 0 ? fmtUSD(v) : "—"}</span>
                <span className="tabular block fs-11.5 text-faint">{grand > 0 ? fmtPct(v / grand, 1) : "—"}</span>
              </span>
            ))}
            <span className="text-right tabular whitespace-nowrap fs-14 font-bold" title={fmtUSDFull(grand)}>{fmtUSD(grand)}</span>
            <span className="text-right tabular fs-12 text-faint">100%</span>
          </div>
        </div>
      </div>
      {footnote && <div className="mt-3 fs-12 text-faint">{footnote}</div>}
      {tip.node}
    </div>
  );
}
