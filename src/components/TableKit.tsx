"use client";

import { hsLabel } from "@/lib/dataset";
import { fmtPct, fmtUSD, fmtUSDFull } from "@/lib/format";
import type { Lang } from "@/lib/locales";
import { briefHsLabel } from "@/lib/short-labels";

/**
 * Cells shared by the two ranking tables (Product Analysis, Discrepancy &
 * Risk), which wear the `.cbu-table` look from globals.css: a navy head on a
 * gold rule, compact rows, the figure that ranks a row drawn as well as
 * printed.
 */

/** Positive discrepancy: the figure in navy, over a bar scaled to the largest row listed. */
export function GapCell({ value, max }: { value: number; max: number }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <span className="inline-flex w-full min-w-[96px] flex-col items-end gap-[5px]" title={fmtUSDFull(value)}>
      <span className="tabular fs-14.5 font-semibold leading-none text-[var(--color-positive)]">{fmtUSD(value)}</span>
      <span className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]" aria-hidden>
        <span className="block h-full rounded-full bg-[var(--color-positive)]" style={{ width: `${w}%` }} />
      </span>
    </span>
  );
}

/** Share of the export that is positive discrepancy, on a short gold track. */
export function ShareCell({ share }: { share: number | null }) {
  if (share == null) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex flex-col items-end gap-[5px]">
      <span className="tabular fs-14 font-medium leading-none">{fmtPct(share, share < 0.1 ? 1 : 0)}</span>
      <span className="h-[4px] w-12 overflow-hidden rounded-full bg-[var(--color-panel-2)]" aria-hidden>
        <span className="block h-full rounded-full bg-[var(--color-gold)]" style={{ width: `${Math.max(2, Math.min(1, share) * 100)}%` }} />
      </span>
    </span>
  );
}

/**
 * A product's name in a table cell. A line the nomenclature file has no text
 * for (a code new in HS 2022) borrows its heading's, rather than reading "HS 870121".
 */
export function productName(cmd: string, lang: Lang, label: string): string {
  const text = label.startsWith("HS ") && cmd.length === 6 ? hsLabel(cmd.slice(0, 4)) : label;
  return briefHsLabel(cmd, lang, text);
}

/** The row's place in the full ranking, not just on this page. */
export function RankCell({ n }: { n: number }) {
  return <span className="tabular fs-13 text-faint">{n}</span>;
}
