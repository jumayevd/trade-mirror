/**
 * Turns raw Comtrade rows into the compact, granular dataset the site aggregates live.
 *
 * SCOPE: import-side mirror screening, 2017–2024 (Uzbekistan began reporting to
 * Comtrade in 2017). Per partner P, commodity C, year Y: UZB import from P (uzbImp)
 * vs P's export to UZB (ptnExp). CIF/FOB-adjusted mirror gap = ptnExp·(1+CIF) − uzbImp;
 * a positive gap is a POTENTIAL under-recording signal — not proof of wrongdoing.
 *
 * Product structure (per the research design): HS2 chapters for sector-level analysis
 * and HS6 products for detailed investigation. No intermediate HS4 layer.
 *
 * We emit only MEASURED quantities (trade values, weights, reporting coverage) — no
 * assumed tax/tariff rates. The freight wedge is the single disclosed parameter.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ANALYSIS_YEARS,
  ANALYSIS_START_YEAR,
  ANALYSIS_END_YEAR,
  CHAPTER_LABELS,
  CIF_BAND,
  HS_SECTIONS,
  categoryFor,
  TRANSIT_HUBS,
  UZBEKISTAN,
  type Partner,
} from "./config";
import type { TradeRow } from "./comtrade";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "src", "data");
const NOISE = 100_000;
const WINDOW_YEARS = ANALYSIS_YEARS.length;
const K = 1 + CIF_BAND.central;

// HS6 materiality floor for the shipped dataset: a (partner × product) channel must
// clear one of these across the window to be included. Sub-material channels exist in
// the raw cache but add bulk without screening value.
const HS6_MIN_PTN = 8_000_000;
const HS6_MIN_GAP = 4_000_000;

interface YearCell { uzbImp: number; ptnExp: number; uzbWgt: number; ptnWgt: number }
interface Cell { partnerCode: string; cmd: string; byYear: Map<number, YearCell> }
const blankYear = (): YearCell => ({ uzbImp: 0, ptnExp: 0, uzbWgt: 0, ptnWgt: 0 });

function cleanDesc(desc: string): string {
  let d = desc.replace(/^[-–;\s]+/, "").replace(/\s+/g, " ").trim();
  // Comtrade descriptions are verbose taxonomy strings — keep the leading clause.
  const cut = d.search(/[;(]/);
  if (cut > 24) d = d.slice(0, cut).trim();
  if (d.length > 90) d = `${d.slice(0, 87).trimEnd()}…`;
  return d.charAt(0).toUpperCase() + d.slice(1);
}

async function main() {
  const rows: TradeRow[] = JSON.parse(await fs.readFile(path.join(RAW, "trade-rows.json"), "utf8"));
  const partners: Partner[] = JSON.parse(await fs.readFile(path.join(RAW, "partners.json"), "utf8"));
  const partnerByCode = new Map(partners.map((p) => [p.code, p]));
  await fs.mkdir(OUT, { recursive: true });
  console.log(`Loaded ${rows.length.toLocaleString()} rows, ${partners.length} partners.`);

  // ---- index annual rows (2017+) into partner×commodity cells (import side) ----
  const cells = new Map<string, Cell>();
  const uzbReportingYears = new Set<number>();
  const hs6Desc = new Map<string, string>();

  for (const r of rows) {
    if (String(r.period).length !== 4) continue;
    if (r.refYear < ANALYSIS_START_YEAR || r.refYear > ANALYSIS_END_YEAR) continue;
    const isUzb = r.reporterCode === UZBEKISTAN.code;
    const partnerCode = isUzb ? r.partnerCode : r.reporterCode;
    if (!partnerByCode.has(partnerCode)) continue;
    const lvl = r.cmdCode === "TOTAL" ? 0 : r.cmdCode.length;
    if (lvl !== 0 && lvl !== 2 && lvl !== 6) continue; // HS2 + HS6 + TOTAL only

    if (lvl === 6 && r.cmdDesc && !hs6Desc.has(r.cmdCode)) hs6Desc.set(r.cmdCode, r.cmdDesc);

    const key = `${partnerCode}|${r.cmdCode}`;
    let cell = cells.get(key);
    if (!cell) { cell = { partnerCode, cmd: r.cmdCode, byYear: new Map() }; cells.set(key, cell); }
    let y = cell.byYear.get(r.refYear);
    if (!y) { y = blankYear(); cell.byYear.set(r.refYear, y); }
    if (isUzb) {
      if (r.flowCode === "M") { uzbReportingYears.add(r.refYear); y.uzbImp += r.primaryValue; y.uzbWgt += r.netWgt; }
    } else if (r.flowCode === "X") {
      y.ptnExp += r.primaryValue; y.ptnWgt += r.netWgt;
    }
  }

  // ---- per-partner reliability (measured coverage) ----
  type Tier = "High" | "Medium" | "Low";
  const partnerMeta = partners.map((p) => {
    const total = cells.get(`${p.code}|TOTAL`);
    const reported: number[] = [];
    if (total) for (const yr of ANALYSIS_YEARS) { const y = total.byYear.get(yr); if (y && y.ptnExp > NOISE) reported.push(yr); }
    const coverage = reported.length / WINDOW_YEARS;
    const last = reported.length ? Math.max(...reported) : 0;
    const lapse = reported.length > 0 && last < ANALYSIS_END_YEAR;
    const tier: Tier = coverage >= 0.8 && !lapse ? "High" : coverage >= 0.5 && !lapse ? "Medium" : "Low";
    return {
      iso3: p.iso3, name: p.name, region: p.region, code: p.code,
      transit: TRANSIT_HUBS.has(p.iso3),
      coverage: Math.round(coverage * 100) / 100, reportedYears: reported, lastReportedYear: last, lapse, tier,
    };
  });
  const tierOf = new Map(partnerMeta.map((p) => [p.code, p.tier]));

  // ---- synthesize HS2 cells for special chapters (98/99) ----
  // Partners report residual codes like 999999 ("commodities not specified") only at
  // 6-digit; the HS2 chapter pull never sees them. Roll HS6 up to a synthetic HS2 cell
  // for any partner × special-chapter that lacks one, so sector totals are complete.
  const synthYears = new Set<string>(); // `${partner}|${chapter}|${year}` cells we created
  for (const cell of [...cells.values()]) {
    if (cell.cmd.length !== 6) continue;
    const chapter = cell.cmd.slice(0, 2);
    if (chapter !== "98" && chapter !== "99") continue;
    const key = `${cell.partnerCode}|${chapter}`;
    let h2 = cells.get(key);
    if (!h2) { h2 = { partnerCode: cell.partnerCode, cmd: chapter, byYear: new Map() }; cells.set(key, h2); }
    for (const [yr, y] of cell.byYear) {
      const yKey = `${key}|${yr}`;
      const existing = h2.byYear.get(yr);
      // a real HS2 row (not one we synthesized) already covers this year — don't double count
      if (existing && !synthYears.has(yKey) && (existing.ptnExp > 0 || existing.uzbImp > 0)) continue;
      synthYears.add(yKey);
      const t = existing ?? blankYear();
      t.uzbImp += y.uzbImp; t.ptnExp += y.ptnExp; t.uzbWgt += y.uzbWgt; t.ptnWgt += y.ptnWgt;
      h2.byYear.set(yr, t);
    }
  }

  // ---- compact cell records ----
  // HS2: every cell-year with a partner reference. HS6: material channels only.
  // uw/pw = net weight (kg) on each side where BOTH are present — powers the
  // value-quantity evidence component and unit-value diagnostics.
  interface Rec { p: string; k: string; c: string; cat: string; l: number; y: number; pe: number; ui: number; uw?: number; pw?: number }
  const recs: Rec[] = [];
  const keptHs6 = new Set<string>();

  for (const cell of cells.values()) {
    if (cell.cmd === "TOTAL") continue;
    const lvl = cell.cmd.length;
    const p = partnerByCode.get(cell.partnerCode)!;
    const chapter = lvl === 2 ? cell.cmd : cell.cmd.slice(0, 2);
    const cat = categoryFor(chapter).key;

    if (lvl === 6) {
      let pe = 0, gap = 0;
      for (const yr of ANALYSIS_YEARS) {
        const y = cell.byYear.get(yr);
        if (!y || y.ptnExp <= NOISE) continue;
        pe += y.ptnExp; gap += y.ptnExp * K - y.uzbImp;
      }
      if (pe < HS6_MIN_PTN && gap < HS6_MIN_GAP) continue;
      keptHs6.add(cell.cmd);
    }

    for (const yr of ANALYSIS_YEARS) {
      const y = cell.byYear.get(yr);
      if (!y || y.ptnExp <= NOISE) continue;
      const rec: Rec = { p: p.iso3, k: cell.cmd, c: chapter, cat, l: lvl, y: yr, pe: Math.round(y.ptnExp), ui: Math.round(y.uzbImp) };
      if (lvl === 6 && y.uzbWgt > 0 && y.ptnWgt > 0) {
        rec.uw = Math.round(y.uzbWgt);
        rec.pw = Math.round(y.ptnWgt);
      }
      recs.push(rec);
    }
  }

  // ---- HS6 product profiles (across partners) ----
  interface ProductPartner { iso3: string; name: string; tier: Tier; ptnExp: number; uzbImp: number; gap: number; transit: boolean }
  interface Product {
    cmd: string; label: string; chapter: string; chapterLabel: string; category: string;
    ptnExp: number; uzbImp: number; gap: number; positiveGap: number;
    byYear: { y: number; pe: number; ui: number; gap: number }[];
    partners: ProductPartner[];
    highConfShare: number; transitShare: number;
    uv: { uvUzb: number; uvPtn: number; uvRatio: number; years: number } | null;
  }
  const prodAgg = new Map<string, { byYear: Map<number, { pe: number; ui: number }>; byPartner: Map<string, { pe: number; ui: number }>; uw: number; pw: number; uwv: number; pwv: number; uvYears: number }>();

  for (const cell of cells.values()) {
    if (cell.cmd.length !== 6 || !keptHs6.has(cell.cmd)) continue;
    const p = partnerByCode.get(cell.partnerCode)!;
    let agg = prodAgg.get(cell.cmd);
    if (!agg) { agg = { byYear: new Map(), byPartner: new Map(), uw: 0, pw: 0, uwv: 0, pwv: 0, uvYears: 0 }; prodAgg.set(cell.cmd, agg); }
    for (const yr of ANALYSIS_YEARS) {
      const y = cell.byYear.get(yr);
      if (!y || y.ptnExp <= NOISE) continue;
      const by = agg.byYear.get(yr) ?? { pe: 0, ui: 0 };
      by.pe += y.ptnExp; by.ui += y.uzbImp; agg.byYear.set(yr, by);
      const bp = agg.byPartner.get(p.iso3) ?? { pe: 0, ui: 0 };
      bp.pe += y.ptnExp; bp.ui += y.uzbImp; agg.byPartner.set(p.iso3, bp);
      if (y.uzbWgt > 0 && y.ptnWgt > 0) { agg.uw += y.uzbWgt; agg.pw += y.ptnWgt; agg.uwv += y.uzbImp; agg.pwv += y.ptnExp; agg.uvYears++; }
    }
  }

  const pmByIso = new Map(partnerMeta.map((p) => [p.iso3, p]));
  const products: Product[] = [];
  for (const [cmd, agg] of prodAgg) {
    const byYear = ANALYSIS_YEARS.filter((y) => agg.byYear.has(y)).map((y) => {
      const e = agg.byYear.get(y)!;
      return { y, pe: Math.round(e.pe), ui: Math.round(e.ui), gap: Math.round(e.pe * K - e.ui) };
    });
    const ptnExp = byYear.reduce((s, e) => s + e.pe, 0);
    const uzbImp = byYear.reduce((s, e) => s + e.ui, 0);
    const gap = ptnExp * K - uzbImp;
    const positiveGap = byYear.reduce((s, e) => s + Math.max(0, e.gap), 0);
    if (positiveGap <= NOISE) continue;
    const partnersList: ProductPartner[] = [...agg.byPartner.entries()]
      .map(([iso, e]) => {
        const pm = pmByIso.get(iso)!;
        return { iso3: iso, name: pm.name, tier: pm.tier, transit: pm.transit, ptnExp: Math.round(e.pe), uzbImp: Math.round(e.ui), gap: Math.round(e.pe * K - e.ui) };
      })
      .sort((a, b) => b.gap - a.gap);
    const posSum = partnersList.reduce((s, x) => s + Math.max(0, x.gap), 0) || 1;
    const highConfShare = partnersList.reduce((s, x) => s + (x.tier === "High" ? Math.max(0, x.gap) : 0), 0) / posSum;
    const transitShare = partnersList.reduce((s, x) => s + (x.transit ? Math.max(0, x.gap) : 0), 0) / posSum;
    const chapter = cmd.slice(0, 2);
    const uv =
      agg.uvYears >= 2 && agg.uw > 0 && agg.pw > 0
        ? { uvUzb: agg.uwv / agg.uw, uvPtn: agg.pwv / agg.pw, uvRatio: agg.uwv / agg.uw / (agg.pwv / agg.pw), years: agg.uvYears }
        : null;
    products.push({
      cmd, label: cleanDesc(hs6Desc.get(cmd) ?? `HS ${cmd}`), chapter,
      chapterLabel: CHAPTER_LABELS[chapter] ?? `HS ${chapter}`, category: categoryFor(chapter).key,
      ptnExp, uzbImp, gap: Math.round(gap), positiveGap: Math.round(positiveGap),
      byYear, partners: partnersList.slice(0, 10), highConfShare, transitShare, uv,
    });
  }
  products.sort((a, b) => b.positiveGap - a.positiveGap);
  const topProducts = products.slice(0, 150);

  // ---- monthly (import side, TOTAL) ----
  const mCells = new Map<string, { ptnExp: number; uzbImp: number }>();
  for (const r of rows) {
    if (String(r.period).length !== 6 || r.cmdCode !== "TOTAL") continue;
    const isUzb = r.reporterCode === UZBEKISTAN.code;
    const partnerCode = isUzb ? r.partnerCode : r.reporterCode;
    if (!partnerByCode.has(partnerCode)) continue;
    const c = mCells.get(r.period) ?? mCells.set(r.period, { ptnExp: 0, uzbImp: 0 }).get(r.period)!;
    if (isUzb && r.flowCode === "M") c.uzbImp += r.primaryValue;
    else if (!isUzb && r.flowCode === "X") c.ptnExp += r.primaryValue;
  }
  const mSorted = [...mCells.entries()].sort();
  const monthly = mSorted.map(([period, c], i) => ({
    period, ptnExp: Math.round(c.ptnExp), uzbImp: Math.round(c.uzbImp), provisional: i >= mSorted.length - 3,
  }));

  // ---- labels for kept HS6 codes ----
  const hs6labels = Object.fromEntries([...keptHs6].sort().map((cmd) => [cmd, cleanDesc(hs6Desc.get(cmd) ?? `HS ${cmd}`)]));

  const chapters = [...new Set(recs.filter((r) => r.l === 2).map((r) => r.c))]
    .sort()
    .map((c) => ({ chapter: c, label: CHAPTER_LABELS[c] ?? `HS ${c}`, category: categoryFor(c).key }));

  const meta = {
    generatedAt: new Date().toISOString(),
    reporter: UZBEKISTAN,
    window: { start: ANALYSIS_START_YEAR, end: ANALYSIS_END_YEAR },
    years: ANALYSIS_YEARS,
    defaultYear: ANALYSIS_END_YEAR,
    cif: CIF_BAND,
    uzbReportingYears: [...uzbReportingYears].sort(),
    partners: partnerMeta.filter((p) => recs.some((r) => r.p === p.iso3)),
    chapters,
    hs6labels,
    categories: HS_SECTIONS.map((s) => ({ key: s.key, label: s.label })),
  };

  await write("meta.json", meta);
  await write("cells.json", recs);
  await write("monthly.json", monthly);
  await write("products.json", topProducts);

  const hs2n = recs.filter((r) => r.l === 2).length;
  const hs6n = recs.filter((r) => r.l === 6).length;
  console.log(`\nOutputs -> src/data/  (window ${ANALYSIS_START_YEAR}–${ANALYSIS_END_YEAR})`);
  console.log(`  meta.json      ${meta.partners.length} partners · ${chapters.length} chapters · ${Object.keys(hs6labels).length} HS6 products labelled`);
  console.log(`  cells.json     ${recs.length.toLocaleString()} records (HS2 ${hs2n.toLocaleString()} · HS6 ${hs6n.toLocaleString()})`);
  console.log(`  products.json  ${topProducts.length} product profiles (of ${products.length} material)`);
  console.log(`  monthly.json   ${monthly.length} months`);
}

async function write(name: string, data: unknown) {
  await fs.writeFile(path.join(OUT, name), JSON.stringify(data));
}

main().catch((e) => { console.error(e); process.exit(1); });
