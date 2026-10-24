import { aggregate, yearsFor, type Aggregate, type Filter } from "./dataset";

/**
 * Who and what carry an aggregate's positive discrepancy, largest first:
 * partner countries off the partner rollup, and products as the HS6 channels
 * summed by code across partners — the measurement grain, so they sum against
 * the same total the headline shows.
 *
 * The trade overview's two treemaps and the front page's trade card both read
 * this, so for the same period they list the same names and figures.
 */
export function gapLeaders(data: Aggregate) {
  const countries = data.partners.filter((p) => p.posT > 0).sort((a, b) => b.posT - a.posT);
  const byCmd = new Map<string, { cmd: string; label: string; value: number }>();
  for (const c of data.baseChannels6) {
    if (c.posT <= 0) continue;
    const e = byCmd.get(c.cmd) ?? { cmd: c.cmd, label: c.cmdLabel, value: 0 };
    e.value += c.posT;
    byCmd.set(c.cmd, e);
  }
  const products = [...byCmd.values()].sort((a, b) => b.value - a.value);
  return { countries, products };
}

/** The positive discrepancy of one sector (product category) in each year. */
export interface CategoryYears { key: string; values: number[]; total: number }

const categoryYearCache = new Map<string, { years: number[]; rows: CategoryYears[] }>();

/**
 * The positive discrepancy by sector and year over the whole yearly window,
 * under the given partner and product filters (its own years and months are
 * ignored). One window aggregate, read per channel-year: each year's column
 * sums to that year's headline figure exactly, residual chapters included.
 * Sectors run largest first, the unclassified residual last. The window
 * aggregate is the costly part (~0.5 s), so results are kept per filter.
 */
export function gapByCategoryYear(f: Filter): { years: number[]; rows: CategoryYears[] } {
  const years = yearsFor("year");
  const scope: Filter = { ...f, granularity: "year", years, months: [] };
  const key = JSON.stringify(scope);
  const hit = categoryYearCache.get(key);
  if (hit) return hit;

  const col = new Map(years.map((y, i) => [y, i]));
  const byCat = new Map<string, number[]>();
  for (const c of aggregate(scope).baseChannels) {
    let row = byCat.get(c.category);
    if (!row) { row = years.map(() => 0); byCat.set(c.category, row); }
    for (const r of c.years) {
      const i = col.get(r.y);
      if (i !== undefined) row[i] += r.posY;
    }
  }
  const rows = [...byCat.entries()]
    .map(([k, values]) => ({ key: k, values, total: values.reduce((a, b) => a + b, 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => Number(a.key === "residual") - Number(b.key === "residual") || b.total - a.total);
  const out = { years, rows };
  categoryYearCache.set(key, out);
  return out;
}
