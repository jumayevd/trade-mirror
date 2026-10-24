"use client";

import { fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import { useHoverTip } from "@/components/charts/HoverTip";

/**
 * Which sectors carry the positive discrepancy, and how each has moved: one row
 * per sector — a bar for its size over the period, on one scale for every row,
 * and a strip of columns for its years.
 *
 * Two questions, so two marks rather than one grid of printed figures. Size is
 * a magnitude: bars on a common baseline compare exactly, where shades of one
 * colour only rank. The trend is a shape: each strip is scaled to its own
 * largest year, so a small sector's rise reads as clearly as a large one's (its
 * size is the bar beside it). A year the books cover only in part — the derived
 * years, built from the months both sides reported — is hatched and paler: its
 * lower column is fewer months, not a smaller gap.
 *
 * The rows add up: the top sectors, then every other sector together, then the
 * total. Exact figures are in the tooltip.
 */

export interface TrendYear {
  year: number;
  /** "2025*" for a partial year. */
  label: string;
  partial: boolean;
  /** The months a partial year covers, e.g. "Jan–Oct". */
  months?: string;
}

export interface TrendRow {
  key: string;
  label: string;
  /** Positive discrepancy per year, in the order of `years`. */
  values: number[];
}

export default function SectorTrend({
  rows, years, totals, words,
}: {
  rows: TrendRow[];
  years: TrendYear[];
  /** Every sector, per year: the bottom row. */
  totals: number[];
  words: { sector: string; total: string; share: string; trend: string; all: string; ofYear: string; partial: string; aria: string };
}) {
  const tip = useHoverTip();
  const sum = (v: number[]) => v.reduce((a, b) => a + b, 0);
  const grand = sum(totals);
  const maxRow = Math.max(0, ...rows.map((r) => sum(r.values)));
  const showTrend = years.length > 1;
  const cols = showTrend
    ? "grid-cols-[minmax(130px,220px)_minmax(140px,1fr)_auto_minmax(170px,1.15fr)]"
    : "grid-cols-[minmax(130px,220px)_minmax(160px,1fr)_auto]";

  const strip = (label: string, values: number[], strong: boolean) => {
    const peak = Math.max(0, ...values);
    return (
      <div className="flex h-9 items-end gap-[2px]" role="group"
        aria-label={`${label}: ${years.map((y, i) => `${y.label} ${fmtUSD(values[i])}`).join(", ")}`}>
        {years.map((y, i) => {
          const v = values[i];
          const h = peak > 0 && v > 0 ? Math.max(6, (v / peak) * 100) : 0;
          const fill = strong ? "var(--color-foreground)" : "var(--color-positive)";
          return (
            <div key={y.year} tabIndex={0}
              aria-label={`${y.label}${y.months ? ` (${y.months})` : ""}: ${v > 0 ? fmtUSDFull(v) : "—"}`}
              className="flex h-full min-w-[6px] flex-1 items-end outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
              {...tip.bind(
                <>
                  <div className="font-semibold">{label} · {y.label}{y.months ? ` (${y.months})` : ""}</div>
                  <div className="tabular mt-0.5">{v > 0 ? fmtUSDFull(v) : "—"}</div>
                  {!strong && totals[i] > 0 && v > 0 && (
                    <div className="tabular text-muted">{fmtPct(v / totals[i], 1)} {words.ofYear}</div>
                  )}
                  {y.partial && <div className="mt-1 text-faint">{words.partial}</div>}
                </>,
              )}
            >
              {/* a 2px stub marks a year with no gap, so the strip keeps its rhythm */}
              <div className="w-full rounded-t-[3px]"
                style={{
                  height: h > 0 ? `${h}%` : 2,
                  background: h > 0
                    ? (y.partial
                      ? `repeating-linear-gradient(135deg, color-mix(in srgb, ${fill} 55%, transparent) 0 3px, color-mix(in srgb, ${fill} 22%, transparent) 3px 6px)`
                      : fill)
                    : "var(--color-border)",
                }} />
            </div>
          );
        })}
      </div>
    );
  };

  const row = (key: string, label: string, values: number[], kind: "sector" | "other" | "all") => {
    const total = sum(values);
    const strong = kind === "all";
    return (
      <div key={key}
        className={`grid ${cols} items-center gap-x-4 py-1.5 ${strong ? "mt-1.5 border-t border-[var(--color-border)] pt-3" : ""}`}>
        <div className={`truncate fs-13 ${strong ? "font-semibold" : kind === "other" ? "italic text-muted" : "font-medium"} text-foreground`} title={label}>
          {label}
        </div>
        <div className="flex items-center gap-2.5" title={fmtUSDFull(total)}>
          {!strong && (
            <div className="h-3.5 min-w-0 flex-1">
              <div className="h-full rounded-r-[4px]"
                style={{
                  width: `${maxRow > 0 ? Math.max(0.5, (total / maxRow) * 100) : 0}%`,
                  background: kind === "other" ? "color-mix(in srgb, var(--color-positive) 45%, var(--color-panel))" : "var(--color-positive)",
                }} />
            </div>
          )}
          <span className={`tabular whitespace-nowrap ${strong ? "fs-14 font-bold" : "fs-13 font-semibold"}`}>{fmtUSD(total)}</span>
        </div>
        <span className="tabular w-[50px] text-right fs-12.5 text-muted">{grand > 0 ? fmtPct(total / grand, 1) : "—"}</span>
        {showTrend && strip(label, values, strong)}
      </div>
    );
  };

  const named = rows.filter((r) => r.key !== "__other");
  const other = rows.find((r) => r.key === "__other");

  return (
    <div role="figure" aria-label={words.aria}>
      <div className={`grid ${cols} items-end gap-x-4 pb-1.5 fs-12 font-medium text-faint`}>
        <span>{words.sector}</span>
        <span>{words.total}</span>
        <span className="w-[50px] text-right">{words.share}</span>
        {showTrend && (
          <div className="flex gap-[2px]">
            {years.map((y) => (
              <span key={y.year} className="min-w-[6px] flex-1 truncate text-center tabular fs-11" title={y.months ? `${y.label} (${y.months})` : y.label}>
                {/* the strip is narrow: two-digit years keep a decade legible */}
                {years.length > 6 ? `’${String(y.year).slice(2)}${y.partial ? "*" : ""}` : y.label}
              </span>
            ))}
          </div>
        )}
      </div>
      {named.map((r) => row(r.key, r.label, r.values, "sector"))}
      {other && row(other.key, other.label, other.values, "other")}
      {row("__all", words.all, totals, "all")}
      {tip.node}
    </div>
  );
}
