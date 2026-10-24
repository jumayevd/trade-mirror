"use client";

import { fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";

/**
 * A matrix of positive-discrepancy amounts that prints its figures — built for
 * reading in a meeting rather than hovering. Every cell shows its amount and a
 * second line (a share, a count); its fill deepens with the amount, in the
 * column's own colour, on one scale across the whole matrix so cells compare
 * across columns. A total column (with a bar for its size against the largest
 * row) and a total row close it.
 */

export interface MatrixColumn {
  label: string;
  /** Fill colour for this column's cells; any CSS colour. */
  color: string;
  /** Small line under the heading, e.g. a footnote marker or a range. */
  sub?: string;
  title?: string;
}

export interface MatrixRow {
  key: string;
  label: string;
  values: number[];
  /** Second line per cell; null leaves it blank. */
  notes?: (string | null)[];
}

export default function ValueMatrix({
  rows, columns, totals, totalWord, totalRowLabel, shareWord, ariaLabel, rowTitle,
}: {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  /** The bottom row's per-column figures; defaults to the column sums of `rows`. */
  totals?: number[];
  totalWord: string;
  /** Label of the bottom row (defaults to totalWord). */
  totalRowLabel?: string;
  /** Heading of the share column; omit to hide it. */
  shareWord?: string;
  ariaLabel: string;
  /** Heading over the row labels. */
  rowTitle?: string;
}) {
  const colTotals = totals ?? columns.map((_, j) => rows.reduce((s, r) => s + (r.values[j] || 0), 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const rowTotals = rows.map((r) => r.values.reduce((a, b) => a + (b > 0 ? b : 0), 0));
  const maxRow = Math.max(0, ...rowTotals);
  const maxCell = Math.max(0, ...rows.flatMap((r) => r.values));

  /** 0 → a faint wash, max → near-solid; square root so small cells still register. */
  const tone = (v: number) => (v > 0 && maxCell > 0 ? 10 + 78 * Math.sqrt(v / maxCell) : 0);

  // few columns: wider cells and a table only as wide as it needs, so a single
  // selected year does not leave its column stranded at the far edge
  const few = columns.length <= 3;
  const n = columns.length;
  const cellW = n > 8 ? 74 : n > 6 ? 84 : few ? 160 : 112;
  const minWidth = 200 + n * (cellW + 5) + (n > 7 || !shareWord ? 125 : 175);
  // many years: smaller figures so a full window still fits the page width
  const dense = n > 6;
  const valFs = dense ? "fs-12" : "fs-13.5";
  const noteFs = dense ? "fs-11" : "fs-11.5";
  // a full window of years leaves no room for the share column; the total bar carries size
  const share = n > 7 ? undefined : shareWord;

  return (
    <div className="overflow-x-auto" role="table" aria-label={ariaLabel}>
      <table className={`${few ? "" : "w-full"} border-separate fs-13`} style={{ borderSpacing: 5, minWidth }}>
        <thead>
          <tr>
            <th className="px-2 pb-1 text-left align-bottom fs-12 font-medium text-faint">{rowTitle ?? ""}</th>
            {columns.map((c) => (
              <th key={c.label} className="px-1 pb-1 align-bottom font-medium" style={{ width: cellW }} title={c.title}>
                <div className="mx-auto mb-1.5 h-[3px] w-8 rounded-full" style={{ background: c.color }} />
                <div className="fs-13 font-semibold text-foreground">{c.label}</div>
                {c.sub && <div className="fs-11.5 font-normal text-faint">{c.sub}</div>}
              </th>
            ))}
            <th className="px-2 pb-1 text-left align-bottom fs-13 font-semibold text-foreground" style={{ width: n > 6 ? 115 : 130 }}>{totalWord}</th>
            {share && <th className="px-2 pb-1 text-right align-bottom fs-13 font-semibold text-foreground" style={{ width: 60 }}>{share}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <th scope="row" className="max-w-[230px] truncate px-2 pr-4 text-left font-medium text-foreground" title={r.label}>
                {r.label}
              </th>
              {columns.map((c, j) => {
                const v = r.values[j] || 0;
                const pct = tone(v);
                const dark = pct > 52;
                return (
                  <td
                    key={c.label}
                    className={`rounded-md ${dense ? "px-0.5" : "px-1.5"} py-2 text-center`}
                    style={{
                      background: v > 0 ? `color-mix(in srgb, ${c.color} ${pct}%, var(--color-panel))` : "var(--color-panel-2)",
                      color: dark ? "#fff" : "var(--color-foreground)",
                    }}
                    title={`${r.label} · ${c.label}: ${v > 0 ? fmtUSDFull(v) : "—"}`}
                  >
                    <div className={`tabular whitespace-nowrap ${valFs} font-semibold leading-tight`}>{v > 0 ? fmtUSD(v) : "—"}</div>
                    {v > 0 && r.notes?.[j] && (
                      <div className={`tabular whitespace-nowrap ${noteFs} leading-tight`} style={{ opacity: dark ? 0.85 : 0.7 }}>{r.notes[j]}</div>
                    )}
                  </td>
                );
              })}
              <td className="px-2" title={fmtUSDFull(rowTotals[i])}>
                <div className="tabular whitespace-nowrap fs-13.5 font-semibold">{fmtUSD(rowTotals[i])}</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--color-panel-2)]">
                  <div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${maxRow > 0 ? (rowTotals[i] / maxRow) * 100 : 0}%` }} />
                </div>
              </td>
              {share && (
                <td className="tabular px-2 text-right fs-13 text-muted">{grand > 0 ? fmtPct(rowTotals[i] / grand, 1) : "—"}</td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="border-t border-[var(--color-border)] px-2 pt-2 text-left font-semibold text-foreground">
              {totalRowLabel ?? totalWord}
            </th>
            {colTotals.map((v, j) => (
              <td key={j} className="border-t border-[var(--color-border)] px-1.5 pt-2 text-center" title={fmtUSDFull(v)}>
                <div className={`tabular whitespace-nowrap ${valFs} font-semibold`}>{v > 0 ? fmtUSD(v) : "—"}</div>
                {grand > 0 && <div className={`tabular ${noteFs} text-faint`}>{fmtPct(v / grand, 1)}</div>}
              </td>
            ))}
            <td className="border-t border-[var(--color-border)] px-2 pt-2" title={fmtUSDFull(grand)}>
              <div className="tabular whitespace-nowrap fs-14 font-bold">{fmtUSD(grand)}</div>
            </td>
            {share && <td className="tabular border-t border-[var(--color-border)] px-2 pt-2 text-right fs-13 text-muted">{grand > 0 ? "100%" : "—"}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

