/**
 * Mirror Trade Risk Score (MTRS) v3.1 — build the static risk index.
 *
 *   npx tsx scripts/build-risk-index.ts
 *
 * Reads the mirror cells produced by build-from-excel.ts and writes
 * src/data/risk.json (per-cell scores, consumed by the dashboard) and
 * src/data/diagnostics.json (score diagnostics, shown on /methodology).
 * Nothing here runs in the browser: the dashboard reads finished numbers.
 *
 * Construction:
 *   0  matched set   both books report the cell-year; one-sided flows are
 *                    bucketed separately and never scored
 *   1  gap rate      Σ max(X − M ÷ (1 + f), 0) ÷ Σ X over the matched years, at
 *                    the central freight rate f — the ratio measure of the
 *                    partner-country method (Bhagwati 1964)
 *   2  G             percentile rank of the gap rate among cells with a positive
 *                    gap at the same HS level, 0 … 1 (rank normalization per the
 *                    OECD/JRC composite-indicator handbook); no positive gap → 0
 *   3  P             (k + 1) / (n + 2), Laplace's rule of succession: k = years
 *                    with a positive gap, n = matched years. The longest run of
 *                    consecutive positive years travels with k and n, so the
 *                    dashboard can show what the score was fitted on even when
 *                    the reader has narrowed the period
 *   4  composite     RS = 100 × √(G × P) — geometric aggregation, so only a gap
 *                    that is both large for its trade and recurring scores high
 *   5  bands         Critical = top 2.5% of positive scores; High, Elevated and
 *                    Low split the rest at the 75th and 50th percentiles
 *
 * Value only: there is no quantity or weight term anywhere in this file.
 */
import fs from "node:fs";
import path from "node:path";
import { ALPHA, BETA, CRITICAL_TOP, MATERIALITY_FLOOR, METHODOLOGY_VERSION, NOISE } from "./risk-config";

const ROOT = path.join(process.cwd(), "src", "data");

interface Cell { p: string; k: string; c: string; y: number; l: number; pe: number; ui: number }
interface MetaFile { generatedAt: string; cif: { central: number } }

/** cells.json ships columnar (see build-from-excel.ts); decode to flat records. */
interface PackedCells { v: number; y0: number; p: string[]; k: string[]; r: number[][] }
const cells: Cell[] = (() => {
  const packed: PackedCells = JSON.parse(fs.readFileSync(path.join(ROOT, "cells.json"), "utf8"));
  const flat: Cell[] = packed.r.map((row) => {
    const k = packed.k[row[1]];
    return { p: packed.p[row[0]], k, c: k.slice(0, 2), l: k.length, y: packed.y0 + row[2], pe: row[3], ui: row[4] };
  });
  // HS4 is derived from HS6 rather than shipped; rebuild it so this level is scored too
  const h4 = new Map<string, Cell>();
  for (const r of flat) {
    if (r.l !== 6) continue;
    const code = r.k.slice(0, 4);
    const key = `${r.p}|${code}|${r.y}`;
    const agg = h4.get(key) ?? { p: r.p, k: code, c: r.c, l: 4, y: r.y, pe: 0, ui: 0 };
    agg.pe += r.pe; agg.ui += r.ui;
    h4.set(key, agg);
  }
  return [...flat, ...h4.values()];
})();
const meta: MetaFile = JSON.parse(fs.readFileSync(path.join(ROOT, "meta.json"), "utf8"));
const K = 1 + meta.cif.central; // the central freight scenario, shared with the dashboard

/* ------------------------------------------------------------------ */
/* Ranking helpers                                                     */
/* ------------------------------------------------------------------ */

/** Percentile rank in [0,1], ties averaged: (average 1-based rank − 0.5) / n. */
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

/** Quantile of an ascending-sorted array, linear interpolation. */
function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}

/**
 * Longest run of consecutive positive years among the matched ones — the same
 * definition the dashboard uses for the period it has on screen, so the two
 * agree on what the word means: an unmatched year interrupts nothing, because
 * a year neither book reported is not a year without a gap.
 */
function longestPosRun(obs: { y: number; pos: boolean }[]): number {
  let best = 0, run = 0;
  for (const o of [...obs].sort((a, b) => a.y - b.y)) {
    if (o.pos) { run++; if (run > best) best = run; } else run = 0;
  }
  return best;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  if (n < 2) return 0;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/* ------------------------------------------------------------------ */
/* Per-level scoring                                                   */
/* ------------------------------------------------------------------ */

interface CellScore {
  rs: number; g: number; p: number; k: number; n: number; excess: number; band: number; value: number;
  /** Longest run of consecutive positive-gap years inside the matched window. */
  streak: number;
}

interface LevelResult {
  level: number;
  scores: Map<string, CellScore>;
  partnerGap: { iso: string; u: number; cells: number }[];
  corGP: number;
  gapRateQuantiles: { p50: number; p90: number; p99: number };
  coverage: {
    matchedCellYears: number; matchedCells: number;
    orphanImportCellYears: number; lostExportCellYears: number;
    inScopeCells: number; inScopeCellYears: number;
    valueRetainedShare: number;
    belowFloor: number;
  };
  bandCuts: { critical: number; high: number; elevated: number };
}

function runLevel(level: number): LevelResult {
  const atLevel = cells.filter((r) => r.l === level);

  /* ---- Step 0: matched set and the unmatched bucket ---- */
  interface CellAcc {
    p: string; k: string;
    n: number; kPos: number;
    expected: number; posSum: number; value: number;
    /**
     * Every matched year and whether it ran positive, kept so the longest run
     * can be measured the way the dashboard measures it: consecutive matched
     * years, since a year neither book reported is absent rather than negative.
     */
    obs: { y: number; pos: boolean }[];
    // for the descriptive partner indicator
    wLogGap: number; wSum: number;
  }
  const byCell = new Map<string, CellAcc>();
  let orphanImport = 0, lostExport = 0, totalValue = 0, matchedValue = 0;
  for (const r of atLevel) {
    const bothSides = r.pe > NOISE && r.ui > NOISE;
    totalValue += (r.pe + r.ui) / 2;
    if (!bothSides) {
      if (r.ui > NOISE) orphanImport++;
      if (r.pe > NOISE) lostExport++;
      continue;
    }
    const val = (r.pe + r.ui) / 2;
    matchedValue += val;
    const kk = `${r.p}|${r.k}`;
    let acc = byCell.get(kk);
    if (!acc) {
      acc = { p: r.p, k: r.k, n: 0, kPos: 0, expected: 0, posSum: 0, value: 0, obs: [], wLogGap: 0, wSum: 0 };
      byCell.set(kk, acc);
    }
    // FOB basis on both sides: the CIF import is divided down, not the export raised
    const adjUi = r.ui / K;
    const signed = r.pe - adjUi;
    acc.n++;
    // the gap rate divides by what the partner says it shipped
    acc.expected += r.pe;
    acc.value += val;
    if (signed > NOISE) { acc.kPos++; acc.posSum += signed; }
    acc.obs.push({ y: r.y, pos: signed > NOISE });
    const w = Math.log(val);
    acc.wLogGap += w * (Math.log(r.pe) - Math.log(r.ui));
    acc.wSum += w;
  }

  const cellList = [...byCell.entries()].map(([kk, a]) => ({
    kk, ...a,
    meanValue: a.value / a.n,
    gapRate: a.expected > 0 ? a.posSum / a.expected : 0,
  }));
  const matchedCellYears = cellList.reduce((s, c) => s + c.n, 0);

  /* ---- Steps 1–2: gap rate, rank-normalized G ---- */
  const scoped = cellList.filter((c) => c.gapRate > 0);
  const pr = percentileRanks(scoped.map((c) => c.gapRate));
  const gOf = new Map<string, number>();
  scoped.forEach((c, i) => gOf.set(c.kk, pr[i]));

  /* ---- Steps 3–4: persistence, composite ---- */
  const scores = new Map<string, CellScore>();
  for (const c of cellList) {
    const g = gOf.get(c.kk) ?? 0;
    const P = (c.kPos + ALPHA) / (c.n + ALPHA + BETA);
    const rs = 100 * Math.sqrt(g * P);
    scores.set(c.kk, {
      rs: Math.round(rs * 10) / 10,
      g: Math.round(g * 1000) / 1000,
      p: Math.round(P * 1000) / 1000,
      k: c.kPos,
      n: c.n,
      excess: Math.round(c.posSum),
      band: 3,
      value: Math.round(c.meanValue),
      streak: longestPosRun(c.obs),
    });
  }

  /* ---- Step 5: bands ---- */
  const all = [...scores.values()].map((s) => s.rs).sort((a, b) => a - b);
  const critical = quantile(all, 1 - CRITICAL_TOP);
  const rest = all.filter((x) => x < critical);
  const high = quantile(rest, 0.75);
  const elevated = quantile(rest, 0.5);
  for (const s of scores.values()) {
    s.band = s.rs >= critical && s.rs > 0 ? 0 : s.rs >= high && s.rs > 0 ? 1 : s.rs >= elevated && s.rs > 0 ? 2 : 3;
  }

  /* ---- descriptive partner indicator ---- */
  // Value-weighted mean log gap ln(X/M) across the partner's matched cell-years:
  // positive means that partner's books run above Uzbekistan's across its whole
  // product range. Purely descriptive — no model behind it.
  const perPartner = new Map<string, { wLogGap: number; wSum: number; cells: number }>();
  for (const c of cellList) {
    const e = perPartner.get(c.p) ?? { wLogGap: 0, wSum: 0, cells: 0 };
    e.wLogGap += c.wLogGap; e.wSum += c.wSum; e.cells++;
    perPartner.set(c.p, e);
  }
  const partnerGap = [...perPartner.entries()]
    .map(([iso, e]) => ({ iso, u: Math.round((e.wSum > 0 ? e.wLogGap / e.wSum : 0) * 10000) / 10000, cells: e.cells }))
    .sort((a, b) => b.u - a.u);

  const gArr: number[] = [], pArr: number[] = [];
  for (const s of scores.values()) if (s.rs > 0) { gArr.push(s.g); pArr.push(s.p); }

  const ratesAsc = scoped.map((c) => c.gapRate).sort((a, b) => a - b);

  return {
    level,
    scores,
    partnerGap,
    corGP: pearson(gArr, pArr),
    gapRateQuantiles: {
      p50: Math.round(quantile(ratesAsc, 0.5) * 1000) / 1000,
      p90: Math.round(quantile(ratesAsc, 0.9) * 1000) / 1000,
      p99: Math.round(quantile(ratesAsc, 0.99) * 1000) / 1000,
    },
    coverage: {
      matchedCellYears,
      matchedCells: cellList.length,
      orphanImportCellYears: orphanImport,
      lostExportCellYears: lostExport,
      inScopeCells: scoped.length,
      inScopeCellYears: cellList.reduce((s, c) => s + c.kPos, 0),
      valueRetainedShare: totalValue > 0 ? matchedValue / totalValue : 0,
      belowFloor: cellList.filter((c) => c.meanValue < MATERIALITY_FLOOR).length,
    },
    bandCuts: { critical, high, elevated },
  };
}

/* ------------------------------------------------------------------ */
/* Run                                                                 */
/* ------------------------------------------------------------------ */

const LEVELS = [2, 4, 6] as const;
const results = LEVELS.map(runLevel);

const cellOut: Record<string, [number, number, number, number, number, number, number, number]> = {};
for (const r of results) {
  for (const [kk, s] of r.scores) {
    cellOut[`${r.level}|${kk}`] = [s.rs, s.g, s.p, s.k, s.n, s.excess, s.band, s.streak];
  }
}

const riskJson = {
  version: METHODOLOGY_VERSION,
  // stamped from the input extract, not the clock, so an unchanged input
  // reproduces a byte-identical file
  generatedAt: meta.generatedAt,
  config: { alpha: ALPHA, beta: BETA, materialityFloor: MATERIALITY_FLOOR, criticalTop: CRITICAL_TOP, freight: K - 1 },
  /** `${level}|${partnerIso}|${code}` → [rs, G, P, k, n, excessGapUsd, band, longestPosStreak] */
  cells: cellOut,
  partnerEffects: Object.fromEntries(results.map((r) => [r.level, r.partnerGap])),
  bandCuts: Object.fromEntries(results.map((r) => [r.level, r.bandCuts])),
};

const headline = results.find((r) => r.level === 6)!;
const diagnosticsJson = {
  version: METHODOLOGY_VERSION,
  generatedAt: riskJson.generatedAt,
  headlineLevel: 6,
  corGP: Object.fromEntries(results.map((r) => [r.level, Math.round(r.corGP * 1000) / 1000])),
  gapRateQuantiles: Object.fromEntries(results.map((r) => [r.level, r.gapRateQuantiles])),
  coverage: Object.fromEntries(results.map((r) => [r.level, r.coverage])),
  bandCuts: Object.fromEntries(results.map((r) => [r.level, {
    critical: Math.round(r.bandCuts.critical * 10) / 10,
    high: Math.round(r.bandCuts.high * 10) / 10,
    elevated: Math.round(r.bandCuts.elevated * 10) / 10,
  }])),
  partnerEffects: headline.partnerGap,
};

fs.writeFileSync(path.join(ROOT, "risk.json"), JSON.stringify(riskJson));
fs.writeFileSync(path.join(ROOT, "diagnostics.json"), JSON.stringify(diagnosticsJson, null, 2));

/* ------------------------------------------------------------------ */
/* Console diagnostics                                                 */
/* ------------------------------------------------------------------ */

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const r of results) {
  console.log(
    `\nHS${r.level}  n=${r.coverage.matchedCellYears} cell-years, ${r.coverage.matchedCells} cells` +
    `  cor(G,P)=${r.corGP.toFixed(3)}` +
    `  gap rate p50/p90/p99 = ${r.gapRateQuantiles.p50}/${r.gapRateQuantiles.p90}/${r.gapRateQuantiles.p99}`,
  );
  console.log(
    `      matched value share ${pct(r.coverage.valueRetainedShare)} · positive-gap cells ${r.coverage.inScopeCells}/${r.coverage.matchedCells}` +
    ` · orphan imports ${r.coverage.orphanImportCellYears} · lost exports ${r.coverage.lostExportCellYears}` +
    ` · below $${(MATERIALITY_FLOOR / 1000).toFixed(0)}K floor ${r.coverage.belowFloor}`,
  );
  console.log(
    `      bands: critical ≥ ${r.bandCuts.critical.toFixed(1)} · high ≥ ${r.bandCuts.high.toFixed(1)} · elevated ≥ ${r.bandCuts.elevated.toFixed(1)}`,
  );
}

console.log("\nHS6 partner mean log gap — 10 highest");
for (const p of headline.partnerGap.slice(0, 10)) console.log(`   ${p.iso} ${p.u.toFixed(3)} (${p.cells} cells)`);

console.log(`\nwrote src/data/risk.json (${Object.keys(cellOut).length} scored cells) and src/data/diagnostics.json`);
