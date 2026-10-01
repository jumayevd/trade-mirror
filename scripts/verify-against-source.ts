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
import { aggregate, DEFAULT_FILTER, loadMonthlyDetail, observedTotals, meta, type Filter } from "../src/lib/dataset";

interface SrcCell { p: string; l: number; k: string; y: number; pe: number; ui: number }
const src: SrcCell[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "raw", "excel-cells.json"), "utf8"),
).cells;

/*
 * ONE GRAIN, like the engine: HS6 is the measurement grain and every coarser
 * level is its exact truncation OF THE WORKBOOK'S OWN HS6 ROWS. The workbook
 * also carries its own HS2 layer, which differs per chapter by confidential
 * trade re-allocated across chapters; the engine no longer reads it, and the
 * delta is reported below as a reconciliation rather than silently absorbed.
 */
const rowsAt = (level: number): SrcCell[] => {
  if (level === 6) return src.filter((r) => r.l === 6);
  const m = new Map<string, SrcCell>();
  for (const r of src) {
    if (r.l !== 6) continue;
    const k = r.k.slice(0, level);
    const key = `${r.p}|${k}|${r.y}`;
    const a = m.get(key) ?? { p: r.p, l: level, k, y: r.y, pe: 0, ui: 0 };
    a.pe += r.pe; a.ui += r.ui;
    m.set(key, a);
  }
  return [...m.values()];
};
const BY_LEVEL = new Map([2, 4, 6].map((l) => [l, rowsAt(l)]));

// the workbook's own HS2 layer against the truncation the engine reports
{
  const own = new Map<string, number>();
  for (const r of src) if (r.l === 2) own.set(r.k, (own.get(r.k) ?? 0) + r.pe + r.ui);
  const derived = new Map<string, number>();
  for (const r of BY_LEVEL.get(2)!) derived.set(r.k, (derived.get(r.k) ?? 0) + r.pe + r.ui);
  let absDelta = 0, chaptersOff = 0;
  for (const [k, v] of own) {
    const d = Math.abs(v - (derived.get(k) ?? 0));
    if (d > 1000) { chaptersOff++; absDelta += d; }
  }
  console.log(`note: the workbook's own HS2 layer differs from the truncation of its HS6 rows`);
  console.log(`      in ${chaptersOff} chapters, ${(absDelta / 1e9).toFixed(2)}B USD of |value| re-allocated (confidential lines);`);
  console.log(`      the engine reads the HS6 grain, so chapter slices below are checked against the truncation.`);
}

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

/* Monthly HS6 detail: injected the way the client receives it, then checked
   at HS6 and at the derived HS4 truncation. */
type Hs6Row = [string, string, number, number, number, number];
const monthlyHs6: Hs6Row[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "raw", "monthly-cells-hs6.json"), "utf8"),
).cells;
loadMonthlyDetail(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public", "data", "monthly-hs6.json"), "utf8"),
));

function expectedMonthly(f: Filter, codes: string[]) {
  // chapter slices on the monthly basis: the HS6 sheet truncated, the same
  // grain the engine reads; the HS2 monthly sheet is checked for GLOBAL
  // agreement separately below
  const years = new Set(f.years);
  const months = new Set(f.months);
  const partners = new Set(f.country);
  const codeSet = new Set(codes);
  let pe = 0, ui = 0;
  for (const r of monthlyHs6) {
    if (years.size && !years.has(r[2])) continue;
    if (months.size && !months.has(r[3])) continue;
    if (partners.size && !partners.has(r[0])) continue;
    if (codeSet.size && !codeSet.has(r[1].slice(0, 2))) continue;
    pe += r[4]; ui += r[5];
  }
  return { pe, ui };
}

// the two monthly sheets must agree in aggregate, or the grain swap hid data.
// The source itself carries a small export-side difference between its own
// sheets (~$3.3M on $176B, 0.002%), so the guard fails only on a magnitude
// that could mean lost data, and the measured delta is always reported.
{
  let pe2 = 0, ui2 = 0, pe6 = 0, ui6 = 0;
  for (const r of monthlySrc) { pe2 += r.pe; ui2 += r.ui; }
  for (const r of monthlyHs6) { pe6 += r[4]; ui6 += r[5]; }
  const dPe = Math.abs(pe2 - pe6), dUi = Math.abs(ui2 - ui6);
  console.log(`note: monthly HS2 sheet vs HS6 sheet: Δexports ${dPe.toLocaleString()} USD (${(100 * dPe / pe2).toFixed(4)}%), Δimports ${dUi.toLocaleString()} USD — a source-side difference, reported not absorbed`);
  checks++;
  if (dPe > pe2 * 1e-4 || dUi > ui2 * 1e-4) {
    fails++;
    console.log(`  FAIL monthly sheets diverge past 0.01%: pe ${pe2.toLocaleString()} vs ${pe6.toLocaleString()}, ui ${ui2.toLocaleString()} vs ${ui6.toLocaleString()}`);
  }
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

function expectedMonthly6(f: Filter, level: number) {
  const years = new Set(f.years);
  const months = new Set(f.months);
  const partners = new Set(f.country);
  const codes = new Set(level === 6 ? f.hs6 : f.hs4);
  let pe = 0, ui = 0;
  for (const r of monthlyHs6) {
    if (years.size && !years.has(r[2])) continue;
    if (months.size && !months.has(r[3])) continue;
    if (partners.size && !partners.has(r[0])) continue;
    const k = level === 6 ? r[1] : r[1].slice(0, 4);
    if (codes.size && !codes.has(k)) continue;
    pe += r[4]; ui += r[5];
  }
  return { pe, ui };
}

const reportMonthlyDetail = (name: string, f: Filter, level: number) => {
  const got = observedTotals(f, level, undefined);
  const want = expectedMonthly6(f, level);
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

// HS6 detail slices — whole set, periods, partners, codes, and the HS4 truncation
const mHs6Codes = [...new Set(monthlyHs6.map((r) => r[1]))].sort();
const mHs4Codes = [...new Set(mHs6Codes.map((k) => k.slice(0, 4)))].sort();
reportMonthlyDetail("monthly HS6: all data", mbase(), 6);
reportMonthlyDetail("monthly HS4: all data", mbase(), 4);
for (const y of [2019, 2024, 2026]) {
  reportMonthlyDetail(`monthly HS6: year ${y}`, { ...mbase(), years: [y] }, 6);
}
reportMonthlyDetail("monthly HS6: 2024 Q4", { ...mbase(), years: [2024], months: [10, 11, 12] }, 6);
reportMonthlyDetail("monthly HS4: 2025 Jan", { ...mbase(), years: [2025], months: [1] }, 4);
for (const p of pick(partners, 5)) {
  reportMonthlyDetail(`monthly HS6: partner ${p}, 2023`, { ...mbase(), country: [p], years: [2023] }, 6);
}
for (const k of pick(mHs6Codes, 8)) {
  reportMonthlyDetail(`monthly HS6: product ${k}`, { ...mbase(), hs6: [k] }, 6);
}
for (const k of pick(mHs4Codes, 6)) {
  reportMonthlyDetail(`monthly HS4: heading ${k}, 2024`, { ...mbase(), hs4: [k], years: [2024] }, 4);
}
reportMonthlyDetail("monthly HS6: CHN x 851713 x 2025 H1",
  { ...mbase(), country: ["CHN"], hs6: [mHs6Codes.includes("851713") ? "851713" : mHs6Codes[0]], years: [2025], months: [1, 2, 3, 4, 5, 6] }, 6);

/* ------------------------------------------------------------------ */
/* Derived years: the yearly basis past the annual workbook             */
/* ------------------------------------------------------------------ */
/* 2025 and 2026 reach the yearly basis from the build-time annualization of
 * the monthly HS6 book, so their as-reported totals must equal the raw monthly
 * file summed -- the same source anchor the monthly basis is held to. */
for (const y of [2025, 2026]) {
  const got = observedTotals({ ...base(), years: [y] }, 6, undefined);
  let pe = 0, ui = 0;
  for (const r of monthlyHs6) { if (r[2] === y) { pe += r[4]; ui += r[5]; } }
  checks++;
  if (got.pe !== pe || got.ui !== ui) {
    fails++;
    console.log(`  FAIL derived year ${y}`);
    console.log(`       engine   exports ${got.pe.toLocaleString()}  imports ${got.ui.toLocaleString()}`);
    console.log(`       raw      exports ${pe.toLocaleString()}  imports ${ui.toLocaleString()}`);
  }
}


/* ------------------------------------------------------------------ */
/* The month rule: comparisons use only months both books reported      */
/* ------------------------------------------------------------------ */
/* Rebuilt here from the raw sheets, independently of the engine: a month
 * counts for a partner when Uzbekistan's import book has it (HS2 sheet, any
 * import) and the partner reported exports to Uzbekistan in it. The engine's
 * compared exports, imports and positive discrepancy (0% freight) must equal
 * the raw HS6 sheet folded over those months only, per partner x HS6 x year —
 * on the yearly basis (the annualized layer) and the monthly basis alike. */
{
  const uzb = new Set<number>();
  const ptn = new Map<string, Set<number>>();
  for (const r of monthlySrc) {
    const ym = r.y * 100 + r.m;
    if (r.ui > 0) uzb.add(ym);
    if (r.pe > 0) (ptn.get(r.p) ?? ptn.set(r.p, new Set()).get(r.p)!).add(ym);
  }
  const refFor = (y: number) => {
    const acc = new Map<string, [number, number]>();
    for (const r of monthlyHs6) {
      if (r[2] !== y) continue;
      const ym = r[2] * 100 + r[3];
      if (!uzb.has(ym) || !ptn.get(r[0])?.has(ym)) continue;
      const k = `${r[0]}|${r[1]}`;
      const a = acc.get(k) ?? [0, 0];
      a[0] += r[4]; a[1] += r[5];
      acc.set(k, a);
    }
    let pe = 0, ui = 0, pos = 0;
    for (const [x, m] of acc.values()) {
      if (x <= 0 || m <= 0) continue;
      pe += x; ui += m; pos += Math.max(x - m, 0);
    }
    return { pe, ui, pos, lines: acc.size };
  };
  for (const y of [2024, 2025, 2026]) {
    const want = refFor(y);
    const bases: [string, Filter][] = [["monthly", { ...mbase(), years: [y], cif: 0 }]];
    if (!meta.years.includes(y)) bases.unshift(["yearly", { ...base(), years: [y], cif: 0 }]);
    for (const [tag, f] of bases) {
      const a = aggregate(f);
      const pe = a.baseChannels6.reduce((t, c) => t + c.peT, 0);
      const ui = a.baseChannels6.reduce((t, c) => t + c.uiT, 0);
      const pos = a.kpis.positive.central;
      checks++;
      // the annualized layer rounds each cell to the dollar: allow a dollar a line
      const tol = tag === "yearly" ? want.lines : 1;
      if (Math.abs(pe - want.pe) > tol || Math.abs(ui - want.ui) > tol || Math.abs(pos - want.pos) > tol) {
        fails++;
        console.log(`  FAIL month rule, ${tag} ${y}`);
        console.log(`       engine   compared exports ${Math.round(pe).toLocaleString()}  imports ${Math.round(ui).toLocaleString()}  positive ${Math.round(pos).toLocaleString()}`);
        console.log(`       raw      compared exports ${want.pe.toLocaleString()}  imports ${want.ui.toLocaleString()}  positive ${Math.round(want.pos).toLocaleString()}`);
      } else {
        console.log(`note: month rule ${tag} ${y}: compared exports ${(pe / 1e9).toFixed(3)}B, imports ${(ui / 1e9).toFixed(3)}B, positive ${(pos / 1e9).toFixed(3)}B = raw sheets`);
      }
    }
  }
}

console.log(`\n${checks - fails}/${checks} slices reconcile exactly.`);
if (fails) {
  console.error(`${fails} MISMATCH(ES) — figures would not agree with UN Comtrade.`);
  process.exit(1);
}
console.log("Engine output is 1:1 with the workbook across every slice tested.");
