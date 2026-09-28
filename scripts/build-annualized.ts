/**
 * Annualize the monthly HS6 book for the years the annual workbook never
 * reached, so the yearly basis can carry them everywhere — including the
 * statically generated profile pages — without fetching the 40MB monthly
 * detail at runtime.
 *
 *   npx tsx scripts/build-annualized.ts
 *
 * Reads public/data/monthly-hs6.json (the committed detail layer, exactly what
 * the client would fold) and sums it per partner × HS6 × year for every year
 * past meta.years. The output is small — two partial years of HS6 lines — and
 * is byte-for-byte the same arithmetic monthlySource() performs on the client,
 * which the audit asserts, so the derived years cannot mean two things.
 *
 * A derived year is a different vintage: the annual workbook is a single
 * finished extract, while these are months still filling up (Uzbekistan's
 * import book currently ends before the partners' export books do). The
 * dashboard marks them as derived rather than hiding them.
 */
import fs from "node:fs";
import path from "node:path";

interface Packed { v: number; y0: number; p: string[]; k: string[]; r: number[][] }

const ROOT = process.cwd();
const detail: Packed = JSON.parse(
  fs.readFileSync(path.join(ROOT, "public", "data", "monthly-hs6.json"), "utf8"),
);
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "meta.json"), "utf8"));
const annualYears = new Set<number>(meta.years);

// (partner, code, year) -> [pe, ui]
const acc = new Map<number, [number, number]>();
const nK = detail.k.length;
let firstYear = Infinity, lastYear = -Infinity, monthRows = 0;
for (const row of detail.r) {
  const y = detail.y0 + ((row[2] / 12) | 0);
  if (annualYears.has(y)) continue;
  const id = (row[0] * nK + row[1]) * 32 + (y - detail.y0);
  const a = acc.get(id) ?? [0, 0];
  a[0] += row[3]; a[1] += row[4];
  acc.set(id, a);
  if (y < firstYear) firstYear = y;
  if (y > lastYear) lastYear = y;
  monthRows++;
}

const y0 = Number.isFinite(firstYear) ? firstYear : detail.y0;
const rows: number[][] = [];
for (const [id, [pe, ui]] of acc) {
  const yOff = id % 32;
  const rest = (id / 32) | 0;
  const kIdx = rest % nK;
  const pIdx = (rest / nK) | 0;
  rows.push([pIdx, kIdx, detail.y0 + yOff - y0, Math.round(pe), Math.round(ui)]);
}
rows.sort((a, b) => a[2] - b[2] || a[0] - b[0] || a[1] - b[1]);

const out: Packed = { v: 1, y0, p: detail.p, k: detail.k, r: rows };
const dest = path.join(ROOT, "src", "data", "annualized-hs6.json");
fs.writeFileSync(dest, JSON.stringify(out));
const years = [...new Set(rows.map((r) => y0 + r[2]))].sort();
console.log(
  `wrote ${path.relative(ROOT, dest)}: ${rows.length.toLocaleString()} HS6 cell-years ` +
  `for ${years.join(", ")} from ${monthRows.toLocaleString()} month rows ` +
  `(${(fs.statSync(dest).size / 1e6).toFixed(1)} MB)`,
);
