/**
 * Reconciliation test: the live engine vs the source workbook.
 *
 * Drives src/lib/dataset.ts through many filter combinations and checks the
 * as-reported totals it returns against the same slice computed directly from
 * data/raw/excel-cells.json. Any drift means a figure on screen would not match
 * a UN Comtrade query run with the same filter.
 *
 * Run: npm run data:verify
 */
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_FILTER, observedTotals, meta, type Filter } from "../src/lib/dataset";

interface SrcCell { p: string; l: number; k: string; y: number; pe: number; ui: number }
const src: SrcCell[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "raw", "excel-cells.json"), "utf8"),
).cells;

/** The workbook does not carry HS4; it is the exact truncation of HS6. */
const rowsAt = (level: number): SrcCell[] => {
  if (level !== 4) return src.filter((r) => r.l === level);
  const m = new Map<string, SrcCell>();
  for (const r of src) {
    if (r.l !== 6) continue;
    const k = r.k.slice(0, 4);
    const key = `${r.p}|${k}|${r.y}`;
    const a = m.get(key) ?? { p: r.p, l: 4, k, y: r.y, pe: 0, ui: 0 };
    a.pe += r.pe; a.ui += r.ui;
    m.set(key, a);
  }
  return [...m.values()];
};
const BY_LEVEL = new Map([2, 4, 6].map((l) => [l, rowsAt(l)]));

function expected(level: number, f: Filter, codes: string[]) {
  const years = new Set(f.years);
  const partners = new Set(f.country);
  const codeSet = new Set(codes);
  let pe = 0, ui = 0;
  for (const r of BY_LEVEL.get(level)!) {
    if (years.size && !years.has(r.y)) continue;
    if (partners.size && !partners.has(r.p)) continue;
    if (codeSet.size && !codeSet.has(r.k)) continue;
    pe += r.pe; ui += r.ui;
  }
  return { pe, ui };
}

const partners = meta.partners.map((p) => p.iso3);
const chapters = meta.chapters.map((c) => c.chapter);
const hs6 = Object.keys(meta.hs6labels);
const hs4 = Object.keys(meta.hs4labels);
const pick = <T,>(a: T[], n: number) => {
  const out: T[] = [];
  for (let i = 0; i < n && a.length; i++) out.push(a[Math.floor((i * 7919 + 13) % a.length)]);
  return [...new Set(out)];
};

let checks = 0, fails = 0;
const report = (name: string, level: number, f: Filter, codes: string[]) => {
  const got = observedTotals(f, level, undefined);
  const want = expected(level, f, codes);
  checks++;
  if (got.pe !== want.pe || got.ui !== want.ui) {
    fails++;
    console.log(`  FAIL ${name}`);
    console.log(`       engine   exports ${got.pe.toLocaleString()}  imports ${got.ui.toLocaleString()}`);
    console.log(`       workbook exports ${want.pe.toLocaleString()}  imports ${want.ui.toLocaleString()}`);
  }
};

const base = (): Filter => ({ ...DEFAULT_FILTER, years: [...meta.years], country: [], hs2: [], hs4: [], hs6: [] });

console.log("Reconciling the engine against the workbook…\n");

// 1. whole dataset at each level
for (const lvl of [2, 4, 6]) report(`all data, HS${lvl}`, lvl, base(), []);

// 2. single years
for (const y of meta.years) {
  for (const lvl of [2, 6]) report(`year ${y}, HS${lvl}`, lvl, { ...base(), years: [y] }, []);
}

// 3. year subsets
report("years 2019+2023, HS2", 2, { ...base(), years: [2019, 2023] }, []);
report("years 2019+2023, HS6", 6, { ...base(), years: [2019, 2023] }, []);

// 4. single partners
for (const p of pick(partners, 25)) {
  report(`partner ${p}, HS2`, 2, { ...base(), country: [p] }, []);
  report(`partner ${p}, HS6`, 6, { ...base(), country: [p] }, []);
}

// 5. multi-partner
const multi = pick(partners, 5);
report(`partners ${multi.join("+")}, HS2`, 2, { ...base(), country: multi }, []);

// 6. chapters
for (const c of pick(chapters, 20)) {
  report(`chapter ${c}, HS2`, 2, { ...base(), hs2: [c] }, [c]);
}

// 7. HS6 products
for (const k of pick(hs6, 25)) {
  report(`product ${k}, HS6`, 6, { ...base(), hs6: [k] }, [k]);
}

// 8. HS4 headings
for (const k of pick(hs4, 20)) {
  report(`heading ${k}, HS4`, 4, { ...base(), hs4: [k] }, [k]);
}

// 9. crossed: partner x product x year
for (const p of pick(partners, 8)) {
  for (const k of pick(hs6, 3)) {
    report(`${p} x ${k} x 2023, HS6`, 6, { ...base(), country: [p], hs6: [k], years: [2023] }, [k]);
  }
}

// 10. crossed: partners x chapters
for (const p of pick(partners, 6)) {
  for (const c of pick(chapters, 3)) {
    report(`${p} x chapter ${c}, HS2`, 2, { ...base(), country: [p], hs2: [c] }, [c]);
  }
}

/* ------------------------------------------------------------------ */
/* Monthly basis: the engine's month path vs the monthly workbook       */
/* ------------------------------------------------------------------ */

interface MonthSrc { p: string; k: string; y: number; m: number; pe: number; ui: number }
const monthlySrc: MonthSrc[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "raw", "monthly-cells.json"), "utf8"),
).cells;

function expectedMonthly(f: Filter, codes: string[]) {
  const years = new Set(f.years);
  const months = new Set(f.months);
  const partners = new Set(f.country);
  const codeSet = new Set(codes);
  let pe = 0, ui = 0;
  for (const r of monthlySrc) {
    if (years.size && !years.has(r.y)) continue;
    if (months.size && !months.has(r.m)) continue;
    if (partners.size && !partners.has(r.p)) continue;
    if (codeSet.size && !codeSet.has(r.k)) continue;
    pe += r.pe; ui += r.ui;
  }
  return { pe, ui };
}

const mbase = (): Filter => ({ ...base(), granularity: "month", months: [] });
const reportMonthly = (name: string, f: Filter, codes: string[]) => {
  const got = observedTotals(f, 2, undefined);
  const want = expectedMonthly(f, codes);
  checks++;
  if (got.pe !== want.pe || got.ui !== want.ui) {
    fails++;
    console.log(`  FAIL ${name}`);
    console.log(`       engine   exports ${got.pe.toLocaleString()}  imports ${got.ui.toLocaleString()}`);
    console.log(`       workbook exports ${want.pe.toLocaleString()}  imports ${want.ui.toLocaleString()}`);
  }
};

reportMonthly("monthly: all data", mbase(), []);
for (const y of [2017, 2020, 2024, 2025, 2026]) {
  reportMonthly(`monthly: year ${y}`, { ...mbase(), years: [y] }, []);
}
reportMonthly("monthly: 2024 Jan only", { ...mbase(), years: [2024], months: [1] }, []);
reportMonthly("monthly: 2024 Q4", { ...mbase(), years: [2024], months: [10, 11, 12] }, []);
reportMonthly("monthly: Jan across all years", { ...mbase(), months: [1] }, []);
for (const p of pick(partners, 6)) {
  reportMonthly(`monthly: partner ${p}, 2023 H1`, { ...mbase(), country: [p], years: [2023], months: [1, 2, 3, 4, 5, 6] }, []);
}
for (const c of pick(chapters, 6)) {
  reportMonthly(`monthly: chapter ${c}, 2025`, { ...mbase(), hs2: [c], years: [2025] }, [c]);
}
reportMonthly("monthly: CHN x 85 x 2026 Mar", { ...mbase(), country: ["CHN"], hs2: ["85"], years: [2026], months: [3] }, ["85"]);

console.log(`\n${checks - fails}/${checks} slices reconcile exactly.`);
if (fails) {
  console.error(`${fails} MISMATCH(ES) — figures would not agree with UN Comtrade.`);
  process.exit(1);
}
console.log("Engine output is 1:1 with the workbook across every slice tested.");
