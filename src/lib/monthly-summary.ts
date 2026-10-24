/**
 * The monthly chapter book and the little the dataset needs from it up front.
 *
 * The book itself (public/data/monthly.json, ~250k rows) loads on demand, the
 * first time a view needs monthly rows. Four facts drawn from it are needed on
 * every page, monthly basis or not, so they are derived at build time
 * (scripts/build-monthly-summary.ts → src/data/monthly-summary.json) and ship
 * in the bundle: which months each book reported (the month rule), how far
 * Uzbekistan's import book reaches in each year, and which months of a year
 * both books reported. The logic is the one src/lib/dataset.ts used to run
 * over the whole book at load; the snapshot script proves the figures equal.
 *
 * Months are bitmasks per year: bit m − 1 set for calendar month m.
 */

/** monthly.json: [pIdx, kIdx, monthOffset, pe, ui], monthOffset = (year − y0) × 12 + (month − 1). */
export interface PackedMonthly {
  v: number;
  y0: number;
  p: string[];
  k: string[];
  monthsByYear: Record<string, number[]>;
  r: number[][];
}

export interface MonthlySummary {
  v: 1;
  y0: number;
  /** Calendar months reported in a year, by either book. */
  monthsByYear: Record<string, number[]>;
  /** year → months Uzbekistan's import book carries. */
  uzbImport: Record<string, number>;
  /** partner → year → months the partner reported exports to Uzbekistan. */
  partnerExport: Record<string, Record<string, number>>;
  /** year → the last month with any import recorded. */
  lastUiMonth: Record<string, number>;
  /** year → months both books reported, on at least one (partner × code) line. */
  comparable: Record<string, number[]>;
}

/** Lines at or below this value are treated as not reported (see NOISE in dataset.ts). */
export const NOISE = 0;

export function summarizeMonthly(book: PackedMonthly): MonthlySummary {
  const uzbImport: Record<string, number> = {};
  const partnerExport: Record<string, Record<string, number>> = {};
  const lastUiMonth: Record<string, number> = {};
  // both books are tested per (partner × code × month), summed first: one such
  // line can span two rows when the live-API extension appended import-only rows
  const line = new Map<string, { y: number; m: number; pe: number; ui: number }>();

  for (const row of book.r) {
    const p = book.p[row[0]];
    const y = book.y0 + Math.floor(row[2] / 12);
    const m = (row[2] % 12) + 1;
    const [pe, ui] = [row[3], row[4]];
    const bit = 1 << (m - 1);
    if (ui > 0) {
      uzbImport[y] = (uzbImport[y] ?? 0) | bit;
      if (m > (lastUiMonth[y] ?? 0)) lastUiMonth[y] = m;
    }
    if (pe > 0) {
      const byYear = (partnerExport[p] ??= {});
      byYear[y] = (byYear[y] ?? 0) | bit;
    }
    const key = `${p}|${book.k[row[1]]}|${y * 100 + m}`;
    const e = line.get(key) ?? { y, m, pe: 0, ui: 0 };
    e.pe += pe; e.ui += ui;
    line.set(key, e);
  }

  const both = new Map<number, Set<number>>();
  for (const e of line.values()) {
    if (e.pe <= NOISE || e.ui <= NOISE) continue;
    let set = both.get(e.y);
    if (!set) { set = new Set(); both.set(e.y, set); }
    set.add(e.m);
  }
  const comparable = Object.fromEntries([...both].map(([y, set]) => [y, [...set].sort((a, b) => a - b)]));

  return { v: 1, y0: book.y0, monthsByYear: book.monthsByYear, uzbImport, partnerExport, lastUiMonth, comparable };
}
