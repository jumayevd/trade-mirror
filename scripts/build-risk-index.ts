/**
 * Mirror Trade Risk Score (MTRS) v3.0 — build the static risk index.
 *
 *   npx tsx scripts/build-risk-index.ts
 *
 * Reads the mirror cells produced by build-from-excel.ts and writes
 * src/data/risk.json (per-cell scores, consumed by the dashboard) and
 * src/data/diagnostics.json (model diagnostics, shown on /methodology).
 * Nothing here runs in the browser: the dashboard reads finished numbers.
 *
 * Construction, following Gara et al. (2018) and Choi (2019):
 *   0  matched set     both books report the cell-year; one-sided flows are
 *                      bucketed separately and never scored
 *   1  structural fit  d = ln(X) − ln(M) on ln(distance) + chapter and year
 *                      fixed effects + partner and product random intercepts,
 *                      weighted by ln((M+X)/2); residual e is the abnormal part
 *   2  in scope        d > 0 and e > 0; G = percentile rank of the pooled
 *                      residual within the cell's size decile
 *   3  persistence     P = (k + ALPHA) / (n + ALPHA + BETA), k = years the cell
 *                      ranks at or above TAU, n = matched years
 *   4  composite       MTRS = 100 × √(G × P)
 *
 * Value only: there is no quantity or weight term anywhere in this file.
 */
import fs from "node:fs";
import path from "node:path";
import {
  ALPHA, BETA, CAPITALS, CRITICAL_TOP, FILTER_MODE, MATERIALITY_FLOOR, MAX_ITER,
  METHODOLOGY_VERSION, NOISE, STRATA, TASHKENT, TAU, TOL, haversineKm,
} from "./risk-config";

const ROOT = path.join(process.cwd(), "src", "data");

interface Cell { p: string; k: string; c: string; cat: string; l: number; y: number; pe: number; ui: number }
interface MetaFile { generatedAt: string; years: number[]; chapters: { chapter: string; label: string }[] }

const cells: Cell[] = JSON.parse(fs.readFileSync(path.join(ROOT, "cells.json"), "utf8"));
const meta: MetaFile = JSON.parse(fs.readFileSync(path.join(ROOT, "meta.json"), "utf8"));
const chapterLabel = new Map(meta.chapters.map((c) => [c.chapter, c.label]));

/* ------------------------------------------------------------------ */
/* Linear algebra — dense solve of the fixed-effect normal equations   */
/* ------------------------------------------------------------------ */

/** Gaussian elimination with partial pivoting. `A` is row-major n×n, destroyed. */
function solve(A: Float64Array, b: Float64Array, n: number) {
  const x = new Float64Array(n);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r * n + col]) > Math.abs(A[piv * n + col])) piv = r;
    if (piv !== col) {
      for (let c = col; c < n; c++) { const t = A[col * n + c]; A[col * n + c] = A[piv * n + c]; A[piv * n + c] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    const d = A[col * n + col];
    if (Math.abs(d) < 1e-12) continue; // ridge keeps this from happening; skip if it does
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c];
    const d = A[r * n + r];
    x[r] = Math.abs(d) < 1e-12 ? 0 : s / d;
  }
  return x;
}

/**
 * Weighted least squares on a design where every row has at most four non-zero
 * entries (intercept, ln distance, one chapter dummy, one year dummy), so the
 * normal equations are accumulated from indices rather than a dense matrix.
 */
function wls(
  rows: { idx: number[]; val: number[] }[], y: Float64Array, w: Float64Array, ncol: number,
) {
  const A = new Float64Array(ncol * ncol);
  const b = new Float64Array(ncol);
  for (let i = 0; i < rows.length; i++) {
    const { idx, val } = rows[i];
    const wi = w[i], yi = y[i];
    for (let a = 0; a < idx.length; a++) {
      const ia = idx[a], va = val[a];
      b[ia] += wi * va * yi;
      for (let c = 0; c < idx.length; c++) A[ia * ncol + idx[c]] += wi * va * val[c];
    }
  }
  for (let a = 0; a < ncol; a++) A[a * ncol + a] += 1e-8; // guard against exact collinearity
  return solve(A, b, ncol);
}

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
/* Distances                                                           */
/* ------------------------------------------------------------------ */

const distKm = new Map<string, number>();
for (const [iso, ll] of Object.entries(CAPITALS)) {
  distKm.set(iso, haversineKm([TASHKENT.lat, TASHKENT.lon], ll));
}

/* ------------------------------------------------------------------ */
/* Per-level estimation and scoring                                    */
/* ------------------------------------------------------------------ */

interface Obs {
  p: string; k: string; c: string; y: number;
  X: number; M: number; d: number; w: number; val: number; lnDist: number;
}

interface CellScore {
  mtrs: number; g: number; p: number; k: number; n: number; excess: number; band: number; value: number;
}

interface LevelResult {
  level: number;
  scores: Map<string, CellScore>;
  partnerEffects: { iso: string; u: number; cells: number }[];
  chapterEffects: { chapter: string; label: string; effect: number; obs: number }[];
  yearEffects: { year: number; effect: number }[];
  distanceCoef: number;
  r2: number;
  corGP: number;
  variance: { e: number; partner: number; product: number };
  iterations: number;
  converged: boolean;
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
  const obs: Obs[] = [];
  let orphanImport = 0, lostExport = 0, totalValue = 0, matchedValue = 0;
  for (const r of atLevel) {
    const bothSides = r.pe > NOISE && r.ui > NOISE;
    totalValue += (r.pe + r.ui) / 2;
    if (!bothSides) {
      if (r.ui > NOISE) orphanImport++;
      if (r.pe > NOISE) lostExport++;
      continue;
    }
    const dist = distKm.get(r.p);
    if (dist === undefined) continue; // no coordinate: cannot enter the distance term
    const val = (r.pe + r.ui) / 2;
    matchedValue += val;
    obs.push({
      p: r.p, k: r.k, c: r.c, y: r.y,
      X: r.pe, M: r.ui,
      d: Math.log(r.pe) - Math.log(r.ui),
      w: Math.log(val),
      val,
      lnDist: Math.log(dist),
    });
  }

  /* ---- Step 1: structural residual ---- */
  const chapters = [...new Set(obs.map((o) => o.c))].sort();
  const years = [...new Set(obs.map((o) => o.y))].sort((a, b) => a - b);
  const partners = [...new Set(obs.map((o) => o.p))].sort();
  // At HS2 the product code IS the chapter, so a product random intercept would be
  // perfectly collinear with the chapter fixed effects — it is dropped there.
  const codes = level === 2 ? [] : [...new Set(obs.map((o) => o.k))].sort();

  const chapCol = new Map(chapters.map((c, i) => [c, i]));   // 0 = base level, no column
  const yearCol = new Map(years.map((y, i) => [y, i]));
  const pIdx = new Map(partners.map((p, i) => [p, i]));
  const kIdx = new Map(codes.map((k, i) => [k, i]));

  const C_INTERCEPT = 0, C_DIST = 1;
  const C_CHAP = 2;                                  // chapters[1..] occupy C_CHAP …
  const C_YEAR = C_CHAP + Math.max(0, chapters.length - 1);
  const ncol = C_YEAR + Math.max(0, years.length - 1);

  const meanLnDist = obs.reduce((s, o) => s + o.lnDist, 0) / Math.max(obs.length, 1);
  const rows = obs.map((o) => {
    const idx = [C_INTERCEPT, C_DIST];
    const val = [1, o.lnDist - meanLnDist];
    const ci = chapCol.get(o.c)!;
    if (ci > 0) { idx.push(C_CHAP + ci - 1); val.push(1); }
    const yi = yearCol.get(o.y)!;
    if (yi > 0) { idx.push(C_YEAR + yi - 1); val.push(1); }
    return { idx, val };
  });

  const n = obs.length;
  const d = Float64Array.from(obs.map((o) => o.d));
  const w = Float64Array.from(obs.map((o) => o.w));
  const oPartner = obs.map((o) => pIdx.get(o.p)!);
  const oCode = codes.length ? obs.map((o) => kIdx.get(o.k)!) : null;

  const u = new Float64Array(partners.length);
  const v = new Float64Array(Math.max(codes.length, 1));
  const sumWPartner = new Float64Array(partners.length);
  const sumWCode = new Float64Array(Math.max(codes.length, 1));
  for (let i = 0; i < n; i++) {
    sumWPartner[oPartner[i]] += w[i];
    if (oCode) sumWCode[oCode[i]] += w[i];
  }

  const wSum = Array.from(w).reduce((s, x) => s + x, 0);
  const dBar = obs.reduce((s, o, i) => s + w[i] * o.d, 0) / wSum;
  let s2e = obs.reduce((s, o, i) => s + w[i] * (o.d - dBar) ** 2, 0) / n;
  let s2u = s2e / 10;
  let s2v = s2e / 10;

  const target = new Float64Array(n);
  const fitted = new Float64Array(n);
  const resid = new Float64Array(n);
  let beta = new Float64Array(ncol);
  let iterations = 0;
  let converged = false;
  let lastDelta = Infinity;

  for (let it = 0; it < MAX_ITER; it++) {
    iterations = it + 1;
    for (let i = 0; i < n; i++) target[i] = d[i] - u[oPartner[i]] - (oCode ? v[oCode[i]] : 0);
    beta = wls(rows, target, w, ncol);
    for (let i = 0; i < n; i++) {
      const { idx, val } = rows[i];
      let f = 0;
      for (let a = 0; a < idx.length; a++) f += beta[idx[a]] * val[a];
      fitted[i] = f;
    }

    // partner intercepts: posterior mean under the working variance components
    const numP = new Float64Array(partners.length);
    for (let i = 0; i < n; i++) numP[oPartner[i]] += w[i] * (d[i] - fitted[i] - (oCode ? v[oCode[i]] : 0));
    let s2uNew = 0, maxDelta = 0;
    for (let g = 0; g < partners.length; g++) {
      const den = sumWPartner[g] + s2e / s2u;
      const next = numP[g] / den;
      maxDelta = Math.max(maxDelta, Math.abs(next - u[g]));
      u[g] = next;
      s2uNew += next * next + s2e / den; // EM update carries the posterior variance
    }
    s2u = Math.max(s2uNew / partners.length, 1e-8);

    // product intercepts
    if (oCode) {
      const numK = new Float64Array(codes.length);
      for (let i = 0; i < n; i++) numK[oCode[i]] += w[i] * (d[i] - fitted[i] - u[oPartner[i]]);
      let s2vNew = 0;
      for (let g = 0; g < codes.length; g++) {
        const den = sumWCode[g] + s2e / s2v;
        const next = numK[g] / den;
        maxDelta = Math.max(maxDelta, Math.abs(next - v[g]));
        v[g] = next;
        s2vNew += next * next + s2e / den;
      }
      s2v = Math.max(s2vNew / codes.length, 1e-8);
    }

    let rss = 0;
    for (let i = 0; i < n; i++) {
      resid[i] = d[i] - fitted[i] - u[oPartner[i]] - (oCode ? v[oCode[i]] : 0);
      rss += w[i] * resid[i] * resid[i];
    }
    s2e = Math.max(rss / Math.max(n - ncol, 1), 1e-8);

    lastDelta = maxDelta;
    if (maxDelta < TOL) { converged = true; break; }
  }
  if (process.env.RISK_DEBUG) {
    console.log(`   [HS${level}] final Δ=${lastDelta.toExponential(2)} σ²e=${s2e.toFixed(4)} σ²u=${s2u.toFixed(4)} σ²v=${s2v.toFixed(4)} dBar=${dBar.toFixed(4)}`);
  }

  // weighted R², against the weighted mean of d
  let rss = 0, tss = 0;
  for (let i = 0; i < n; i++) { rss += w[i] * resid[i] ** 2; tss += w[i] * (d[i] - dBar) ** 2; }
  const r2 = tss > 0 ? 1 - rss / tss : 0;

  // chapter and year effects, recentred on the weighted mean so they read as
  // deviations from the average chapter / average year rather than from a base level
  const chapRaw = chapters.map((c, i) => (i === 0 ? 0 : beta[C_CHAP + i - 1]));
  const chapObs = new Map<string, number>();
  for (const o of obs) chapObs.set(o.c, (chapObs.get(o.c) ?? 0) + 1);
  const chapWeighted = chapters.reduce((s, c, i) => s + (chapObs.get(c) ?? 0) * chapRaw[i], 0) / Math.max(n, 1);
  const chapterEffects = chapters
    .map((c, i) => ({
      chapter: c,
      label: chapterLabel.get(c) ?? `HS ${c}`,
      effect: chapRaw[i] - chapWeighted,
      obs: chapObs.get(c) ?? 0,
    }))
    .sort((a, b) => a.effect - b.effect);

  const yearRaw = years.map((y, i) => (i === 0 ? 0 : beta[C_YEAR + i - 1]));
  const yearMean = yearRaw.reduce((s, x) => s + x, 0) / Math.max(years.length, 1);
  const yearEffects = years.map((y, i) => ({ year: y, effect: yearRaw[i] - yearMean }));

  /* ---- Step 2: in scope, pooled residual, size decile, G ---- */
  const key = (o: Obs) => `${o.p}|${o.k}`;
  interface CellAcc {
    p: string; k: string; c: string;
    matchedYears: number; value: number;
    inScope: { e: number; val: number; excess: number; y: number }[];
  }
  const byCell = new Map<string, CellAcc>();
  for (let i = 0; i < n; i++) {
    const o = obs[i];
    const kk = key(o);
    let acc = byCell.get(kk);
    if (!acc) { acc = { p: o.p, k: o.k, c: o.c, matchedYears: 0, value: 0, inScope: [] }; byCell.set(kk, acc); }
    acc.matchedYears++;
    acc.value += o.val;
    const scoped = FILTER_MODE === "conservative" ? o.d > 0 && resid[i] > 0 : resid[i] > 0;
    if (scoped) acc.inScope.push({ e: resid[i], val: o.val, excess: Math.max(o.X - o.M, 0), y: o.y });
  }

  const cellList = [...byCell.entries()].map(([kk, a]) => ({
    kk, ...a, meanValue: a.value / a.matchedYears,
  }));

  // size deciles over the cell's mean annual trade value
  const byValue = [...cellList].sort((a, b) => a.meanValue - b.meanValue);
  const decileOf = new Map<string, number>();
  byValue.forEach((cellRow, i) => {
    decileOf.set(cellRow.kk, Math.min(9, Math.floor((i * 10) / Math.max(byValue.length, 1))));
  });
  const stratumOf = (cellRow: { kk: string; c: string }) =>
    STRATA === "decile" ? String(decileOf.get(cellRow.kk)) : `${cellRow.c}|${decileOf.get(cellRow.kk)}`;

  // pooled G: percentile rank of the value-weighted mean residual, within stratum
  const gOf = new Map<string, number>();
  const scoped = cellList.filter((cellRow) => cellRow.inScope.length > 0);
  const groups = new Map<string, typeof scoped>();
  for (const cellRow of scoped) {
    const s = stratumOf(cellRow);
    (groups.get(s) ?? groups.set(s, []).get(s)!).push(cellRow);
  }
  for (const [, rowsIn] of groups) {
    const eBar = rowsIn.map((cellRow) => {
      const wSumIn = cellRow.inScope.reduce((s, x) => s + x.val, 0);
      return wSumIn > 0 ? cellRow.inScope.reduce((s, x) => s + x.val * x.e, 0) / wSumIn : 0;
    });
    const pr = percentileRanks(eBar);
    rowsIn.forEach((cellRow, i) => gOf.set(cellRow.kk, pr[i]));
  }

  /* ---- Step 3: persistence ---- */
  // annual rank of every in-scope cell-year, within (year × size decile)
  const annualKey = (y: number, kk: string) => `${y}|${decileOf.get(kk)}`;
  const annualGroups = new Map<string, { kk: string; y: number; e: number }[]>();
  for (const cellRow of scoped) {
    for (const s of cellRow.inScope) {
      const gk = annualKey(s.y, cellRow.kk);
      (annualGroups.get(gk) ?? annualGroups.set(gk, []).get(gk)!).push({ kk: cellRow.kk, y: s.y, e: s.e });
    }
  }
  const kCount = new Map<string, number>();
  for (const [, rowsIn] of annualGroups) {
    const pr = percentileRanks(rowsIn.map((r) => r.e));
    rowsIn.forEach((r, i) => { if (pr[i] >= TAU) kCount.set(r.kk, (kCount.get(r.kk) ?? 0) + 1); });
  }

  /* ---- Step 4: composite ---- */
  const scores = new Map<string, CellScore>();
  for (const cellRow of cellList) {
    const g = gOf.get(cellRow.kk) ?? 0;
    const kk = kCount.get(cellRow.kk) ?? 0;
    const nn = cellRow.matchedYears;
    const P = (kk + ALPHA) / (nn + ALPHA + BETA);
    const mtrs = 100 * Math.sqrt(g * P);
    scores.set(cellRow.kk, {
      mtrs: Math.round(mtrs * 10) / 10,
      g: Math.round(g * 1000) / 1000,
      p: Math.round(P * 1000) / 1000,
      k: kk,
      n: nn,
      excess: Math.round(cellRow.inScope.reduce((s, x) => s + x.excess, 0)),
      band: 3,
      value: Math.round(cellRow.meanValue),
    });
  }

  /* ---- Step 5: bands ---- */
  const all = [...scores.values()].map((s) => s.mtrs).sort((a, b) => a - b);
  const critical = quantile(all, 1 - CRITICAL_TOP);
  const rest = all.filter((x) => x < critical);
  const high = quantile(rest, 0.75);
  const elevated = quantile(rest, 0.5);
  for (const s of scores.values()) {
    s.band = s.mtrs >= critical && s.mtrs > 0 ? 0 : s.mtrs >= high && s.mtrs > 0 ? 1 : s.mtrs >= elevated && s.mtrs > 0 ? 2 : 3;
  }

  /* ---- reporting ---- */
  const cellsPerPartner = new Map<string, number>();
  for (const cellRow of cellList) cellsPerPartner.set(cellRow.p, (cellsPerPartner.get(cellRow.p) ?? 0) + 1);
  const partnerEffects = partners
    .map((iso, i) => ({ iso, u: Math.round(u[i] * 10000) / 10000, cells: cellsPerPartner.get(iso) ?? 0 }))
    .sort((a, b) => b.u - a.u);

  const gArr: number[] = [], pArr: number[] = [];
  for (const s of scores.values()) if (s.mtrs > 0) { gArr.push(s.g); pArr.push(s.p); }

  return {
    level,
    scores,
    partnerEffects,
    chapterEffects,
    yearEffects,
    distanceCoef: beta[C_DIST],
    r2,
    corGP: pearson(gArr, pArr),
    variance: { e: s2e, partner: s2u, product: level === 2 ? 0 : s2v },
    iterations,
    converged,
    coverage: {
      matchedCellYears: n,
      matchedCells: cellList.length,
      orphanImportCellYears: orphanImport,
      lostExportCellYears: lostExport,
      inScopeCells: scoped.length,
      inScopeCellYears: scoped.reduce((s, c) => s + c.inScope.length, 0),
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
const byLevel = new Map(results.map((r) => [r.level, r]));

const cellOut: Record<string, [number, number, number, number, number, number, number]> = {};
for (const r of results) {
  for (const [kk, s] of r.scores) {
    cellOut[`${r.level}|${kk}`] = [s.mtrs, s.g, s.p, s.k, s.n, s.excess, s.band];
  }
}

const riskJson = {
  version: METHODOLOGY_VERSION,
  // stamped from the input extract, not the clock, so an unchanged input
  // reproduces a byte-identical file
  generatedAt: meta.generatedAt,
  config: { tau: TAU, alpha: ALPHA, beta: BETA, filterMode: FILTER_MODE, materialityFloor: MATERIALITY_FLOOR, criticalTop: CRITICAL_TOP, strata: STRATA },
  /** `${level}|${partnerIso}|${code}` → [mtrs, G, P, k, n, excessGapUsd, band] */
  cells: cellOut,
  partnerEffects: Object.fromEntries(results.map((r) => [r.level, r.partnerEffects])),
  bandCuts: Object.fromEntries(results.map((r) => [r.level, r.bandCuts])),
};

const headline = byLevel.get(6)!;
const diagnosticsJson = {
  version: METHODOLOGY_VERSION,
  generatedAt: riskJson.generatedAt,
  headlineLevel: 6,
  rSquared: Object.fromEntries(results.map((r) => [r.level, Math.round(r.r2 * 1000) / 1000])),
  corGP: Object.fromEntries(results.map((r) => [r.level, Math.round(r.corGP * 1000) / 1000])),
  distanceCoef: Object.fromEntries(results.map((r) => [r.level, Math.round(r.distanceCoef * 1000) / 1000])),
  variance: Object.fromEntries(results.map((r) => [r.level, {
    e: Math.round(r.variance.e * 10000) / 10000,
    partner: Math.round(r.variance.partner * 10000) / 10000,
    product: Math.round(r.variance.product * 10000) / 10000,
  }])),
  convergence: Object.fromEntries(results.map((r) => [r.level, { iterations: r.iterations, converged: r.converged }])),
  coverage: Object.fromEntries(results.map((r) => [r.level, r.coverage])),
  chapterEffects: headline.chapterEffects.map((c) => ({ ...c, effect: Math.round(c.effect * 1000) / 1000 })),
  yearEffects: headline.yearEffects.map((y) => ({ ...y, effect: Math.round(y.effect * 1000) / 1000 })),
  partnerEffects: headline.partnerEffects,
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
    `  R²=${r.r2.toFixed(3)}  cor(G,P)=${r.corGP.toFixed(3)}  ln(dist)=${r.distanceCoef.toFixed(3)}` +
    `  iters=${r.iterations}${r.converged ? "" : " (NOT CONVERGED)"}`,
  );
  console.log(
    `      matched value share ${pct(r.coverage.valueRetainedShare)} · in scope ${r.coverage.inScopeCells}/${r.coverage.matchedCells} cells` +
    ` · orphan imports ${r.coverage.orphanImportCellYears} · lost exports ${r.coverage.lostExportCellYears}` +
    ` · below $${(MATERIALITY_FLOOR / 1000).toFixed(0)}K floor ${r.coverage.belowFloor}`,
  );
  console.log(
    `      bands: critical ≥ ${r.bandCuts.critical.toFixed(1)} · high ≥ ${r.bandCuts.high.toFixed(1)} · elevated ≥ ${r.bandCuts.elevated.toFixed(1)}`,
  );
}

console.log("\nHS6 chapter effects (log points, negative = freight-heavy) — 8 lowest / 8 highest");
const ce = headline.chapterEffects.filter((c) => c.obs >= 20);
for (const c of ce.slice(0, 8)) console.log(`   ${c.chapter} ${c.effect.toFixed(3)}  ${c.label.slice(0, 46)} (n=${c.obs})`);
console.log("   …");
for (const c of ce.slice(-8)) console.log(`   ${c.chapter} ${c.effect.toFixed(3)}  ${c.label.slice(0, 46)} (n=${c.obs})`);

// The published sanity check: bulk chapters should sit clearly below dense ones.
const eff = new Map(headline.chapterEffects.map((c) => [c.chapter, c.effect]));
const HEAVY = ["25", "68", "69", "72", "73"];
const DENSE = ["30", "85", "84", "90"];
const avg = (list: string[]) => {
  const vals = list.map((c) => eff.get(c)).filter((x): x is number => x !== undefined);
  return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : NaN;
};
const heavy = avg(HEAVY), dense = avg(DENSE);
console.log(`\nfreight check — heavy chapters ${heavy.toFixed(3)} vs value-dense ${dense.toFixed(3)}  →  ${heavy < dense ? "OK" : "PATTERN ABSENT"}`);

console.log("\nHS6 year effects");
for (const y of headline.yearEffects) console.log(`   ${y.year} ${y.effect.toFixed(3)}`);

console.log("\nHS6 partner effects (u_p) — 10 highest");
for (const p of headline.partnerEffects.slice(0, 10)) console.log(`   ${p.iso} ${p.u.toFixed(3)} (${p.cells} cells)`);

console.log(`\nwrote src/data/risk.json (${Object.keys(cellOut).length} scored cells) and src/data/diagnostics.json`);
