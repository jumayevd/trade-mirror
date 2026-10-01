/**
 * Mirror Trade Dashboard — single calculation source.
 *
 * Descriptive measures (expected CIF, the positive discrepancy, bounded asymmetry,
 * positive share, persistence counts) are computed here, on the filters the user has
 * set. The risk score is not: MTRS v3.0 needs a fitted structural model, so it is
 * built once by scripts/build-risk-index.ts and read from src/data/risk.json as a
 * fixed property of a partner × code cell. All pages and exports read from
 * aggregate() — one version of the numbers everywhere. Missing partner-years are
 * never treated as zero flows.
 */
import cellsRaw from "@/data/cells.json";
import metaRaw from "@/data/meta.json";
import monthlyRaw from "@/data/monthly.json";
import annualizedRaw from "@/data/annualized-hs6.json";
import officialImportsRaw from "@/data/official-imports.json";
import productsRaw from "@/data/products.json";
import riskRaw from "@/data/risk.json";
import hsFullRaw from "@/data/hs-full.json";
import { labelLang, tCategory, tCountry, tRegion, tText } from "@/lib/labels";

export const METHODOLOGY_VERSION = "3.1";

export type Tier = "High" | "Medium" | "Low";
/** MTRS band. Ordered most to least urgent; `low` also covers unscored cells. */
export type RiskBand = "critical" | "high" | "elevated" | "low";
export type Robustness = "robust" | "freight-sensitive" | "coverage-sensitive" | "insufficient";

/**
 * pe/ui are as reported. pc/uc, set on cells folded from months, are the same
 * two values over only the months both books reported for that partner (see
 * monthMatched) — on the monthly basis's HS6 cells, over the months both books
 * recorded that line (see THE MONTH GRAIN); every comparison between the books
 * reads those. Absent, the
 * whole value is comparable — the annual workbook covers full years on both
 * sides.
 */
interface Cell {
  p: string; k: string; c: string; cat: string; l: number; y: number; pe: number; ui: number;
  pc?: number; uc?: number; uw?: number; pw?: number;
  /** Monthly basis, HS6: the months both books recorded the line, as flat
   *  [pe, ui, pe, ui, …] pairs — the grain the gap is measured at there. */
  mo?: number[];
}
/** A cell's values on the months both books reported. */
const cmpPe = (r: Cell): number => r.pc ?? r.pe;
const cmpUi = (r: Cell): number => r.uc ?? r.ui;
export interface PartnerMeta {
  iso3: string; name: string; region: string; code: string; transit: boolean;
  coverage: number; reportedYears: number[]; lastReportedYear: number; lapse: boolean; tier: Tier;
}
export interface Meta {
  generatedAt: string;
  reporter: { code: string; iso3: string; name: string };
  window: { start: number; end: number };
  years: number[];
  defaultYear: number;
  cif: { low: number; central: number; high: number };
  uzbReportingYears: number[];
  partners: PartnerMeta[];
  chapters: { chapter: string; label: string; category: string }[];
  hs4labels: Record<string, string>;
  hs6labels: Record<string, string>;
  categories: { key: string; label: string }[];
  catByChapter: Record<string, string>;
  orphans: { importValue: number; importCells: number };
  datasetRows: number;
}
export interface ProductPartner { iso3: string; name: string; tier: Tier; transit: boolean; ptnExp: number; uzbImp: number; gap: number }
export interface Product {
  cmd: string; label: string; chapter: string; chapterLabel: string; category: string;
  ptnExp: number; uzbImp: number; gap: number; positiveGap: number;
  byYear: { y: number; pe: number; ui: number; gap: number }[];
  partners: ProductPartner[];
  highConfShare: number; transitShare: number;
  uv: { uvUzb: number; uvPtn: number; uvRatio: number; years: number } | null;
}

/**
 * The materiality floor, now zero: a flow counts as reported when it is reported.
 *
 * This used to be $100,000 on each side, and it decided three separate things at
 * once — which channel-years could be compared, which years counted as showing a
 * positive gap, and which channels reached a ranked list. At HS6 that is a
 * severe cut: of the 99,474 partner × product combinations in the source, 48,937
 * have both books in the same year, but only 12,644 clear $100,000 on both sides
 * (analysis/hs6_coverage_*.py, and the workbook it writes).
 *
 * A mirror comparison needs two books; it does not need them to be large. Size
 * is still available where it belongs: the screening list has its own minimum-gap
 * control, and small channels rank low on their own merits rather than being
 * removed before they can be ranked.
 */
const NOISE = 0;

export const meta = metaRaw as unknown as Meta;
export const products = productsRaw as unknown as Product[];
export const DATA_VERSION = meta.generatedAt.slice(0, 10).replace(/-/g, ".");

const categoryOfChapter = (c: string) => meta.catByChapter[c] ?? "instruments";

/**
 * cells.json ships columnar (see scripts/build-from-excel.ts): a partner and a
 * code dictionary plus fixed-order tuples [pIdx, kIdx, yearOffset, pe, ui, uw?, pw?].
 * Chapter, category and HS level are derived here rather than stored, which is
 * what lets the complete dataset — every reported partner × code × year, with no
 * materiality floor — fit in the payload.
 */
interface PackedCells { v: number; y0: number; p: string[]; k: string[]; r: number[][] }

const cells: Cell[] = (() => {
  const packed = cellsRaw as unknown as PackedCells;
  const out: Cell[] = new Array(packed.r.length);
  for (let i = 0; i < packed.r.length; i++) {
    const row = packed.r[i];
    const k = packed.k[row[1]];
    const c = k.slice(0, 2);
    const cell: Cell = {
      p: packed.p[row[0]],
      k,
      c,
      cat: categoryOfChapter(c),
      l: k.length,
      y: packed.y0 + row[2],
      pe: row[3],
      ui: row[4],
    };
    if (row.length > 5) { cell.uw = row[5]; cell.pw = row[6]; }
    out[i] = cell;
  }

  /*
   * Derive HS4 AND HS2 from HS6 by truncation, rather than shipping either.
   *
   * HS4 was always derived — it is defined as the truncation of HS6. HS2 used to
   * be the workbook's own chapter sheet, which is a separate UN Comtrade
   * aggregation of the same trade and does not agree with HS6 cell by cell: a
   * flow booked to a named chapter at HS2 can sit under 999999 at HS6. The grand
   * totals matched, but a reader who switched level saw the reported exports and
   * recorded imports for one chapter change under them, which reads as an error
   * in the data rather than as two different Comtrade queries.
   *
   * Deriving both from the HS6 grain buys that consistency: every level is now
   * the same trade, summed differently, and a chapter is exactly its products.
   * The cost is that the HS2 view no longer reconciles against a raw Comtrade
   * HS2 query — it reconciles against this dashboard's own HS6 view instead.
   */
  const rolled = new Map<string, Cell>();
  for (const r of out) {
    if (r.l !== 6) continue;
    for (const width of [4, 2] as const) {
      const code = r.k.slice(0, width);
      const key = `${width}|${r.p}|${code}|${r.y}`;
      let agg = rolled.get(key);
      if (!agg) {
        agg = { p: r.p, k: code, c: r.c, cat: r.cat, l: width, y: r.y, pe: 0, ui: 0 };
        rolled.set(key, agg);
      }
      agg.pe += r.pe;
      agg.ui += r.ui;
      if (r.uw !== undefined && r.pw !== undefined) {
        agg.uw = (agg.uw ?? 0) + r.uw;
        agg.pw = (agg.pw ?? 0) + r.pw;
      }
    }
  }
  // the shipped chapter rows go, replaced by the rollup of their own products
  const derived = out.filter((r) => r.l !== 2);
  for (const cell of rolled.values()) derived.push(cell);
  return derived;
})();

/* ------------------------------------------------------------------ */
/* Monthly dataset (UN Comtrade monthly, chapter level)                 */
/* ------------------------------------------------------------------ */

/**
 * monthly.json ships columnar like cells.json, with the time axis in months:
 * [pIdx, kIdx, monthOffset, pe, ui] where monthOffset = (year − y0) × 12 + (month − 1).
 * This bundled file carries the chapter (HS2) series; the far larger HS6 detail
 * lives in public/data/monthly-hs6.json and is fetched on demand (see below).
 */
interface PackedMonthly {
  v: number;
  y0: number;
  p: string[];
  k: string[];
  monthsByYear: Record<string, number[]>;
  r: number[][];
}
interface MonthCell { p: string; k: string; c: string; cat: string; y: number; m: number; pe: number; ui: number }

const monthlyPacked = monthlyRaw as unknown as PackedMonthly;

const monthlyCells: MonthCell[] = (() => {
  if (!monthlyPacked || !Array.isArray(monthlyPacked.r)) return [];
  const out: MonthCell[] = new Array(monthlyPacked.r.length);
  for (let i = 0; i < monthlyPacked.r.length; i++) {
    const row = monthlyPacked.r[i];
    const k = monthlyPacked.k[row[1]];
    out[i] = {
      p: monthlyPacked.p[row[0]],
      k,
      c: k.slice(0, 2),
      cat: categoryOfChapter(k.slice(0, 2)),
      y: monthlyPacked.y0 + Math.floor(row[2] / 12),
      m: (row[2] % 12) + 1,
      pe: row[3],
      ui: row[4],
    };
  }
  return out;
})();

/*
 * THE MONTH RULE. A year built from months compares the two books only over
 * the months both reported, per partner: Uzbekistan's import book has that
 * month, and the partner reported exports to Uzbekistan in it. Folding every
 * month compared November–December 2025 partner exports (Uzbekistan's book
 * ends in October) against nothing — +$1.5B of positive discrepancy that was
 * only a reporting calendar — and set June 2026 imports against partners that
 * had not filed June yet. Within a matched month a line one book did not
 * record stays a real zero. As-reported totals keep every month.
 */
const uzbImportMonths = new Set<number>();
const partnerExportMonths = new Map<string, Set<number>>();
for (const r of monthlyCells) {
  const ym = r.y * 100 + r.m;
  if (r.ui > 0) uzbImportMonths.add(ym);
  if (r.pe > 0) {
    let set = partnerExportMonths.get(r.p);
    if (!set) { set = new Set(); partnerExportMonths.set(r.p, set); }
    set.add(ym);
  }
}
/** True when both books reported month m of year y for this partner. */
export const monthMatched = (iso: string, y: number, m: number): boolean =>
  uzbImportMonths.has(y * 100 + m) && (partnerExportMonths.get(iso)?.has(y * 100 + m) ?? false);
/** The months of year y compared for this partner. */
export const matchedMonthsOf = (iso: string, y: number): number[] =>
  Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => monthMatched(iso, y, m));
/** The months of year y Uzbekistan's import book carries. */
export const uzbMonthsOf = (y: number): number[] =>
  Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => uzbImportMonths.has(y * 100 + m));

/** Years the monthly series covers — a longer window than the annual books. */
export const monthlyYears: number[] = Object.keys(monthlyPacked?.monthsByYear ?? {})
  .map(Number)
  .sort((a, b) => a - b);
/** Calendar months actually reported for a year (the current year is partial). */
export const monthsOfYear = (y: number): number[] => monthlyPacked?.monthsByYear?.[String(y)] ?? [];
/** Every selectable year on either basis, for URL validation and pickers. */
export const ALL_YEARS: number[] = [...new Set([...meta.years, ...monthlyYears])].sort((a, b) => a - b);

const annualYearSet = new Set<number>(meta.years);

/**
 * Years the annual workbook never reached but the monthly books do. A yearly
 * figure for one of these is simply its months summed, so the yearly basis can
 * offer them — but they come from a different vintage and are still filling up,
 * so they are never folded into a default window silently: the picker offers
 * them and the view says what they are.
 */
export const monthlyOnlyYears: number[] = monthlyYears.filter((y) => !annualYearSet.has(y));

/** True when a year's yearly figures come from the monthly books, not the workbook. */
export const isDerivedYear = (y: number): boolean => !annualYearSet.has(y);

const yearlyYears: number[] = [...meta.years, ...monthlyOnlyYears].sort((a, b) => a - b);

/*
 * Uzbekistan's ACTUAL imports as published by the national statistics office
 * (stat.uz) — not the UN Comtrade mirror the rest of this module reads. The
 * overview quotes it as context: how large the recorded import flow really is,
 * and what share of it the positive discrepancy amounts to. Annual totals for
 * finished years; the running year carries the office's cumulative
 * year-to-date series, and the sum aligns it to the last month Uzbekistan's
 * own mirror book covers, so numerator and denominator describe the same
 * stretch of time as closely as the two sources allow.
 */
interface OfficialImports {
  source: string; retrievedAt: string;
  annual: Record<string, number>;
  cumulativeByMonth: Record<string, number[]>;
}
const officialImportsData = officialImportsRaw as unknown as OfficialImports;
export const OFFICIAL_IMPORTS_SOURCE = {
  name: officialImportsData.source,
  retrievedAt: officialImportsData.retrievedAt,
};

/** The last calendar month of a year with any recorded import in the monthly
 *  mirror book — how far Uzbekistan's own side actually reaches. */
const lastUiMonth = (() => {
  const m = new Map<number, number>();
  for (const r of monthlyCells) if (r.ui > 0 && r.m > (m.get(r.y) ?? 0)) m.set(r.y, r.m);
  return m;
})();

/**
 * Official imports over a set of years, in USD. Returns null when any selected
 * year has no published figure, so a partial denominator can never be printed
 * as if it covered the selection.
 */
export function officialImportsOver(years: number[]): { usd: number; partial: { year: number; throughMonth: number } | null } | null {
  let usd = 0;
  let partial: { year: number; throughMonth: number } | null = null;
  for (const y of years) {
    const annual = officialImportsData.annual[String(y)];
    if (annual !== undefined) { usd += annual; continue; }
    const cum = officialImportsData.cumulativeByMonth[String(y)];
    if (!cum || cum.length === 0) return null;
    // align to the mirror book's own reach, never past what the office published
    const through = Math.min(lastUiMonth.get(y) ?? cum.length, cum.length);
    usd += cum[through - 1];
    partial = { year: y, throughMonth: through };
  }
  return { usd, partial };
}

/** The whole window the dashboard covers, on the yearly basis. Distinct from
 *  meta.window (the annual workbook) and FITTED_WINDOW (the index's fit). */
export const DATA_WINDOW = { start: yearlyYears[0], end: yearlyYears[yearlyYears.length - 1] };

/*
 * The derived years' HS6 cells, annualized at build time from the same monthly
 * book monthlySource() folds (scripts/build-annualized.ts — the audit asserts
 * the two agree). Shipping them lets the yearly basis carry 2025–2026 on every
 * page, including the statically generated profiles, with no runtime fetch.
 */
const annualizedCells: Cell[] = (() => {
  const packed = annualizedRaw as unknown as PackedCells;
  const out: Cell[] = new Array(packed.r.length);
  for (let i = 0; i < packed.r.length; i++) {
    const row = packed.r[i];
    const k = packed.k[row[1]];
    const c = k.slice(0, 2);
    out[i] = {
      p: packed.p[row[0]], k, c, cat: categoryOfChapter(c), l: 6,
      y: packed.y0 + row[2], pe: row[3], ui: row[4],
      // matched-month values (scripts/build-annualized.ts); a stale file without
      // them is treated as fully comparable rather than silently misread
      pc: row[5] ?? row[3], uc: row[6] ?? row[4],
    };
  }
  return out;
})();
const annualizedYears = new Set(annualizedCells.map((r) => r.y));
/** True when a derived year's yearly figures need the monthly detail after all
 *  — only when the annualized layer is stale relative to the monthly book. */
export const needsMonthlyDetail = (y: number): boolean => !annualYearSet.has(y) && !annualizedYears.has(y);

/*
 * A partner's REPORTED YEARS: the years it has at least one HS6 line that both
 * books recorded — on the derived years, over the months both reported (the
 * month rule). This is exactly the test buildChannels applies before it
 * measures anything, so a partner the Data Quality table marks for a year is a
 * partner the Overview counts for that year, and the reverse.
 *
 * It used to be two tests. The table read the workbook's own HS2 sheet (which
 * the engine no longer reads; its chapters re-allocate confidential trade) and,
 * on the derived years, any partner export at all, ignoring the month rule —
 * while the Overview counted comparable partners. The two disagreed in every
 * year, by up to twelve partners in 2025.
 */
const comparableYears = (() => {
  const m = new Map<string, Set<number>>();
  const add = (r: Cell) => {
    if (r.l !== 6 || cmpPe(r) <= NOISE || cmpUi(r) <= NOISE) return;
    let set = m.get(r.p);
    if (!set) { set = new Set(); m.set(r.p, set); }
    set.add(r.y);
  };
  for (const r of cells) add(r);
  for (const r of annualizedCells) add(r);
  return m;
})();
export const reportedYearsOf = (iso: string): number[] =>
  // pMeta is declared below; this is only ever called after module init
  pMeta.get(iso)?.reportedYears ?? [];

/*
 * Partner reliability, measured over the window the dashboard shows. The
 * workbook bakes coverage over its own eight years, so beside ten years of
 * reporting marks a partner filing 2017–2024 read 100%, one that resumed in
 * 2025 still read "stopped", and 3 of 8 years showed as 38%. Coverage is now
 * the reported years out of the whole window, and lapse and tier follow the
 * workbook's own rule (scripts/build-from-excel.ts) on those years: a partner
 * has lapsed when it last reported before the workbook's final year.
 */
for (const p of meta.partners) {
  const years = [...(comparableYears.get(p.iso3) ?? [])]
    .filter((y) => yearlyYears.includes(y))
    .sort((a, b) => a - b);
  const coverage = years.length / yearlyYears.length;
  const last = years.length ? years[years.length - 1] : 0;
  const lapse = years.length > 0 && last < meta.window.end;
  p.reportedYears = years;
  p.coverage = coverage;
  p.lastReportedYear = last;
  p.lapse = lapse;
  p.tier = coverage >= 0.8 && !lapse ? "High" : coverage >= 0.5 && !lapse ? "Medium" : "Low";
}

/**
 * Months of a year BOTH books reported.
 *
 * monthsByYear counts a month present when either side reported, which
 * overstates coverage at the end of the series: partners keep reporting exports
 * into 2026 while Uzbekistan's import book stops after October 2025, and a
 * month only one side filed can never be compared.
 */
const comparableMonths = (() => {
  /*
   * Both books are tested per CELL-month, aggregated first: the extension
   * fetched from the live API appends import-only rows beside the workbook's
   * partner rows, so one (partner × code × month) can span two rows and a
   * per-row test would call a genuinely two-sided month one-sided. Folding
   * downstream sums the same way, so this stays the grain the channels use.
   */
  const cellAcc = new Map<string, { y: number; m: number; pe: number; ui: number }>();
  for (const r of monthlyCells) {
    const key = `${r.p}|${r.k}|${r.y * 100 + r.m}`;
    const e = cellAcc.get(key) ?? { y: r.y, m: r.m, pe: 0, ui: 0 };
    e.pe += r.pe; e.ui += r.ui;
    cellAcc.set(key, e);
  }
  const acc = new Map<number, Set<number>>();
  for (const e of cellAcc.values()) {
    if (e.pe <= NOISE || e.ui <= NOISE) continue;
    let set = acc.get(e.y);
    if (!set) { set = new Set<number>(); acc.set(e.y, set); }
    set.add(e.m);
  }
  return new Map<number, number[]>([...acc].map(([y, set]) => [y, [...set].sort((a, b) => a - b)]));
})();
export const comparableMonthsOfYear = (y: number): number[] => comparableMonths.get(y) ?? [];

/**
 * Freight scenarios the interface offers. Discrete steps rather than every whole
 * percent: the figure is an assumption, and offering 0.01 increments implied a
 * precision the CIF/FOB margin does not have.
 */
export const FREIGHT_SCENARIOS: number[] = [0, 0.05, 0.10, 0.15, 0.20, 0.25];

/** The window the static index was fitted on, quoted on /methodology. */
export const FITTED_WINDOW = meta.window;

/** Years the active granularity offers. */
export const yearsFor = (g: Granularity): number[] => (g === "month" ? monthlyYears : yearlyYears);

/* ------------------------------------------------------------------ */
/* Monthly HS6 detail — fetched on demand                               */
/* ------------------------------------------------------------------ */

/**
 * The HS6 monthly layer is ~1.9M cells, far past what the main bundle can
 * carry, so it ships as public/data/monthly-hs6.json and loads the first time
 * the monthly basis is entered. Until it arrives the monthly basis serves
 * chapter level only; the store notifies subscribers so views recompute.
 * HS4 is derived from HS6 by truncation, exactly as on the yearly basis.
 */
interface PackedMonthlyDetail { v: number; y0: number; p: string[]; k: string[]; r: number[][] }

let monthlyDetail: PackedMonthlyDetail | null = null;
let monthlyDetailVersion = 0;
let monthlyDetailLoading = false;
const monthlyDetailListeners = new Set<() => void>();

export const monthlyDetailReady = (): boolean => monthlyDetail !== null;
/** Bumps when the detail arrives — a dependency for memoized aggregates. */
export const monthlyDetailVer = (): number => monthlyDetailVersion;
export function subscribeMonthlyDetail(fn: () => void): () => void {
  monthlyDetailListeners.add(fn);
  return () => monthlyDetailListeners.delete(fn);
}
/** Direct injection for Node (verification scripts); the client uses ensureMonthlyDetail. */
export function loadMonthlyDetail(payload: PackedMonthlyDetail): void {
  monthlyDetail = payload;
  monthlyDetailVersion++;
  monthlySourceCache.clear();
  for (const fn of monthlyDetailListeners) fn();
}
export function ensureMonthlyDetail(): void {
  if (monthlyDetail || monthlyDetailLoading || typeof window === "undefined") return;
  monthlyDetailLoading = true;
  fetch("/data/monthly-hs6.json")
    .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then((j: PackedMonthlyDetail) => { monthlyDetailLoading = false; loadMonthlyDetail(j); })
    .catch(() => { monthlyDetailLoading = false; });
}

/**
 * Monthly rows folded into yearly-shaped cells over the ticked months, so every
 * downstream computation — channels, screening, totals — runs unchanged on the
 * monthly basis. The month filter is applied here and only here. Folding the
 * detail layer walks ~1.9M rows, so results are memoized per period selection;
 * partner and HS filters apply downstream and never fragment the cache.
 */
const monthlySourceCache = new Map<string, Cell[]>();

function monthlySource(f: Filter): Cell[] {
  const cacheKey = `${f.years.join(",")}|${f.months.join(",")}|${monthlyDetailVersion}`;
  const hit = monthlySourceCache.get(cacheKey);
  if (hit) return hit;

  const wantY = f.years.length ? new Set(f.years) : null;
  const wantM = f.months.length ? new Set(f.months) : null;
  const acc = new Map<string, Cell>();
  for (const r of monthlyCells) {
    if (wantY && !wantY.has(r.y)) continue;
    if (wantM && !wantM.has(r.m)) continue;
    const key = `${r.p}|${r.k}|${r.y}`;
    let cell = acc.get(key);
    if (!cell) {
      cell = { p: r.p, k: r.k, c: r.c, cat: r.cat, l: 2, y: r.y, pe: 0, ui: 0, pc: 0, uc: 0 };
      acc.set(key, cell);
    }
    cell.pe += r.pe;
    cell.ui += r.ui;
    if (monthMatched(r.p, r.y, r.m)) { cell.pc! += r.pe; cell.uc! += r.ui; }
  }
  const out = [...acc.values()];

  const det = monthlyDetail;
  if (det) {
    // fold straight off the packed rows on numeric keys — string keys on 1.9M
    // iterations would dominate the cost
    const nK = det.k.length;
    const acc6 = new Map<number, Cell>();
    // per cell, its months as they arrive: [offset, pe, ui, offset, pe, ui, …]
    const monthsOf = new Map<number, number[]>();
    for (const row of det.r) {
      const y = det.y0 + ((row[2] / 12) | 0);
      if (wantY && !wantY.has(y)) continue;
      if (wantM && !wantM.has((row[2] % 12) + 1)) continue;
      const id = (row[0] * nK + row[1]) * 16 + (y - det.y0);
      let cell = acc6.get(id);
      if (!cell) {
        const k = det.k[row[1]];
        const c = k.slice(0, 2);
        cell = { p: det.p[row[0]], k, c, cat: categoryOfChapter(c), l: 6, y, pe: 0, ui: 0, pc: 0, uc: 0 };
        acc6.set(id, cell);
      }
      cell.pe += row[3];
      cell.ui += row[4];
      // one month can span two rows (the API extension appends import-only rows
      // beside the workbook's partner rows), so months are summed before testing
      let mm = monthsOf.get(id);
      if (!mm) { mm = []; monthsOf.set(id, mm); }
      let i = 0;
      while (i < mm.length && mm[i] !== row[2]) i += 3;
      if (i === mm.length) mm.push(row[2], 0, 0);
      mm[i + 1] += row[3];
      mm[i + 2] += row[4];
    }
    /*
     * THE MONTH GRAIN. On the monthly basis a gap is measured per partner × HS6
     * × MONTH, and the months are then summed — the same grain the period chart
     * draws its bars at, so the headline is exactly the sum of the bars. A month
     * counts for a line when both books recorded the line in it (which also
     * means both reported the month, so the month rule holds). Netting a
     * selection's months inside each year first let February's surplus cancel
     * January's gap, and the bars no longer added up to the total.
     */
    for (const [id, cell] of acc6) {
      const mm = monthsOf.get(id)!;
      const mo: number[] = [];
      let pc = 0, uc = 0;
      for (let i = 0; i < mm.length; i += 3) {
        if (mm[i + 1] <= NOISE || mm[i + 2] <= NOISE) continue;
        mo.push(mm[i + 1], mm[i + 2]);
        pc += mm[i + 1]; uc += mm[i + 2];
      }
      cell.mo = mo; cell.pc = pc; cell.uc = uc;
    }
    // derived HS4 layer, same rule as the yearly load: exact truncation of HS6
    const acc4 = new Map<string, Cell>();
    for (const r of acc6.values()) {
      const code = r.k.slice(0, 4);
      const key = `${r.p}|${code}|${r.y}`;
      let agg = acc4.get(key);
      if (!agg) {
        agg = { p: r.p, k: code, c: r.c, cat: r.cat, l: 4, y: r.y, pe: 0, ui: 0, pc: 0, uc: 0 };
        acc4.set(key, agg);
      }
      agg.pe += r.pe;
      agg.ui += r.ui;
      agg.pc! += r.pc!;
      agg.uc! += r.uc!;
      out.push(r);
    }
    for (const cell of acc4.values()) out.push(cell);
  }

  if (monthlySourceCache.size >= 6) {
    const oldest = monthlySourceCache.keys().next().value;
    if (oldest !== undefined) monthlySourceCache.delete(oldest);
  }
  monthlySourceCache.set(cacheKey, out);
  return out;
}

/** The cell universe the filter's time basis selects. */
function sourceCells(f: Filter): Cell[] {
  if (f.granularity === "month") return monthlySource(f);
  // Past the workbook's last year the only record is the monthly book, so those
  // years' yearly cells are their months summed — precomputed at build time
  // (annualized-hs6.json), so the derived years are available everywhere the
  // annual ones are, static pages included. The picker labels them as derived:
  // they are a different vintage, months still filling up.
  const derived = f.years.filter((y) => !annualYearSet.has(y));
  if (derived.length === 0) return cells;
  const want = new Set(derived.filter((y) => annualizedYears.has(y)));
  const extra: Cell[] = annualizedCells.filter((r) => want.has(r.y));
  // a derived year the build has not annualized yet still folds live
  const missing = derived.filter((y) => !annualizedYears.has(y));
  if (missing.length) extra.push(...monthlySource({ ...f, years: missing, months: [] }));
  return [...cells, ...extra];
}

const pMeta = new Map(meta.partners.map((p) => [p.iso3, p]));
const chapLabel = new Map(meta.chapters.map((c) => [c.chapter, c.label]));
const catLabel = new Map(meta.categories.map((c) => [c.key, c.label]));
/* Every data-derived name the interface shows resolves through one of these,
   so switching language reaches the tables and pickers as well as the chrome.
   Untranslated entries fall back to the extract's English. */
export const partnerName = (iso: string) => tCountry(iso, pMeta.get(iso)?.name ?? iso);
export const regionLabel = (region: string) => tRegion(region);
export const partnerMetaOf = (iso: string) => pMeta.get(iso);
export const categoryLabel = (key: string) => tCategory(key, catLabel.get(key) ?? key);
/**
 * Complete Comtrade description for the codes whose shipped label is truncated
 * at 90 characters (scripts/fetch-hs-descriptions.ts). English only — it is the
 * nomenclature's own text — and null when the shipped label is already whole.
 */
const hsFull = hsFullRaw as Record<string, string>;
export const hsFullText = (cmd: string): string | null => hsFull[cmd] ?? null;

/**
 * Hover text for a code: the complete nomenclature line when the reader can read
 * it, otherwise the localised short label.
 *
 * hsFullText is the nomenclature's own English, so handing it straight to a
 * tooltip put an English sentence inside a Russian or Uzbek interface — the
 * shipped label beside it was translated, the hover was not. Where a translation
 * of the full line exists it wins; where it does not, the translated label is
 * better than untranslated English.
 */
export const hsFullLabel = (cmd: string): string => {
  const full = hsFull[cmd];
  if (full) {
    const localised = tText(full);
    if (localised !== full || labelLang() === "en") return localised;
  }
  return hsLabel(cmd);
};

export const hs6Label = (cmd: string) => tText(meta.hs6labels[cmd] ?? `HS ${cmd}`);
/** HS4 is derived from HS6; labels borrow the largest child's description. */
export const hs4Label = (cmd: string) => tText(meta.hs4labels[cmd] ?? `HS ${cmd}`);
export const hsLabel = (cmd: string) =>
  cmd.length === 2 ? tText(chapLabel.get(cmd) ?? `HS ${cmd}`) : cmd.length === 4 ? hs4Label(cmd) : hs6Label(cmd);
export const productByCmd = (cmd: string) => products.find((p) => p.cmd === cmd);
export const isResidualChapter = (c: string) => c === "98" || c === "99";

// Full-window channel history: how many COMPARABLE years each (partner × code) has
// across 2017–2024 regardless of the selected period, so zooming into a single year
// does not mark every channel "insufficient". A year only counts when both books
// reported — the same test buildChannels applies — otherwise a channel seen once
// from one side alone would look like it had history.
const histYears = (() => {
  const m = new Map<string, number>();
  // one grain here too: a coarse cell's history is the distinct years in which
  // any of its HS6 lines was comparable
  const seen = new Map<string, Set<number>>();
  const mark = (key: string, y: number) => {
    let set = seen.get(key);
    if (!set) { set = new Set(); seen.set(key, set); }
    set.add(y);
  };
  for (const r of [...cells, ...annualizedCells]) {
    if (r.l !== 6) continue;
    if (cmpPe(r) <= NOISE || cmpUi(r) <= NOISE) continue;
    mark(`6|${r.p}|${r.k}`, r.y);
    mark(`4|${r.p}|${r.k.slice(0, 4)}`, r.y);
    mark(`2|${r.p}|${r.k.slice(0, 2)}`, r.y);
  }
  for (const [key, set] of seen) m.set(key, set.size);
  return m;
})();

/* ------------------------------------------------------------------ */
/* MTRS v3.1 — fitted constants and the descriptive partner indicator   */
/* ------------------------------------------------------------------ */

/*
 * The scores themselves are no longer read from here: they are computed for the
 * period on screen (see scoreCrossSection), so that narrowing the years narrows
 * what the score claims. What the index still supplies is the fitted
 * configuration — the smoothing constants, the Critical share and the freight
 * rate the fit used — the descriptive partner indicator, and the whole-window
 * band cut-offs quoted on /methodology as the reference fit.
 */
interface PartnerEffect { iso: string; u: number; cells: number }

const riskIndex = riskRaw as unknown as {
  version: string;
  generatedAt: string;
  config: { alpha: number; beta: number; materialityFloor: number; criticalTop: number; freight: number };
  partnerEffects: Record<string, PartnerEffect[]>;
  bandCuts: Record<string, { critical: number; high: number; elevated: number }>;
};

export const RISK_CONFIG = riskIndex.config;
/** Cut-offs from the whole-window fit; the live ones travel on the Aggregate. */
export const FITTED_BAND_CUTS = riskIndex.bandCuts;

/**
 * Partner reporting-discrepancy indicator: the value-weighted mean log gap
 * ln(X/M) across the partner's matched cell-years, in log points. Positive means
 * that partner's books systematically run above Uzbekistan's, across its whole
 * product range — a purely descriptive country-level signal.
 */
export const partnerEffects = (level: number): PartnerEffect[] => riskIndex.partnerEffects[String(level)] ?? [];

export const BAND_LABELS: Record<RiskBand, { label: string; desc: string }> = {
  critical: { label: "Critical", desc: "Top 2.5% of cells by risk score — the strongest conjunction of a large gap rate and a persistent one." },
  high: { label: "High", desc: "Upper quartile of the remaining cells." },
  elevated: { label: "Medium", desc: "Second quartile of the remaining cells." },
  low: { label: "Low", desc: "Lower half of the remaining cells, and every cell that was never in scope." },
};
export const ROBUSTNESS_LABELS: Record<Robustness, string> = {
  robust: "Robust",
  "freight-sensitive": "Freight-sensitive",
  "coverage-sensitive": "Coverage-sensitive",
  insufficient: "Insufficient data",
};

export type Granularity = "year" | "month";

export interface Filter {
  /**
   * Time base. "year" reads the annual dataset (HS2 + HS6); "month" reads the
   * monthly books — the chapter series ships in the bundle, the HS6 detail
   * loads on demand (see ensureMonthlyDetail) with HS4 derived by truncation.
   */
  granularity: Granularity;
  /** Ticked years — any subset of meta.years, never a range. */
  years: number[];
  /** Ticked calendar months (1–12); empty means every month. Monthly mode only. */
  months: number[];
  cif: number;
  /**
   * Multi-select dimensions. An empty list means "everything": a cleared filter
   * shows the whole dataset rather than nothing, so clearing can never strand the
   * user on an empty page.
   */
  country: string[]; // iso3 codes
  hs2: string[]; // chapters
  hs4: string[]; // 4-digit codes
  hs6: string[]; // 6-digit codes
  category: string; // "all" | key
  minGap: number; // materiality floor on the positive discrepancy
  band: "all" | RiskBand;
  /**
   * Force the level the partner and chapter rollups are cut at. Left undefined
   * it follows the HS selection, which is what every page wanted while the
   * rollup was only ever a by-product of filtering. Country Analysis ranks at
   * HS6 outright, so it asks for the level rather than filtering to reach it.
   */
  rollupLevel?: 2 | 4 | 6;
}
export const DEFAULT_FILTER: Filter = {
  granularity: "year",
  /*
   * The whole window, derived years included: the dashboard covers 2017 to the
   * newest months the monthly book carries, and says which years are derived
   * rather than hiding them. Partial years are partial — the picker and the
   * views label them, and a reader who wants the settled vintage unticks them.
   */
  /*
   * The newest year, not the whole window. The dashboard is read to answer
   * "what is happening now", and a default spanning ten years answered a
   * different question; the rest of the window is one tick away, and the
   * statistical profile still opens on all of it because a distribution needs
   * the years.
   */
  years: [yearlyYears[yearlyYears.length - 1]],
  months: [],
  /*
   * No freight adjustment by default: the dashboard opens on the two books
   * exactly as reported. Every other scenario is one selection away, and the
   * documented band still frames the sensitivity.
   */
  cif: 0,
  country: [],
  hs2: [],
  hs4: [],
  hs6: [],
  category: "all",
  minGap: 0,
  band: "all",
};

/** The single selected value, or null when the selection is empty or plural. */
export const soleValue = (values: string[]): string | null => (values.length === 1 ? values[0] : null);

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const pos = (x: number) => Math.max(0, x);
const sgn = (x: number) => (x > NOISE ? 1 : x < -NOISE ? -1 : 0);

export interface YearRow {
  y: number;
  /** Comparable value totals for the year — HS6 lines both books reported. */
  pe: number; ui: number;
  /** Net discrepancy, pe − ui ÷ (1 + f): what the by-year charts draw. */
  signed: number;
  /** HS6-grain directional sums — posY is what every positive total accumulates. */
  posY: number; revY: number;
  /** The positive lines' own values, so pePosY − uiPosY ÷ (1 + f) = posY exactly. */
  pePosY: number; uiPosY: number;
  /** posY at the documented band endpoints, for the sensitivity range. */
  posLoY: number; posHiY: number;
  uvOk: boolean;
}
export interface Channel {
  partner: string; partnerIso: string; region: string; transit: boolean; tier: Tier;
  chapter: string; cmd: string; cmdLabel: string; level: number; category: string;
  years: YearRow[];
  peT: number; uiT: number;
  /** Uzbekistan's CIF imports divided down to an FOB basis: uiT / (1 + f). */
  adjUiT: number;
  /**
   * Totals over the positive channel-years only — both books reported and the
   * partner side exceeds Uzbekistan's after freight. Wherever these sit beside
   * the positive discrepancy the three figures form one identity:
   * pePosT × (1 + f) − uiPosT = posT.
   */
  pePosT: number; uiPosT: number;
  signedT: number; posT: number; revT: number; absT: number;
  /** posT at the low/high freight endpoints — the KPI band sums these. */
  posLoT: number; posHiT: number;
  boundedAsymmetry: number; positiveShare: number;
  comparableYears: number; posYears: number; revYears: number; longestPosStreak: number;
  flipsAcrossFreight: boolean;
  uvYears: number; uvRatio: number | null;
  robustness: Robustness; flags: string[];
  /**
   * MTRS v3.1, computed for the period in view: G is the percentile rank of this
   * cell's gap rate across the period's whole cross-section, P = (k + 1)/(n + 2)
   * over the n years in view, and RS = 100 √(G × P). Selecting one year makes it
   * a one-year score — posYears and comparableYears above are the k and n that
   * produced it, so the columns cannot disagree. Assigned after construction by
   * scoreCrossSection, since G needs every cell before any cell can be ranked.
   */
  mtrs: number; abnormalGap: number; persistence: number;
  /** Cumulative positive gap in view — the fitted index's `excess`, recomputed. */
  excessGap: number;
  band: RiskBand; scored: boolean;
  /** positive discrepancy used for ranking */
  primary: number;
  trend: number;
}

/**
 * Trend: the last period minus the first.
 *
 * It used to average the three periods at each end. That hid the two in the
 * middle entirely — for a partner with eight years the arithmetic never looked
 * at years four and five — and on a short series the two windows overlapped, so
 * one period was counted on both sides and partly cancelled itself. End minus
 * start is what the sparkline beside it draws, and it uses every point the
 * reader can see.
 */
function trendOf(series: { y: number; v: number }[]) {
  if (series.length < 2) return 0;
  return series[series.length - 1].v - series[0].v;
}

/** Percentile rank in [0,1], ties averaged — the fitted index's normalization. */
function percentileRanks(values: number[]): number[] {
  const n = values.length;
  const out = new Array<number>(n).fill(0);
  if (n === 0) return out;
  const order = values.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1][0] === order[i][0]) j++;
    const pr = ((i + j) / 2 + 1 - 0.5) / n;
    for (let t = i; t <= j; t++) out[order[t][1]] = pr;
    i = j + 1;
  }
  return out;
}

/** Quantile of an ascending array, linear interpolation. */
function quantileAsc(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

export interface BandCuts { critical: number; high: number; elevated: number }

/**
 * Score one HS level for the period in view. G is the percentile rank of the
 * cell's gap rate among the cells that have a positive one, P = (k + 1)/(n + 2)
 * over the years in view — Laplace's rule of succession, so one positive year
 * out of one reads as 0.67 rather than certainty — and RS = 100 √(G × P). The
 * bands are re-cut on the resulting distribution by the same rule as the fitted
 * index: Critical is the top 2.5%, and the rest splits at the 75th and 50th
 * percentiles.
 *
 * The cross-section passed in is the period's, before the country and product
 * ticks — a rank has to be against every cell at the level, or selecting one
 * partner would silently re-rank it against itself.
 */
interface CellScore { g: number; p: number; rs: number; band: RiskBand }
export interface LevelScores { cuts: BandCuts; by: Map<string, CellScore> }

function scoreCrossSection(cs: Channel[]): LevelScores {
  const withGap = cs.filter((c) => c.peT > 0 && c.excessGap > 0);
  const ranks = percentileRanks(withGap.map((c) => c.excessGap / c.peT));
  const gOf = new Map<string, number>();
  withGap.forEach((c, i) => gOf.set(cellKey(c), ranks[i]));

  const by = new Map<string, CellScore>();
  for (const c of cs) {
    const g = gOf.get(cellKey(c)) ?? 0;
    // ALPHA = BETA = 1, the same smoothing the fitted index applies
    const p = (c.posYears + 1) / (c.comparableYears + 2);
    by.set(cellKey(c), {
      g: Math.round(g * 1000) / 1000,
      p: Math.round(p * 1000) / 1000,
      rs: Math.round(100 * Math.sqrt(g * p) * 10) / 10,
      band: "low",
    });
  }

  const all = [...by.values()].map((v) => v.rs).sort((a, b) => a - b);
  const critical = quantileAsc(all, 1 - RISK_CONFIG.criticalTop);
  const rest = all.filter((x) => x < critical);
  const cuts: BandCuts = { critical, high: quantileAsc(rest, 0.75), elevated: quantileAsc(rest, 0.5) };
  for (const v of by.values()) {
    v.band = v.rs <= 0 ? "low"
      : v.rs >= cuts.critical ? "critical"
        : v.rs >= cuts.high ? "high"
          : v.rs >= cuts.elevated ? "elevated" : "low";
  }
  return { cuts, by };
}

/** Identity of a cell inside one HS level. */
const cellKey = (c: Channel) => `${c.partnerIso}|${c.cmd}`;

/** Copy a level's scores onto the channels the page will actually render. */
function applyScores(cs: Channel[], scores: LevelScores): void {
  for (const c of cs) {
    const v = scores.by.get(cellKey(c));
    if (!v) continue;
    c.abnormalGap = v.g; c.persistence = v.p; c.mtrs = v.rs; c.band = v.band;
  }
}

/**
 * One scored cross-section per period × freight × level. Recomputing it on every
 * country or product tick would be wasted work — the ranking cannot move, since
 * those ticks decide what is listed, not what any cell is worth.
 */
const scoreCache = new Map<string, LevelScores>();
const SCORE_CACHE_MAX = 24;

function levelScores(f: Filter, level: number, years: number[], periodCells: Cell[], ready: Channel[] | null): LevelScores {
  // `years` must be the period aggregate() resolved, not re-derived from the
  // filter: an empty yearly tick means the workbook years only, and keying it
  // as the whole window served eight-year scores to ten-year views.
  const key = `${level}|${f.granularity}|${f.cif}|${years.join(",")}|${f.months.join(",")}|${monthlyDetailVersion}`;
  const hit = scoreCache.get(key);
  if (hit) return hit;
  const scores = scoreCrossSection(ready ?? buildChannels(periodCells, level, f));
  if (scoreCache.size >= SCORE_CACHE_MAX) scoreCache.delete(scoreCache.keys().next().value!);
  scoreCache.set(key, scores);
  return scores;
}

function buildChannels(fc: Cell[], level: number, f: Filter): Channel[] {
  const K = 1 + f.cif;
  const Klo = 1 + meta.cif.low;
  const Khi = 1 + meta.cif.high;
  /*
   * ONE GRAIN. The discrepancy is measured once, per partner × HS6 × period —
   * the finest cell both books actually report — and every coarser level
   * aggregates those measurements. Levels used to be computed independently,
   * each taking the positive part of its own nets, and offsetting HS6 gaps
   * cancelled inside a coarser cell before max(0,·) was applied: the same
   * dataset answered $30.4B at HS2, $42.3B at HS4 and $48.1B at HS6 over
   * 2017–2024 at 0% freight. Now a chapter is exactly the sum of its lines and
   * the total is the total, identical at every level.
   *
   * Comparability is judged at the same grain: an HS6 line only one book
   * reported is one-sided even when the other book reported a neighbouring
   * line of the same chapter. The workbook's own HS2 layer is no longer read —
   * its chapter values differ from the sum of its own HS6 lines by confidential
   * trade re-allocated across chapters (±$1.8B, mostly HS99 against 84/85/87/88),
   * and a level that cannot tie to the level below it is what this removes.
   */
  interface YearAcc {
    pe: number; ui: number; posY: number; revY: number;
    pePosY: number; uiPosY: number; posLoY: number; posHiY: number;
    uw: number; pw: number; uwv: number; pwv: number; uvOk: boolean;
  }
  const groups = new Map<string, Map<number, YearAcc>>();
  const groupCell = new Map<string, Cell>();
  for (const r of fc) {
    if (r.l !== 6) continue;
    // both books at the measurement grain, over the months both reported,
    // or the line is one-sided
    const pe = cmpPe(r), ui = cmpUi(r);
    if (pe <= NOISE || ui <= NOISE) continue;
    const key = `${r.p}|${level === 6 ? r.k : r.k.slice(0, level)}`;
    let byYear = groups.get(key);
    if (!byYear) { byYear = new Map(); groups.set(key, byYear); groupCell.set(key, r); }
    let a = byYear.get(r.y);
    if (!a) {
      a = { pe: 0, ui: 0, posY: 0, revY: 0, pePosY: 0, uiPosY: 0, posLoY: 0, posHiY: 0, uw: 0, pw: 0, uwv: 0, pwv: 0, uvOk: false };
      byYear.set(r.y, a);
    }
    // Both books on an FOB basis: the partner's export is already FOB, so it is
    // Uzbekistan's CIF import that is divided down by the freight factor.
    const measure = (pe: number, ui: number) => {
      const signed = pe - ui / K;
      a!.pe += pe; a!.ui += ui;
      a!.posY += pos(signed); a!.revY += pos(-signed);
      if (signed > 0) { a!.pePosY += pe; a!.uiPosY += ui; }
      a!.posLoY += pos(pe - ui / Klo);
      a!.posHiY += pos(pe - ui / Khi);
    };
    // the monthly basis measures each month the line was compared, then sums
    // them (see THE MONTH GRAIN); everywhere else the cell is one measurement
    if (r.mo) for (let i = 0; i < r.mo.length; i += 2) measure(r.mo[i], r.mo[i + 1]);
    else measure(pe, ui);
    if (r.uw && r.pw) { a.uvOk = true; a.uw += r.uw; a.pw += r.pw; a.uwv += ui; a.pwv += pe; }
  }

  const out: Channel[] = [];
  for (const [key, byYear] of groups) {
    const r0 = groupCell.get(key)!;
    const pm = pMeta.get(r0.p);
    if (!pm) continue;
    const code = level === 6 ? r0.k : r0.k.slice(0, level);

    const years: YearRow[] = [];
    let peT = 0, uiT = 0, posT = 0, revT = 0, pePosT = 0, uiPosT = 0, posLoT = 0, posHiT = 0;
    let posYears = 0, revYears = 0, streak = 0, longest = 0;
    let uvYears = 0, uw = 0, pw = 0, uwv = 0, pwv = 0;
    for (const [y, a] of [...byYear.entries()].sort((x, z) => x[0] - z[0])) {
      years.push({
        y, pe: a.pe, ui: a.ui, signed: a.pe - a.ui / K,
        posY: a.posY, revY: a.revY, pePosY: a.pePosY, uiPosY: a.uiPosY,
        posLoY: a.posLoY, posHiY: a.posHiY, uvOk: a.uvOk,
      });
      peT += a.pe; uiT += a.ui;
      posT += a.posY; revT += a.revY;
      pePosT += a.pePosY; uiPosT += a.uiPosY;
      posLoT += a.posLoY; posHiT += a.posHiY;
      if (a.posY > NOISE) { posYears++; streak++; longest = Math.max(longest, streak); } else streak = 0;
      if (a.revY > NOISE) revYears++;
      if (a.uvOk) { uvYears++; uw += a.uw; pw += a.pw; uwv += a.uwv; pwv += a.pwv; }
    }
    const n = years.length;
    const adjUiT = uiT / K;
    const signedT = peT - adjUiT;
    const absT = posT + revT;

    const boundedAsymmetry = Math.max(peT, adjUiT) > 0 ? clamp(absT / Math.max(peT, adjUiT)) : 0;
    const positiveShare = peT > 0 ? clamp(posT / peT) : 0;
    const uvRatio = uvYears >= 2 && uw > 0 && pw > 0 && pwv > 0 ? (uwv / uw) / (pwv / pw) : null;

    // scenario robustness of the NET: does its sign hold across the band?
    const netSigns = [sgn(peT - uiT / Klo), sgn(signedT), sgn(peT - uiT / Khi)];
    const flipsAcrossFreight = new Set(netSigns.filter((x) => x !== 0)).size > 1 || netSigns.includes(0);

    /*
     * Mean annual trade over the comparable years, as the mean of the two
     * reported sides: (peT + uiT) ÷ 2n — the quantity the fitted index measures
     * smallness by, against the floor it published.
     */
    const meanAnnualValue = (peT + uiT) / (2 * n);

    // flags
    const flags: string[] = [];
    if (pm.transit) flags.push("transit");
    if (isResidualChapter(r0.c)) flags.push("residual-hs");
    if (pm.lapse) flags.push("reporting-stop");
    if (pm.coverage < 0.5) flags.push("sparse-reporter");
    if (uvYears === 0 && level === 6) flags.push("missing-weight");
    if (flipsAcrossFreight) flags.push("freight-sensitive");
    if (meanAnnualValue < RISK_CONFIG.materialityFloor) flags.push("small-cell");

    const nHist = histYears.get(`${level}|${r0.p}|${code}`) ?? n; // full-window comparable years
    const robustness: Robustness =
      nHist < 2 ? "insufficient"
        : flipsAcrossFreight ? "freight-sensitive"
          : pm.lapse || pm.coverage < 0.5 ? "coverage-sensitive"
            : "robust";

    // the dashboard screens the positive discrepancy only
    const primary = posT;
    const trend = trendOf(years.map((x) => ({ y: x.y, v: x.posY })));

    // ties to what posT sums by construction; kept as a loop so they stay tied
    let excessGap = 0;
    for (const yr of years) if (yr.posY > NOISE) excessGap += yr.posY;

    out.push({
      partner: partnerName(pm.iso3), partnerIso: pm.iso3, region: regionLabel(pm.region), transit: pm.transit, tier: pm.tier,
      chapter: r0.c, cmd: code, cmdLabel: hsLabel(code),
      level, category: r0.cat,
      years, peT, uiT, adjUiT, pePosT, uiPosT, signedT, posT, revT, absT, posLoT, posHiT,
      boundedAsymmetry, positiveShare,
      comparableYears: n, posYears, revYears, longestPosStreak: longest,
      flipsAcrossFreight, uvYears, uvRatio,
      robustness, flags,
      mtrs: 0, abnormalGap: 0, persistence: 0, excessGap,
      band: "low", scored: n > 0,
      primary, trend,
    });
  }
  return out;
}

const BAND_RANK: Record<RiskBand, number> = { critical: 0, high: 1, elevated: 2, low: 3 };

function applyChannelFilters(chs: Channel[], f: Filter): Channel[] {
  return chs
    .filter((c) => {
      /*
       * HS 98/99 ("commodities not specified", confidential) used to be removed
       * here. They are now ranked like anything else and carry the "residual-hs"
       * flag instead, so a reader sees what the code is rather than never seeing
       * the channel — hiding a chapter is a strong claim to make silently, and
       * at HS6 it was removing 20 channels while looking like a principle.
       */
      if (f.band !== "all" && c.band !== f.band) return false;
      if (c.primary < f.minGap) return false;
      // only channels with nothing to rank: this screens the positive discrepancy,
      // so a channel that never shows one has no row to draw. The old $100,000
      // threshold on the same line is gone with NOISE.
      if (c.posT <= NOISE) return false;
      return true;
    })
    .sort((a, b) =>
      BAND_RANK[a.band] - BAND_RANK[b.band] || b.mtrs - a.mtrs || Math.abs(b.primary) - Math.abs(a.primary));
}

export interface PartnerAgg {
  iso3: string; name: string; region: string; transit: boolean; tier: Tier;
  coverage: number; lapse: boolean; lastReportedYear: number; reportedYears: number[];
  /** Paired totals — the population every discrepancy measure below is computed on. */
  peT: number; uiT: number; posT: number; signedT: number;
  /** Positive channel-years only: pePosT × (1 + f) − uiPosT = posT exactly. */
  pePosT: number; uiPosT: number;
  /** As-reported totals including one-sided observations; for reported-value display only. */
  observed: ObservedTotals;
  /** Channels in the Critical or High MTRS band. */
  channels: number; flagged: number; mtrs: number;
  /**
   * Per-year totals over every COMPARABLE channel-year (both books reported),
   * before the screening filters — so the yearly positive figures sum to the
   * headline total, while `posT` above covers the ranked channels only.
   */
  byYear: { year: number; pe: number; ui: number; positive: number; reported: boolean }[];
  topChapters: { chapter: string; label: string; value: number; share: number }[];
  trend: number;
}
export interface ChapterAgg {
  chapter: string; label: string; category: string; residual: boolean;
  peT: number; uiT: number; posT: number; signedT: number;
  gapRate: number; channels: number; topPartner: { name: string; iso3: string; value: number } | null; trend: number;
}

export interface Aggregate {
  filter: Filter;
  years: number[];
  /**
   * Band cut-offs by HS level, re-fitted on the period in view. The legend has to
   * quote these rather than the static ones: a one-year selection caps P at 0.67,
   * so the whole score distribution shifts and the fitted cut-offs would put
   * every cell in Low.
   */
  bandCuts: Record<number, BandCuts>;
  /** As-reported totals at the rollup level, one-sided observations included. */
  observed: ObservedTotals;
  channels: Channel[]; // HS2 after all filters
  channels4: Channel[]; // derived HS4 after all filters
  channels6: Channel[]; // HS6 after all filters
  baseChannels: Channel[]; // HS2 before stage/signal/materiality (for funnel & KPIs)
  baseChannels4: Channel[];
  baseChannels6: Channel[];
  partners: PartnerAgg[];
  chapters: ChapterAgg[];
  categories: { key: string; label: string; value: number; share: number }[];
  annual: {
    year: number; month?: number; label?: string;
    pe: number; ui: number;
    /** Positive channel-years only: pePos − uiPos / (1 + f) = positive exactly. */
    pePos: number; uiPos: number;
    positive: number;
    /**
     * The other direction, summed the same way: channel-years where Uzbekistan
     * recorded MORE than the partner's freight-adjusted exports. Reported so the
     * two sides can be seen against each other; positive is what gets screened.
     */
    reverse: number;
    comparablePartners: number;
  }[];
  concentration: { name: string; partner: string; iso3: string; cmd: string; value: number; share: number; cumShare: number }[];
  movers: {
    goods: { key: string; label: string; total: number; trend: number; series: { y: number; v: number }[] }[];
    countries: { key: string; label: string; iso3: string; total: number; trend: number; series: { y: number; v: number }[] }[];
  };
  heatmap: { import: Record<string, Record<string, number>>; partners: { iso3: string; name: string; tier: Tier }[] };
  funnel: { observedChannels: number; comparableChannels: number; comparableValue: number };
  kpis: {
    comparableTrade: number;
    positive: { low: number; central: number; high: number };
    coveragePct: number; // comparable partner-years / possible partner-years
    channelCount: number; partnerCount: number;
    top5Share: number; hhi: number;
  };
}

/**
 * HS match for one cell under the cascading multi-select filters: the most
 * specific level carrying a selection decides, so picking HS6 lines inside an
 * already-chosen chapter narrows rather than contradicts.
 */
function matchesCode(r: Cell, f: Filter): boolean {
  if (f.hs6.length > 0) return f.hs6.some((c) => r.k === c || (r.l < 6 && c.startsWith(r.k)));
  if (f.hs4.length > 0)
    return f.hs4.some((c) => r.k === c || (r.l < 4 && c.startsWith(r.k)) || (r.l === 6 && r.k.startsWith(c)));
  if (f.hs2.length > 0) return f.hs2.includes(r.c);
  return f.category === "all" || r.cat === f.category;
}

export interface ObservedTotals {
  /** Partner-reported exports to Uzbekistan (FOB), as reported. */
  pe: number;
  /** Uzbekistan-recorded imports (CIF), as reported. */
  ui: number;
  cells: number;
  /** The slice above that only one book reported — never enters a discrepancy. */
  oneSidedPe: number;
  oneSidedUi: number;
  oneSidedCells: number;
}

/** Cells surviving the active filters, before any mirror pairing. */
function filterCells(f: Filter): Cell[] {
  const picked = f.years.length ? new Set(f.years) : new Set(yearsFor(f.granularity));
  return sourceCells(f).filter(
    (r) => picked.has(r.y) && (f.country.length === 0 || f.country.includes(r.p)) && matchesCode(r, f),
  );
}

function sumObserved(rows: Cell[], codePrefix?: string): ObservedTotals {
  // As-reported totals are read at the HS6 grain like everything else, so the
  // same slice reports the same money at every level; a code prefix narrows by
  // truncation. Global totals are unchanged — the layers agreed in aggregate.
  let pe = 0, ui = 0, n = 0, oneSidedPe = 0, oneSidedUi = 0, oneSidedCells = 0;
  for (const r of rows) {
    if (r.l !== 6) continue;
    if (codePrefix && !r.k.startsWith(codePrefix)) continue;
    pe += r.pe; ui += r.ui; n++;
    // one book only: counted as reported trade, excluded from every gap measure
    if (r.pe <= NOISE || r.ui <= NOISE) { oneSidedPe += r.pe; oneSidedUi += r.ui; oneSidedCells++; }
  }
  return { pe, ui, cells: n, oneSidedPe, oneSidedUi, oneSidedCells };
}

/**
 * As-reported totals for a node, including one-sided observations.
 *
 * Discrepancy measures pair the two books and therefore drop anything only one
 * side reported. Those observations are still real trade, so reported-value
 * figures read from here rather than from the paired channels — otherwise the
 * headline totals under-report and cannot be reconciled against UN Comtrade.
 */
export function observedTotals(f: Filter, _level: number, codePrefix?: string): ObservedTotals {
  return sumObserved(filterCells(f), codePrefix);
}

/**
 * Which option values are still reachable, per dimension. Each list is built
 * with every filter applied EXCEPT its own, so ticking one value never hides its
 * own siblings — standard faceted behaviour. Empty selections mean "all", so the
 * lists narrow as the user commits to a chapter, a partner or a set of years.
 */
export function availableOptions(f: Filter): {
  years: number[];
  countries: string[];
  hs2: string[];
  hs4: string[];
  hs6: string[];
} {
  const yearOn = (r: Cell) => f.years.length === 0 || f.years.includes(r.y);
  const partnerOn = (r: Cell) => f.country.length === 0 || f.country.includes(r.p);

  const years = new Set<number>();
  const countries = new Set<string>();
  const hs2 = new Set<string>();
  const hs4 = new Set<string>();
  const hs6 = new Set<string>();

  // In monthly mode the month filter is deliberately NOT applied to the year
  // facet: unticking months must never hide years, only narrow their totals.
  // The yearly universe is what the yearly pages read: the workbook plus the
  // derived years' annualized HS6 lines. It used to fold the derived years from
  // the monthly detail, which only loads on the monthly basis, so on a yearly
  // 2025/2026 view the HS4 and HS6 pickers had no lines to offer.
  const universe = f.granularity === "month"
    ? monthlySource({ ...f, months: [], years: [] })
    : sourceCells({ ...f, months: [], years: [...yearlyYears] });
  for (const r of universe) {
    const code = matchesCode(r, f);
    // a dimension's own selection is excluded from its own facet
    if (partnerOn(r) && code) years.add(r.y);
    if (yearOn(r) && code) countries.add(r.p);
    if (yearOn(r) && partnerOn(r)) {
      // chapters ignore the HS selection entirely; HS4/HS6 respect the level above them
      hs2.add(r.c);
      if (r.l === 6) {
        const inChapter = f.hs2.length === 0 || f.hs2.includes(r.c);
        if (inChapter) hs4.add(r.k.slice(0, 4));
        if (inChapter && (f.hs4.length === 0 || f.hs4.some((c) => r.k.startsWith(c)))) hs6.add(r.k);
      }
    }
  }

  return {
    years: yearsFor(f.granularity).filter((y) => years.has(y)),
    countries: [...countries],
    hs2: [...hs2],
    hs4: [...hs4],
    hs6: [...hs6],
  };
}

export function aggregate(f: Filter): Aggregate {
  const windowYears = yearsFor(f.granularity);
  // No ticks means the whole basis on monthly, but only the workbook's years on
  // yearly: the derived years have to be asked for, never inherited.
  const picked = f.years.length
    ? new Set(f.years)
    : new Set(f.granularity === "month" ? windowYears : meta.years);
  const years = windowYears.filter((y) => picked.has(y));
  const yearsInRange = years.length;
  const allowPartner = (iso: string) => {
    const pm = pMeta.get(iso);
    if (!pm) return false;
    if (f.country.length > 0 && !f.country.includes(iso)) return false;
    return true;
  };
  /** HS filters cascade: the most specific level with a selection wins. */
  const allowCode = (r: Cell) => matchesCode(r, f);
  const fc = sourceCells(f).filter((r) => picked.has(r.y) && allowPartner(r.p) && allowCode(r));

  const baseChannels = buildChannels(fc, 2, f);
  const baseChannels4 = buildChannels(fc, 4, f);
  const baseChannels6 = buildChannels(fc, 6, f);

  /*
   * Score the period, then filter. With no country or product tick the base
   * channels already ARE the period's cross-section, so the common case costs
   * one extra pass over numbers already in hand; with a tick, the cross-section
   * is rebuilt unfiltered so the rank still stands against every cell.
   */
  const wholeCrossSection = f.country.length === 0 && f.hs2.length === 0 && f.hs4.length === 0 && f.hs6.length === 0;
  const periodCells = wholeCrossSection ? fc : sourceCells(f).filter((r) => picked.has(r.y) && pMeta.has(r.p));
  const bandCuts: Record<number, BandCuts> = {};
  for (const [lvl, base] of [[2, baseChannels], [4, baseChannels4], [6, baseChannels6]] as const) {
    const scores = levelScores(f, lvl, years, periodCells, wholeCrossSection ? base : null);
    applyScores(base, scores);
    bandCuts[lvl] = scores.cuts;
  }

  const channels = applyChannelFilters(baseChannels, f);
  const channels4 = applyChannelFilters(baseChannels4, f);
  const channels6 = applyChannelFilters(baseChannels6, f);

  const dirVal = (c: Channel) => c.posT;

  // Roll up at the most specific HS level the user picked: selecting a product
  // must report that product, not its whole chapter. With no HS filter the
  // rollup stays at HS2, which is the stable chapter-level view.
  const rollupLevel = f.rollupLevel ?? (f.hs6.length > 0 ? 6 : f.hs4.length > 0 ? 4 : 2);
  const observed = sumObserved(fc);
  const rollup = rollupLevel === 6 ? channels6 : rollupLevel === 4 ? channels4 : channels;
  const rollupBase = rollupLevel === 6 ? baseChannels6 : rollupLevel === 4 ? baseChannels4 : baseChannels;

  // ---- partner rollups ----
  const pMap = new Map<string, Channel[]>();
  for (const c of rollup) (pMap.get(c.partnerIso) ?? pMap.set(c.partnerIso, []).get(c.partnerIso)!).push(c);
  /*
   * The per-year series is built from the PRE-SCREEN channels, not the ranked
   * ones. It feeds the reported-vs-recorded comparison, whose job is to show
   * what each book holds; restricting it to channels that happen to carry a
   * positive gap somewhere in the window would silently drop the chapters
   * where Uzbekistan recorded more — exactly the context the comparison needs.
   * Its yearly positive figures therefore tie to the headline total.
   */
  const pBaseMap = new Map<string, Channel[]>();
  for (const c of rollupBase) (pBaseMap.get(c.partnerIso) ?? pBaseMap.set(c.partnerIso, []).get(c.partnerIso)!).push(c);
  // as-reported totals per partner, read from the cells rather than the paired channels
  const obsByPartner = new Map<string, Cell[]>();
  for (const r of fc) (obsByPartner.get(r.p) ?? obsByPartner.set(r.p, []).get(r.p)!).push(r);
  const partners: PartnerAgg[] = [];
  for (const [iso, cs] of pMap) {
    const pm = pMeta.get(iso)!;
    const byYearMap = new Map<number, { pe: number; ui: number; positive: number }>();
    for (const c of pBaseMap.get(iso) ?? []) for (const yr of c.years) {
      const e = byYearMap.get(yr.y) ?? { pe: 0, ui: 0, positive: 0 };
      e.pe += yr.pe; e.ui += yr.ui; e.positive += yr.posY;
      byYearMap.set(yr.y, e);
    }
    const posTotal = cs.reduce((s, c) => s + c.posT, 0);
    const dirSeries = years.filter((y) => byYearMap.has(y) && pm.reportedYears.includes(y))
      .map((y) => ({ y, v: byYearMap.get(y)!.positive }));
    const topChapters = [...cs].sort((a, b) => dirVal(b) - dirVal(a)).filter((c) => dirVal(c) > NOISE).slice(0, 8)
      .map((c) => ({ chapter: c.chapter, label: c.cmdLabel, value: Math.round(dirVal(c)), share: posTotal > 0 ? c.posT / posTotal : 0 }));
    partners.push({
      iso3: iso, name: partnerName(iso), region: regionLabel(pm.region), transit: pm.transit, tier: pm.tier,
      coverage: pm.coverage, lapse: pm.lapse, lastReportedYear: pm.lastReportedYear, reportedYears: pm.reportedYears,
      peT: cs.reduce((s, c) => s + c.peT, 0), uiT: cs.reduce((s, c) => s + c.uiT, 0),
      pePosT: cs.reduce((s, c) => s + c.pePosT, 0), uiPosT: cs.reduce((s, c) => s + c.uiPosT, 0),
      observed: sumObserved(obsByPartner.get(iso) ?? []),
      posT: posTotal, signedT: cs.reduce((s, c) => s + c.signedT, 0),
      channels: cs.length,
      flagged: cs.filter((c) => c.band === "critical" || c.band === "high").length,
      mtrs: cs.reduce((m, c) => Math.max(m, c.mtrs), 0),
      byYear: years.map((y) => {
        const e = byYearMap.get(y);
        return { year: y, pe: e?.pe ?? 0, ui: e?.ui ?? 0, positive: e?.positive ?? 0, reported: pm.reportedYears.includes(y) };
      }),
      topChapters, trend: trendOf(dirSeries),
    });
  }
  partners.sort((a, b) => b.posT - a.posT);

  // ---- chapter rollups ----
  const cMap = new Map<string, Channel[]>();
  for (const c of rollup) (cMap.get(c.chapter) ?? cMap.set(c.chapter, []).get(c.chapter)!).push(c);
  const chapters: ChapterAgg[] = [];
  for (const [chapter, cs] of cMap) {
    const byYear = new Map<number, number>();
    for (const c of cs) for (const yr of c.years) {
      byYear.set(yr.y, (byYear.get(yr.y) ?? 0) + yr.posY);
    }
    const series = years.filter((y) => byYear.has(y)).map((y) => ({ y, v: byYear.get(y)! }));
    const peT = cs.reduce((s, c) => s + c.peT, 0);
    const posT = cs.reduce((s, c) => s + c.posT, 0);
    const top = [...cs].sort((a, b) => dirVal(b) - dirVal(a))[0];
    chapters.push({
      chapter, label: hsLabel(chapter), category: cs[0].category, residual: isResidualChapter(chapter),
      peT, uiT: cs.reduce((s, c) => s + c.uiT, 0),
      posT, signedT: cs.reduce((s, c) => s + c.signedT, 0),
      gapRate: peT > 0 ? posT / peT : 0, channels: cs.length,
      topPartner: top ? { name: top.partner, iso3: top.partnerIso, value: Math.round(dirVal(top)) } : null,
      trend: trendOf(series),
    });
  }
  chapters.sort((a, b) => b.posT - a.posT);

  // ---- categories ----
  const catTotals = new Map<string, number>();
  for (const c of rollup) catTotals.set(c.category, (catTotals.get(c.category) ?? 0) + c.posT);
  const catSum = [...catTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const categories = [...catTotals.entries()].map(([key, v]) => ({ key, label: categoryLabel(key), value: v, share: v / catSum }))
    .filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  // ---- annual (positive discrepancy, plus comparable partner count) ----
  const yAgg = new Map<number, { pe: number; ui: number; pePos: number; uiPos: number; positive: number; reverse: number; partners: Set<string> }>();
  const emptyYear = () => ({ pe: 0, ui: 0, pePos: 0, uiPos: 0, positive: 0, reverse: 0, partners: new Set<string>() });
  for (const c of rollupBase) for (const yr of c.years) {
    const e = yAgg.get(yr.y) ?? emptyYear();
    e.pe += yr.pe; e.ui += yr.ui;
    e.positive += yr.posY; e.reverse += yr.revY;
    e.partners.add(c.partnerIso);
    e.pePos += yr.pePosY; e.uiPos += yr.uiPosY;
    yAgg.set(yr.y, e);
  }
  const annual: Aggregate["annual"] = years.map((y) => {
    const e = yAgg.get(y) ?? emptyYear();
    return { year: y, pe: e.pe, ui: e.ui, pePos: e.pePos, uiPos: e.uiPos, positive: e.positive, reverse: e.reverse, comparablePartners: e.partners.size };
  });

  /*
   * On the monthly basis the dynamics keep month resolution: the year-shaped
   * channels above have already summed the ticked months (correct for every
   * total), but a time series drawn from them would collapse to yearly bars.
   * Recompute the series straight from the month rows under the same filters,
   * with the same both-books rule applied per month.
   */
  if (f.granularity === "month") {
    const K = 1 + f.cif;
    const wantM = f.months.length ? new Set(f.months) : null;
    const mAgg = new Map<number, { pe: number; ui: number; pePos: number; uiPos: number; positive: number; reverse: number; partners: Set<string> }>();
    const bump = (key: number, p: string, pe: number, ui: number) => {
      const e = mAgg.get(key) ?? { pe: 0, ui: 0, pePos: 0, uiPos: 0, positive: 0, reverse: 0, partners: new Set<string>() };
      e.pe += pe; e.ui += ui;
      if (pe > NOISE && ui > NOISE) {
        const signed = pe - ui / K;
        e.positive += pos(signed);
        e.reverse += pos(-signed);
        if (signed > 0) { e.pePos += pe; e.uiPos += ui; }
        e.partners.add(p);
      }
      mAgg.set(key, e);
    };
    if (monthlyDetail) {
      // The series is built from the detail rows at the HS6 grain whatever the
      // rollup level — the HS2 sheet is a separate aggregation and would not
      // tie to the totals above. Until the detail arrives the series stays
      // empty, like the channels: a number shown then replaced is worse than a
      // moment of loading. Rows first fold to (partner × HS6 × month) cells so
      // the both-books rule tests the same grain the channels use.
      const det = monthlyDetail;
      const codeOk = det.k.map((k) => {
        const c = k.slice(0, 2);
        return matchesCode({ p: "", k, c, cat: categoryOfChapter(c), l: 6, y: 0, pe: 0, ui: 0 }, f);
      });
      const groupOf = det.k; // the measurement grain: HS6 itself
      const pOk = det.p.map((iso) => allowPartner(iso));
      const detY0 = det.y0 - monthlyPacked.y0; // align month offsets to the chapter series' epoch
      const cellAgg = new Map<string, { p: string; off: number; pe: number; ui: number }>();
      for (const row of det.r) {
        if (!pOk[row[0]] || !codeOk[row[1]]) continue;
        const off = row[2] + detY0 * 12;
        const y = monthlyPacked.y0 + ((off / 12) | 0);
        if (!picked.has(y)) continue;
        if (wantM && !wantM.has((off % 12) + 1)) continue;
        const key = `${row[0]}|${groupOf[row[1]]}|${off}`;
        const e = cellAgg.get(key) ?? { p: det.p[row[0]], off, pe: 0, ui: 0 };
        e.pe += row[3]; e.ui += row[4];
        cellAgg.set(key, e);
      }
      for (const e of cellAgg.values()) bump(e.off, e.p, e.pe, e.ui);
    }
    annual.length = 0;
    for (const key of [...mAgg.keys()].sort((x, y) => x - y)) {
      const e = mAgg.get(key)!;
      const year = monthlyPacked.y0 + Math.floor(key / 12);
      const month = (key % 12) + 1;
      annual.push({
        year, month,
        label: `${year}-${String(month).padStart(2, "0")}`,
        pe: e.pe, ui: e.ui, pePos: e.pePos, uiPos: e.uiPos,
        positive: e.positive, reverse: e.reverse, comparablePartners: e.partners.size,
      });
    }
  }

  // ---- concentration (positive discrepancy over filtered channels) ----
  const sorted = [...rollup].filter((c) => dirVal(c) > NOISE).sort((a, b) => dirVal(b) - dirVal(a));
  const dirTotal = sorted.reduce((s, c) => s + dirVal(c), 0) || 1;
  let cum = 0;
  const concentration = sorted.slice(0, 20).map((c) => {
    cum += dirVal(c);
    return { name: `${c.partner} · ${c.cmdLabel}`, partner: c.partner, iso3: c.partnerIso, cmd: c.cmd, value: Math.round(dirVal(c)), share: dirVal(c) / dirTotal, cumShare: cum / dirTotal };
  });

  // ---- movers ----
  const goods = chapters.map((c) => {
    const byYear = new Map<number, number>();
    // read the same set the chapter rollup was built from, or the sector series
    // would contradict the chapter totals shown beside it
    for (const ch of rollup) if (ch.chapter === c.chapter) for (const yr of ch.years) {
      byYear.set(yr.y, (byYear.get(yr.y) ?? 0) + yr.posY);
    }
    const series = years.filter((y) => byYear.has(y)).map((y) => ({ y, v: byYear.get(y)! }));
    const total = series.reduce((s, x) => s + x.v, 0);
    return { key: c.chapter, label: c.label, total, trend: trendOf(series), series };
  });
  const countries = partners.filter((p) => !p.lapse).map((p) => {
    const series = p.byYear.filter((x) => x.reported && x.positive > 0).map((x) => ({ y: x.year, v: x.positive }));
    const total = series.reduce((s, x) => s + x.v, 0);
    return { key: p.iso3, label: p.name, iso3: p.iso3, total, trend: trendOf(series), series };
  });

  // ---- heatmap ----
  const heatImport: Record<string, Record<string, number>> = {};
  for (const c of channels) (heatImport[c.chapter] ??= {})[c.partnerIso] = Math.round(c.signedT);

  // ---- funnel & KPIs (from base = pre-signal/materiality channels) ----
  const funnel = {
    observedChannels: rollupBase.length,
    comparableChannels: rollupBase.length,
    comparableValue: rollupBase.reduce((s, c) => s + c.peT, 0),
  };
  // the endpoints are accumulated per HS6 line inside buildChannels, so they
  // are the same identity at the band rates — never a re-derivation
  const posAt = (which: "lo" | "hi") =>
    rollupBase.reduce((s, c) => s + (which === "lo" ? c.posLoT : c.posHiT), 0);
  const activePartners = meta.partners.filter((p) => allowPartner(p.iso3));
  const possiblePY = activePartners.length * yearsInRange || 1;
  const comparablePY = activePartners.reduce((s, p) => s + p.reportedYears.filter((y) => picked.has(y)).length, 0);

  const kpis = {
    comparableTrade: rollupBase.reduce((s, c) => s + c.peT, 0),
    positive: { low: posAt("lo"), central: rollupBase.reduce((s, c) => s + c.posT, 0), high: posAt("hi") },
    coveragePct: comparablePY / possiblePY,
    // partners with a line both books recorded in the period — pre-screen, so
    // the count is the Data Quality marks for the same years, not the ranking
    channelCount: channels.length, partnerCount: new Set(rollupBase.map((c) => c.partnerIso)).size,
    top5Share: sorted.slice(0, 5).reduce((s, c) => s + dirVal(c), 0) / dirTotal,
    hhi: Math.round(sorted.reduce((s, c) => s + (dirVal(c) / dirTotal) ** 2, 0) * 10000),
  };

  return {
    filter: f, years, bandCuts, observed, channels, channels4, channels6, baseChannels, baseChannels4, baseChannels6,
    partners, chapters, categories, annual, concentration,
    movers: { goods, countries },
    heatmap: { import: heatImport, partners: partners.map((p) => ({ iso3: p.iso3, name: p.name, tier: p.tier })) },
    funnel, kpis,
  };
}

/** Compact label for a set of ticked years: "2017–2024", "2019, 2021" or "2019–2021, 2024". */
export function yearsLabel(years: number[]): string {
  const ys = [...new Set(years)].sort((a, b) => a - b);
  if (ys.length === 0) return "no years";
  const runs: string[] = [];
  let start = ys[0], prev = ys[0];
  for (const y of ys.slice(1)) {
    if (y === prev + 1) { prev = y; continue; }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = prev = y;
  }
  runs.push(start === prev ? `${start}` : `${start}–${prev}`);
  return runs.join(", ");
}

/** Context line per spec §5.3 — shown above every analytical block. */
export function contextLine(f: Filter): string {
  const parts = [yearsLabel(f.years.length ? f.years : yearsFor(f.granularity))];
  if (f.granularity === "month") {
    parts.push(f.months.length === 0 || f.months.length === 12
      ? "monthly"
      : `monthly: ${f.months.join(", ")}`);
  }
  // list a short selection outright; collapse a long one to a count
  const codes = (values: string[]) => (values.length <= 3 ? `HS ${values.join(", ")}` : `${values.length} HS codes`);
  if (f.hs6.length > 0) parts.push(codes(f.hs6));
  else if (f.hs4.length > 0) parts.push(codes(f.hs4));
  else if (f.hs2.length > 0) parts.push(codes(f.hs2));
  parts.push(`freight ${Math.round(f.cif * 100)}%`);
  return parts.join(" · ");
}
