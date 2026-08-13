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
import productsRaw from "@/data/products.json";
import riskRaw from "@/data/risk.json";
import { tCategory, tCountry, tRegion, tText } from "@/lib/labels";

export const METHODOLOGY_VERSION = "3.1";

export type Tier = "High" | "Medium" | "Low";
/** MTRS band. Ordered most to least urgent; `low` also covers unscored cells. */
export type RiskBand = "critical" | "high" | "elevated" | "low";
export type Robustness = "robust" | "freight-sensitive" | "coverage-sensitive" | "insufficient";

interface Cell { p: string; k: string; c: string; cat: string; l: number; y: number; pe: number; ui: number; uw?: number; pw?: number }
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

/** Values at or below this are treated as noise, not as a reported flow. */
const NOISE = 100_000;

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
   * Derive the HS4 layer here rather than shipping it. HS4 is defined as the
   * truncation of HS6, so rebuilding it in one pass is both smaller over the
   * wire and impossible to drift out of step with its children.
   */
  const h4 = new Map<string, Cell>();
  for (const r of out) {
    if (r.l !== 6) continue;
    const code = r.k.slice(0, 4);
    const key = `${r.p}|${code}|${r.y}`;
    let agg = h4.get(key);
    if (!agg) {
      agg = { p: r.p, k: code, c: r.c, cat: r.cat, l: 4, y: r.y, pe: 0, ui: 0 };
      h4.set(key, agg);
    }
    agg.pe += r.pe;
    agg.ui += r.ui;
    if (r.uw !== undefined && r.pw !== undefined) {
      agg.uw = (agg.uw ?? 0) + r.uw;
      agg.pw = (agg.pw ?? 0) + r.pw;
    }
  }
  for (const cell of h4.values()) out.push(cell);
  return out;
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

/** Years the monthly series covers — a longer window than the annual books. */
export const monthlyYears: number[] = Object.keys(monthlyPacked?.monthsByYear ?? {})
  .map(Number)
  .sort((a, b) => a - b);
/** Calendar months actually reported for a year (the current year is partial). */
export const monthsOfYear = (y: number): number[] => monthlyPacked?.monthsByYear?.[String(y)] ?? [];
/** Every selectable year on either basis, for URL validation and pickers. */
export const ALL_YEARS: number[] = [...new Set([...meta.years, ...monthlyYears])].sort((a, b) => a - b);

/** Years the active granularity offers. */
export const yearsFor = (g: Granularity): number[] => (g === "month" ? monthlyYears : meta.years);

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
      cell = { p: r.p, k: r.k, c: r.c, cat: r.cat, l: 2, y: r.y, pe: 0, ui: 0 };
      acc.set(key, cell);
    }
    cell.pe += r.pe;
    cell.ui += r.ui;
  }
  const out = [...acc.values()];

  const det = monthlyDetail;
  if (det) {
    // fold straight off the packed rows on numeric keys — string keys on 1.9M
    // iterations would dominate the cost
    const nK = det.k.length;
    const acc6 = new Map<number, Cell>();
    for (const row of det.r) {
      const y = det.y0 + ((row[2] / 12) | 0);
      if (wantY && !wantY.has(y)) continue;
      if (wantM && !wantM.has((row[2] % 12) + 1)) continue;
      const id = (row[0] * nK + row[1]) * 16 + (y - det.y0);
      let cell = acc6.get(id);
      if (!cell) {
        const k = det.k[row[1]];
        const c = k.slice(0, 2);
        cell = { p: det.p[row[0]], k, c, cat: categoryOfChapter(c), l: 6, y, pe: 0, ui: 0 };
        acc6.set(id, cell);
      }
      cell.pe += row[3];
      cell.ui += row[4];
    }
    // derived HS4 layer, same rule as the yearly load: exact truncation of HS6
    const acc4 = new Map<string, Cell>();
    for (const r of acc6.values()) {
      const code = r.k.slice(0, 4);
      const key = `${r.p}|${code}|${r.y}`;
      let agg = acc4.get(key);
      if (!agg) {
        agg = { p: r.p, k: code, c: r.c, cat: r.cat, l: 4, y: r.y, pe: 0, ui: 0 };
        acc4.set(key, agg);
      }
      agg.pe += r.pe;
      agg.ui += r.ui;
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
  return f.granularity === "month" ? monthlySource(f) : cells;
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
  for (const r of cells) {
    if (r.pe <= NOISE || r.ui <= NOISE) continue;
    const key = `${r.l}|${r.p}|${r.k}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
})();

/* ------------------------------------------------------------------ */
/* MTRS v3.0 — precomputed risk index                                  */
/* ------------------------------------------------------------------ */

/** `${level}|${partnerIso}|${code}` → [MTRS, G, P, k, n, excess gap USD, band]. */
type RiskRow = readonly [number, number, number, number, number, number, number];
interface PartnerEffect { iso: string; u: number; cells: number }

const riskIndex = riskRaw as unknown as {
  version: string;
  generatedAt: string;
  config: { alpha: number; beta: number; materialityFloor: number; criticalTop: number; freight: number };
  cells: Record<string, RiskRow>;
  partnerEffects: Record<string, PartnerEffect[]>;
  bandCuts: Record<string, { critical: number; high: number; elevated: number }>;
};

export const RISK_CONFIG = riskIndex.config;
export const RISK_BAND_CUTS = riskIndex.bandCuts;
const BANDS: RiskBand[] = ["critical", "high", "elevated", "low"];
const EMPTY_RISK: RiskRow = [0, 0, 0, 0, 0, 0, 3];

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
}
export const DEFAULT_FILTER: Filter = {
  granularity: "year",
  years: [...meta.years],
  months: [],
  cif: meta.cif.central,
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

export interface YearRow { y: number; pe: number; ui: number; signed: number; uvOk: boolean }
export interface Channel {
  partner: string; partnerIso: string; region: string; transit: boolean; tier: Tier;
  chapter: string; cmd: string; cmdLabel: string; level: number; category: string;
  years: YearRow[];
  peT: number; uiT: number; expectedT: number;
  /**
   * Totals over the positive channel-years only — both books reported and the
   * partner side exceeds Uzbekistan's after freight. Wherever these sit beside
   * the positive discrepancy the three figures form one identity:
   * pePosT × (1 + f) − uiPosT = posT.
   */
  pePosT: number; uiPosT: number;
  signedT: number; posT: number; revT: number; absT: number;
  boundedAsymmetry: number; positiveShare: number;
  comparableYears: number; posYears: number; revYears: number; longestPosStreak: number;
  flipsAcrossFreight: boolean;
  uvYears: number; uvRatio: number | null;
  robustness: Robustness; flags: string[];
  /**
   * MTRS v3.0, read from the precomputed index. Pooled over the whole window, so
   * these five fields do not move with the period ticks — the ticks decide which
   * cells are listed and how large their gap is, not how the cell scores.
   */
  mtrs: number; abnormalGap: number; persistence: number;
  flaggedYears: number; matchedYears: number; excessGap: number;
  band: RiskBand; scored: boolean;
  /** positive discrepancy used for ranking */
  primary: number;
  trend: number;
}

function trendOf(series: { y: number; v: number }[]) {
  if (series.length < 2) return 0;
  const n = Math.min(3, Math.floor(series.length / 2) || 1);
  const mean = (a: { v: number }[]) => a.reduce((s, x) => s + x.v, 0) / a.length;
  return mean(series.slice(-n)) - mean(series.slice(0, n));
}

function buildChannels(fc: Cell[], level: number, f: Filter): Channel[] {
  const K = 1 + f.cif;
  const Klo = 1 + meta.cif.low;
  const Khi = 1 + meta.cif.high;
  const groups = new Map<string, Cell[]>();
  for (const r of fc) {
    if (r.l !== level) continue;
    const key = `${r.p}|${r.k}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const out: Channel[] = [];
  for (const [, rs] of groups) {
    const r0 = rs[0];
    const pm = pMeta.get(r0.p);
    if (!pm) continue;
    rs.sort((a, b) => a.y - b.y);

    const years: YearRow[] = [];
    let peT = 0, uiT = 0, posT = 0, revT = 0, pePosT = 0, uiPosT = 0;
    let posYears = 0, revYears = 0, streak = 0, longest = 0;
    let uvYears = 0, uw = 0, pw = 0, uwv = 0, pwv = 0;
    for (const r of rs) {
      // A mirror comparison needs BOTH books. A channel-year where only one side
      // reported cannot be a discrepancy — the whole of the reported side would be
      // booked as a gap, which is a false positive, not a signal. Such years are
      // dropped here and surface instead as one-sided flows on Data Quality.
      if (r.pe <= NOISE || r.ui <= NOISE) continue;
      const signed = r.pe * K - r.ui;
      years.push({ y: r.y, pe: r.pe, ui: r.ui, signed, uvOk: !!(r.uw && r.pw) });
      peT += r.pe; uiT += r.ui;
      posT += pos(signed); revT += pos(-signed);
      if (signed > 0) { pePosT += r.pe; uiPosT += r.ui; }
      if (signed > NOISE) { posYears++; streak++; longest = Math.max(longest, streak); } else streak = 0;
      if (signed < -NOISE) revYears++;
      if (r.uw && r.pw) { uvYears++; uw += r.uw; pw += r.pw; uwv += r.ui; pwv += r.pe; }
    }
    if (years.length === 0) continue; // no year with both books reporting
    const expectedT = peT * K;
    const signedT = expectedT - uiT;
    const absT = posT + revT;
    const n = years.length;

    const boundedAsymmetry = Math.max(expectedT, uiT) > 0 ? clamp(absT / Math.max(expectedT, uiT)) : 0;
    const positiveShare = expectedT > 0 ? clamp(posT / expectedT) : 0;
    const uvRatio = uvYears >= 2 && uw > 0 && pw > 0 && pwv > 0 ? (uwv / uw) / (pwv / pw) : null;

    // scenario robustness: does the direction-relevant sign hold across 6/10/15%?
    const netSigns = [sgn(peT * Klo - uiT), sgn(signedT), sgn(peT * Khi - uiT)];
    const flipsAcrossFreight = new Set(netSigns.filter((s) => s !== 0)).size > 1 || netSigns.includes(0);

    // flags
    const flags: string[] = [];
    if (pm.transit) flags.push("transit");
    if (isResidualChapter(r0.c)) flags.push("residual-hs");
    if (pm.lapse) flags.push("reporting-stop");
    if (pm.coverage < 0.5) flags.push("sparse-reporter");
    if (uvYears === 0 && level === 6) flags.push("missing-weight");
    if (flipsAcrossFreight) flags.push("freight-sensitive");

    const nHist = histYears.get(`${level}|${r0.p}|${r0.k}`) ?? n; // full-window comparable years
    const robustness: Robustness =
      nHist < 2 ? "insufficient"
        : flipsAcrossFreight ? "freight-sensitive"
          : pm.lapse || pm.coverage < 0.5 ? "coverage-sensitive"
            : "robust";

    // (label resolution handles HS2 / derived HS4 / HS6 uniformly)
    // the dashboard screens the positive discrepancy only
    const primary = posT;
    const trend = trendOf(years.map((x) => ({ y: x.y, v: pos(x.signed) })));

    // ---- MTRS v3.0, looked up rather than recomputed ----
    // The score needs the fitted structural model, so it is a property of the
    // whole-window cell. A channel the period ticks have narrowed still carries
    // the score estimated on every year that cell was matched.
    const rkey = `${level}|${r0.p}|${r0.k}`;
    const rr = riskIndex.cells[rkey];
    const [mtrs, abnormalGap, persistence, flaggedYears, matchedYears, excessGap, bandIdx] = rr ?? EMPTY_RISK;

    out.push({
      partner: partnerName(pm.iso3), partnerIso: pm.iso3, region: regionLabel(pm.region), transit: pm.transit, tier: pm.tier,
      chapter: r0.c, cmd: r0.k, cmdLabel: hsLabel(r0.k),
      level, category: r0.cat,
      years, peT, uiT, expectedT, pePosT, uiPosT, signedT, posT, revT, absT,
      boundedAsymmetry, positiveShare,
      comparableYears: n, posYears, revYears, longestPosStreak: longest,
      flipsAcrossFreight, uvYears, uvRatio,
      robustness, flags,
      mtrs, abnormalGap, persistence, flaggedYears, matchedYears, excessGap,
      band: BANDS[bandIdx] ?? "low", scored: !!rr,
      primary, trend,
    });
  }
  return out;
}

const BAND_RANK: Record<RiskBand, number> = { critical: 0, high: 1, elevated: 2, low: 3 };

function applyChannelFilters(chs: Channel[], f: Filter): Channel[] {
  return chs
    .filter((c) => {
      // HS 98/99 ("commodities not specified", confidential) are not comparable at
      // product level: they stay in baseChannels for totals and the statistical
      // profile, but never rank as screening priorities.
      if (isResidualChapter(c.chapter)) return false;
      if (f.band !== "all" && c.band !== f.band) return false;
      if (c.primary < f.minGap) return false;
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
    /** Positive channel-years only: pePos × (1 + f) − uiPos = positive exactly. */
    pePos: number; uiPos: number;
    positive: number; comparablePartners: number;
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

function sumObserved(rows: Cell[], level: number, codePrefix?: string): ObservedTotals {
  let pe = 0, ui = 0, n = 0, oneSidedPe = 0, oneSidedUi = 0, oneSidedCells = 0;
  for (const r of rows) {
    if (r.l !== level) continue;
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
export function observedTotals(f: Filter, level: number, codePrefix?: string): ObservedTotals {
  return sumObserved(filterCells(f), level, codePrefix);
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
  const universe = f.granularity === "month" ? monthlySource({ ...f, months: [], years: [] }) : cells;
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
  const picked = f.years.length ? new Set(f.years) : new Set(windowYears);
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
  const channels = applyChannelFilters(baseChannels, f);
  const channels4 = applyChannelFilters(baseChannels4, f);
  const channels6 = applyChannelFilters(baseChannels6, f);

  const dirVal = (c: Channel) => c.posT;

  // Roll up at the most specific HS level the user picked: selecting a product
  // must report that product, not its whole chapter. With no HS filter the
  // rollup stays at HS2, which is the stable chapter-level view.
  const rollupLevel = f.hs6.length > 0 ? 6 : f.hs4.length > 0 ? 4 : 2;
  const observed = sumObserved(fc, rollupLevel);
  const rollup = rollupLevel === 6 ? channels6 : rollupLevel === 4 ? channels4 : channels;
  const rollupBase = rollupLevel === 6 ? baseChannels6 : rollupLevel === 4 ? baseChannels4 : baseChannels;

  // ---- partner rollups ----
  const pMap = new Map<string, Channel[]>();
  for (const c of rollup) (pMap.get(c.partnerIso) ?? pMap.set(c.partnerIso, []).get(c.partnerIso)!).push(c);
  // as-reported totals per partner, read from the cells rather than the paired channels
  const obsByPartner = new Map<string, Cell[]>();
  for (const r of fc) (obsByPartner.get(r.p) ?? obsByPartner.set(r.p, []).get(r.p)!).push(r);
  const partners: PartnerAgg[] = [];
  for (const [iso, cs] of pMap) {
    const pm = pMeta.get(iso)!;
    const byYearMap = new Map<number, { pe: number; ui: number; positive: number }>();
    for (const c of cs) for (const yr of c.years) {
      const e = byYearMap.get(yr.y) ?? { pe: 0, ui: 0, positive: 0 };
      e.pe += yr.pe; e.ui += yr.ui; e.positive += pos(yr.signed);
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
      observed: sumObserved(obsByPartner.get(iso) ?? [], rollupLevel),
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
      byYear.set(yr.y, (byYear.get(yr.y) ?? 0) + pos(yr.signed));
    }
    const series = years.filter((y) => byYear.has(y)).map((y) => ({ y, v: byYear.get(y)! }));
    const peT = cs.reduce((s, c) => s + c.peT, 0);
    const posT = cs.reduce((s, c) => s + c.posT, 0);
    const top = [...cs].sort((a, b) => dirVal(b) - dirVal(a))[0];
    chapters.push({
      chapter, label: hsLabel(chapter), category: cs[0].category, residual: isResidualChapter(chapter),
      peT, uiT: cs.reduce((s, c) => s + c.uiT, 0),
      posT, signedT: cs.reduce((s, c) => s + c.signedT, 0),
      gapRate: peT > 0 ? posT / (peT * (1 + f.cif)) : 0, channels: cs.length,
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
  const yAgg = new Map<number, { pe: number; ui: number; pePos: number; uiPos: number; positive: number; partners: Set<string> }>();
  for (const c of rollupBase) for (const yr of c.years) {
    const e = yAgg.get(yr.y) ?? { pe: 0, ui: 0, pePos: 0, uiPos: 0, positive: 0, partners: new Set<string>() };
    e.pe += yr.pe; e.ui += yr.ui; e.positive += pos(yr.signed); e.partners.add(c.partnerIso);
    if (yr.signed > 0) { e.pePos += yr.pe; e.uiPos += yr.ui; }
    yAgg.set(yr.y, e);
  }
  const annual: Aggregate["annual"] = years.map((y) => {
    const e = yAgg.get(y) ?? { pe: 0, ui: 0, pePos: 0, uiPos: 0, positive: 0, partners: new Set<string>() };
    return { year: y, pe: e.pe, ui: e.ui, pePos: e.pePos, uiPos: e.uiPos, positive: e.positive, comparablePartners: e.partners.size };
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
    const mAgg = new Map<number, { pe: number; ui: number; pePos: number; uiPos: number; positive: number; partners: Set<string> }>();
    const bump = (key: number, p: string, pe: number, ui: number) => {
      const e = mAgg.get(key) ?? { pe: 0, ui: 0, pePos: 0, uiPos: 0, positive: 0, partners: new Set<string>() };
      e.pe += pe; e.ui += ui;
      if (pe > NOISE && ui > NOISE) {
        const signed = pe * K - ui;
        e.positive += pos(signed);
        if (signed > 0) { e.pePos += pe; e.uiPos += ui; }
        e.partners.add(p);
      }
      mAgg.set(key, e);
    };
    if (rollupLevel === 2) {
      for (const r of monthlyCells) {
        if (!picked.has(r.y)) continue;
        if (wantM && !wantM.has(r.m)) continue;
        if (!allowPartner(r.p)) continue;
        if (!allowCode({ ...r, l: 2 } as Cell)) continue;
        bump((r.y - monthlyPacked.y0) * 12 + (r.m - 1), r.p, r.pe, r.ui);
      }
    } else if (monthlyDetail) {
      // an HS4/HS6 selection rolls the series up from the detail rows — the HS2
      // sheet is a separate aggregation and would not tie to the totals above.
      // Per-code and per-partner verdicts are precomputed so the 1.9M-row walk
      // stays cheap. Rows first fold to (partner × rollup code × month) cells so
      // the both-books rule tests the same grain the channels use.
      const det = monthlyDetail;
      const codeOk = det.k.map((k) => {
        const c = k.slice(0, 2);
        return matchesCode({ p: "", k, c, cat: categoryOfChapter(c), l: 6, y: 0, pe: 0, ui: 0 }, f);
      });
      const groupOf = det.k.map((k) => (rollupLevel === 4 ? k.slice(0, 4) : k));
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
        positive: e.positive, comparablePartners: e.partners.size,
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
      byYear.set(yr.y, (byYear.get(yr.y) ?? 0) + pos(yr.signed));
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
  const Klo = 1 + meta.cif.low;
  const Khi = 1 + meta.cif.high;
  const posAt = (mult: number) =>
    rollupBase.reduce((s, c) => s + c.years.reduce((t, yr) => t + pos(yr.pe * mult - yr.ui), 0), 0);
  const activePartners = meta.partners.filter((p) => allowPartner(p.iso3));
  const possiblePY = activePartners.length * yearsInRange || 1;
  const comparablePY = activePartners.reduce((s, p) => s + p.reportedYears.filter((y) => picked.has(y)).length, 0);

  const kpis = {
    comparableTrade: rollupBase.reduce((s, c) => s + c.peT, 0),
    positive: { low: posAt(Klo), central: rollupBase.reduce((s, c) => s + c.posT, 0), high: posAt(Khi) },
    coveragePct: comparablePY / possiblePY,
    channelCount: channels.length, partnerCount: partners.length,
    top5Share: sorted.slice(0, 5).reduce((s, c) => s + dirVal(c), 0) / dirTotal,
    hhi: Math.round(sorted.reduce((s, c) => s + (dirVal(c) / dirTotal) ** 2, 0) * 10000),
  };

  return {
    filter: f, years, observed, channels, channels4, channels6, baseChannels, baseChannels4, baseChannels6,
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
