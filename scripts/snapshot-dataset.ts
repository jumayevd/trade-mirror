/**
 * Fingerprint of everything the trade dataset computes, to prove a refactor of
 * src/lib/dataset.ts changed no figure. Run it before and after the change and
 * compare the two outputs: every line must match.
 *
 *     npx tsx scripts/snapshot-dataset.ts > before.txt
 *
 * It covers the yearly aggregate of every year and of the whole window, the
 * monthly aggregate of every monthly year (chapter level, then again with the
 * HS6 detail loaded), and the month bookkeeping the pages read directly.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as ds from "@/lib/dataset";

const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v, (_k, x) =>
    x instanceof Map ? [...x.entries()] : x instanceof Set ? [...x] : x)).digest("hex").slice(0, 16);

const years = ds.yearsFor("year");
const months = ds.yearsFor("month");
const out: string[] = [];
const line = (k: string, v: unknown) => out.push(`${k}\t${hash(v)}`);

// The yearly basis and the month bookkeeping first, before any monthly rows
// load — what a trade page computes on first paint.
for (const y of years) line(`year ${y}`, ds.aggregate({ ...ds.DEFAULT_FILTER, years: [y] }));
line("year all", ds.aggregate({ ...ds.DEFAULT_FILTER, years: [...years] }));
line("yearly years", years);
line("monthly years", months);
for (const y of [...new Set([...years, ...months])]) {
  line(`months of ${y}`, ds.monthsOfYear(y));
  line(`comparable months of ${y}`, ds.comparableMonthsOfYear(y));
  line(`derived ${y}`, ds.isDerivedYear(y));
  line(`needs detail ${y}`, ds.needsMonthlyDetail(y));
  line(`official ${y}`, ds.officialImportsOver([y]));
  line(`matched months ${y}`, ds.meta.partners.map((p) => ds.matchedMonthsOf(p.iso3, y)));
}

// newer builds load the monthly chapter rows on demand; older ones have them already
const loadChapters = (ds as Record<string, unknown>).loadMonthlyChapters as ((p: unknown) => void) | undefined;
if (loadChapters) loadChapters(JSON.parse(readFileSync("public/data/monthly.json", "utf8")));
for (const y of months) line(`month ${y}`, ds.aggregate({ ...ds.DEFAULT_FILTER, granularity: "month", years: [y], months: [] }));
line("month all", ds.aggregate({ ...ds.DEFAULT_FILTER, granularity: "month", years: [...months], months: [] }));
line("month 1-3 of last", ds.aggregate({ ...ds.DEFAULT_FILTER, granularity: "month", years: [months[months.length - 1]], months: [1, 2, 3] }));

ds.loadMonthlyDetail(JSON.parse(readFileSync("public/data/monthly-hs6.json", "utf8")));
for (const y of months.slice(-2)) line(`month ${y} +detail`, ds.aggregate({ ...ds.DEFAULT_FILTER, granularity: "month", years: [y], months: [] }));

console.log(out.sort().join("\n"));
