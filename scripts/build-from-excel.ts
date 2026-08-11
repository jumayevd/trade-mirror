/**
 * Builds the shipped dataset from the curated mirror-trade workbook
 * (data/uzbekistan_mirror_trade_hs2017_fixed_2017_2024.xlsx), replacing the
 * partner-limited Comtrade API pull.
 *
 * The workbook is pre-reconciled to HS 2017 (H5) and covers every partner that
 * either side reported, so the dashboard is no longer restricted to a hand-picked
 * partner list. `npm run data:excel` first runs the Python extractor, which flattens
 * the 32 data sheets into data/raw/excel-cells.json (one record per partner × HS
 * level × code × year, both mirror sides merged, missing sides left absent).
 *
 * Everything downstream — expected CIF, the discrepancy, scores — is computed live
 * in src/lib/dataset.ts from what this script emits.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  ANALYSIS_YEARS,
  ANALYSIS_END_YEAR,
  ANALYSIS_START_YEAR,
  CHAPTER_LABELS,
  CIF_BAND,
  HS_SECTIONS,
  categoryFor,
  NAME_OVERRIDES,
  REGION_BY_ISO,
  TRANSIT_HUBS,
  UZBEKISTAN,
} from "./config";

const ROOT = process.cwd();
const RAW = path.join(ROOT, "data", "raw");
const OUT = path.join(ROOT, "src", "data");
const NOISE = 100_000;
/**
 * Dataset-inclusion floor, deliberately far below NOISE.
 *
 * Two different thresholds are at work. NOISE is a MATERIALITY rule: below it a
 * flow is too small to carry a meaningful discrepancy, so src/lib/dataset.ts
 * refuses to pair it. This is a COMPLETENESS rule: it only drops rows that are
 * effectively empty. Using NOISE for both made reported totals miss ~0.12% of
 * Uzbekistan's recorded imports — small in aggregate, but up to a couple of
 * percent for a small partner, which is enough to fail a UN Comtrade check.
 */
const EMIT_FLOOR = 0;
const WINDOW_YEARS = ANALYSIS_YEARS.length;
const K = 1 + CIF_BAND.central;



/**
 * Re-export / transit hubs, extended for the full partner list. Uzbekistan records
 * imports by country of ORIGIN while these economies typically report exports by last
 * consignment, so a mirror gap here can be pure routing rather than misreporting.
 */
const EXTRA_TRANSIT = ["HKG", "NLD", "BEL", "LTU", "LVA", "EST", "PAN"];
const TRANSIT = new Set<string>([...TRANSIT_HUBS, ...EXTRA_TRANSIT]);

interface InCell { p: string; l: number; k: string; y: number; pe: number; ui: number; uw?: number; pw?: number }
interface Payload {
  cells: InCell[];
  partnerNames: Record<string, string>;
  hs6desc: Record<string, string>;
  hs2desc: Record<string, string>;
}

interface YearCell { uzbImp: number; ptnExp: number; uzbWgt: number; ptnWgt: number }
interface Cell { iso: string; cmd: string; byYear: Map<number, YearCell> }
const blankYear = (): YearCell => ({ uzbImp: 0, ptnExp: 0, uzbWgt: 0, ptnWgt: 0 });

function cleanDesc(desc: string): string {
  let d = desc.replace(/^[-–;\s]+/, "").replace(/\s+/g, " ").trim();
  const cut = d.search(/[;(]/);
  if (cut > 24) d = d.slice(0, cut).trim();
  if (d.length > 90) d = `${d.slice(0, 87).trimEnd()}…`;
  return d.charAt(0).toUpperCase() + d.slice(1);
}

async function main() {
  const src = path.join(RAW, "excel-cells.json");
  const payload: Payload = JSON.parse(await fs.readFile(src, "utf8"));
  await fs.mkdir(OUT, { recursive: true });
  console.log(`Loaded ${payload.cells.length.toLocaleString()} workbook records.`);

  // ---- index into partner × commodity cells ----
  const cells = new Map<string, Cell>();
  const uzbReportingYears = new Set<number>();
  for (const r of payload.cells) {
    if (r.y < ANALYSIS_START_YEAR || r.y > ANALYSIS_END_YEAR) continue;
    if (r.l !== 2 && r.l !== 6) continue;
    const key = `${r.p}|${r.k}`;
    let cell = cells.get(key);
    if (!cell) { cell = { iso: r.p, cmd: r.k, byYear: new Map() }; cells.set(key, cell); }
    const y = cell.byYear.get(r.y) ?? blankYear();
    y.ptnExp += r.pe; y.uzbImp += r.ui;
    y.ptnWgt += r.pw ?? 0; y.uzbWgt += r.uw ?? 0;
    cell.byYear.set(r.y, y);
    if (r.ui > NOISE) uzbReportingYears.add(r.y);
  }

  /*
   * NO cross-level synthesis.
   *
   * The workbook's HS2 and HS6 sheets are two separate UN Comtrade aggregations
   * of the same trade, and they do not agree cell by cell: 6,665 partner ×
   * chapter × year cells differ, because a flow booked to a named chapter at HS2
   * can sit under 999999 at HS6 (USA 2019 puts $330M in chapter 88 at HS2 and
   * $365M in chapter 99 at HS6). The grand totals are identical either way.
   *
   * Rolling HS6 up into HS2 to "fill gaps" therefore mixes two bases and matches
   * neither: it inflated residual chapters by $614M. Each level is emitted
   * exactly as its own sheet reports it, so an HS2 view reconciles against a
   * Comtrade HS2 query and an HS6 view against an HS6 query.
   */

  // ---- per-partner reliability, measured from HS2 coverage ----
  type Tier = "High" | "Medium" | "Low";
  const isoSet = new Set<string>();
  for (const c of cells.values()) isoSet.add(c.iso);

  const reportedByIso = new Map<string, Set<number>>();
  for (const cell of cells.values()) {
    if (cell.cmd.length !== 2) continue;
    for (const [yr, y] of cell.byYear) {
      if (y.ptnExp <= NOISE) continue;
      const s = reportedByIso.get(cell.iso) ?? new Set<number>();
      s.add(yr); reportedByIso.set(cell.iso, s);
    }
  }

  const partnerMeta = [...isoSet].map((iso) => {
    const reported = [...(reportedByIso.get(iso) ?? [])].sort();
    const coverage = reported.length / WINDOW_YEARS;
    const last = reported.length ? Math.max(...reported) : 0;
    const lapse = reported.length > 0 && last < ANALYSIS_END_YEAR;
    const tier: Tier = coverage >= 0.8 && !lapse ? "High" : coverage >= 0.5 && !lapse ? "Medium" : "Low";
    const raw = (payload.partnerNames[iso] ?? iso).trim();
    return {
      iso3: iso,
      name: NAME_OVERRIDES[iso] ?? raw,
      region: REGION_BY_ISO[iso] ?? "Other",
      code: iso,
      transit: TRANSIT.has(iso),
      coverage: Math.round(coverage * 100) / 100,
      reportedYears: reported,
      lastReportedYear: last,
      lapse,
      tier,
    };
  });

  // ---- compact records ----
  interface Rec { p: string; k: string; c: string; cat: string; l: number; y: number; pe: number; ui: number; uw?: number; pw?: number }
  const recs: Rec[] = [];
  const keptHs6 = new Set<string>();

  for (const cell of cells.values()) {
    const lvl = cell.cmd.length;
    const chapter = lvl === 2 ? cell.cmd : cell.cmd.slice(0, 2);
    const cat = categoryFor(chapter).key;

    // Every HS6 product ships. A materiality floor here left 25% of recorded
    // imports out of the HS6 view, so a product below the floor showed nothing
    // at all rather than its true figures.
    if (lvl === 6) keptHs6.add(cell.cmd);

    for (const yr of ANALYSIS_YEARS) {
      const y = cell.byYear.get(yr);
      if (!y) continue;
      // Keep the observation when EITHER book reports it. Gating on the partner
      // side alone silently discarded Uzbekistan-only imports, so reported totals
      // could never reconcile against UN Comtrade. One-sided cells are retained
      // here as reported trade and excluded from every discrepancy measure
      // downstream (buildChannels requires both books for a comparison).
      if (y.ptnExp <= EMIT_FLOOR && y.uzbImp <= EMIT_FLOOR) continue;
      const rec: Rec = { p: cell.iso, k: cell.cmd, c: chapter, cat, l: lvl, y: yr, pe: Math.round(y.ptnExp), ui: Math.round(y.uzbImp) };
      if (lvl === 6 && y.uzbWgt > 0 && y.ptnWgt > 0) { rec.uw = Math.round(y.uzbWgt); rec.pw = Math.round(y.ptnWgt); }
      recs.push(rec);
    }
  }

  // ---- derived HS4 layer (truncation from HS6) ----
  const hs4Agg = new Map<string, Map<number, { pe: number; ui: number; uw: number; pw: number }>>();
  const hs4TopChild = new Map<string, { cmd: string; pe: number }>();
  for (const r of recs) {
    if (r.l !== 6) continue;
    const h4 = r.k.slice(0, 4);
    const key = `${r.p}|${h4}`;
    let byY = hs4Agg.get(key);
    if (!byY) { byY = new Map(); hs4Agg.set(key, byY); }
    const e = byY.get(r.y) ?? { pe: 0, ui: 0, uw: 0, pw: 0 };
    e.pe += r.pe; e.ui += r.ui; e.uw += r.uw ?? 0; e.pw += r.pw ?? 0;
    byY.set(r.y, e);
    const top = hs4TopChild.get(h4);
    if (!top || r.pe > top.pe) hs4TopChild.set(h4, { cmd: r.k, pe: r.pe });
  }
  const hs4Codes = new Set<string>();
  /*
   * HS4 is NOT shipped. It is an exact truncation of HS6, so storing it would
   * repeat 161k rows — 28% of the payload — that src/lib/dataset.ts can rebuild
   * in one pass at load. Only the labels are kept here.
   */
  for (const key of hs4Agg.keys()) hs4Codes.add(key.split("|")[1]);
  const hs4labels = Object.fromEntries(
    [...hs4Codes].sort().map((h4) => {
      const top = hs4TopChild.get(h4);
      const childDesc = top ? cleanDesc(payload.hs6desc[top.cmd] ?? "") : "";
      return [h4, childDesc || `HS ${h4}`];
    }),
  );

  // ---- HS6 product profiles ----
  interface ProductPartner { iso3: string; name: string; tier: Tier; ptnExp: number; uzbImp: number; gap: number; transit: boolean }
  const prodAgg = new Map<string, {
    byYear: Map<number, { pe: number; ui: number }>;
    byPartner: Map<string, { pe: number; ui: number }>;
    uw: number; pw: number; uwv: number; pwv: number; uvYears: number;
  }>();
  for (const cell of cells.values()) {
    if (cell.cmd.length !== 6 || !keptHs6.has(cell.cmd)) continue;
    let agg = prodAgg.get(cell.cmd);
    if (!agg) { agg = { byYear: new Map(), byPartner: new Map(), uw: 0, pw: 0, uwv: 0, pwv: 0, uvYears: 0 }; prodAgg.set(cell.cmd, agg); }
    for (const yr of ANALYSIS_YEARS) {
      const y = cell.byYear.get(yr);
      if (!y || y.ptnExp <= NOISE) continue;
      const by = agg.byYear.get(yr) ?? { pe: 0, ui: 0 };
      by.pe += y.ptnExp; by.ui += y.uzbImp; agg.byYear.set(yr, by);
      const bp = agg.byPartner.get(cell.iso) ?? { pe: 0, ui: 0 };
      bp.pe += y.ptnExp; bp.ui += y.uzbImp; agg.byPartner.set(cell.iso, bp);
      if (y.uzbWgt > 0 && y.ptnWgt > 0) { agg.uw += y.uzbWgt; agg.pw += y.ptnWgt; agg.uwv += y.uzbImp; agg.pwv += y.ptnExp; agg.uvYears++; }
    }
  }

  const pmByIso = new Map(partnerMeta.map((p) => [p.iso3, p]));
  const products = [];
  for (const [cmd, agg] of prodAgg) {
    const byYear = ANALYSIS_YEARS.filter((y) => agg.byYear.has(y)).map((y) => {
      const e = agg.byYear.get(y)!;
      return { y, pe: Math.round(e.pe), ui: Math.round(e.ui), gap: Math.round(e.pe * K - e.ui) };
    });
    const ptnExp = byYear.reduce((s, e) => s + e.pe, 0);
    const uzbImp = byYear.reduce((s, e) => s + e.ui, 0);
    const positiveGap = byYear.reduce((s, e) => s + Math.max(0, e.gap), 0);
    if (positiveGap <= NOISE) continue;
    const partnersList: ProductPartner[] = [...agg.byPartner.entries()]
      .map(([iso, e]) => {
        const pm = pmByIso.get(iso)!;
        return { iso3: iso, name: pm.name, tier: pm.tier, transit: pm.transit, ptnExp: Math.round(e.pe), uzbImp: Math.round(e.ui), gap: Math.round(e.pe * K - e.ui) };
      })
      .sort((a, b) => b.gap - a.gap);
    const posSum = partnersList.reduce((s, x) => s + Math.max(0, x.gap), 0) || 1;
    const chapter = cmd.slice(0, 2);
    products.push({
      cmd,
      label: cleanDesc(payload.hs6desc[cmd] ?? `HS ${cmd}`),
      chapter,
      chapterLabel: CHAPTER_LABELS[chapter] ?? cleanDesc(payload.hs2desc[chapter] ?? `HS ${chapter}`),
      category: categoryFor(chapter).key,
      ptnExp, uzbImp,
      gap: Math.round(ptnExp * K - uzbImp),
      positiveGap: Math.round(positiveGap),
      byYear,
      partners: partnersList.slice(0, 10),
      highConfShare: partnersList.reduce((s, x) => s + (x.tier === "High" ? Math.max(0, x.gap) : 0), 0) / posSum,
      transitShare: partnersList.reduce((s, x) => s + (x.transit ? Math.max(0, x.gap) : 0), 0) / posSum,
      uv: agg.uvYears >= 2 && agg.uw > 0 && agg.pw > 0
        ? { uvUzb: agg.uwv / agg.uw, uvPtn: agg.pwv / agg.pw, uvRatio: (agg.uwv / agg.uw) / (agg.pwv / agg.pw), years: agg.uvYears }
        : null,
    });
  }
  products.sort((a, b) => b.positiveGap - a.positiveGap);
  const topProducts = products.slice(0, 150);

  const hs6labels = Object.fromEntries([...keptHs6].sort().map((cmd) => [cmd, cleanDesc(payload.hs6desc[cmd] ?? `HS ${cmd}`)]));

  // ---- one-sided observations that can never enter the mirror comparison ----
  let orphanImportValue = 0, orphanImportCells = 0;
  for (const cell of cells.values()) {
    if (cell.cmd.length !== 2) continue;
    for (const [, y] of cell.byYear) {
      if (y.uzbImp <= NOISE) continue;
      if (y.ptnExp <= NOISE) { orphanImportValue += y.uzbImp; orphanImportCells++; }
    }
  }

  const chapters = [...new Set(recs.filter((r) => r.l === 2).map((r) => r.c))].sort()
    .map((c) => ({ chapter: c, label: CHAPTER_LABELS[c] ?? cleanDesc(payload.hs2desc[c] ?? `HS ${c}`), category: categoryFor(c).key }));

  // chapter -> category for EVERY chapter seen at any level, so the columnar
  // decoder in src/lib/dataset.ts can rebuild `cat` without storing it per row
  const catByChapter: Record<string, string> = {};
  for (const r of recs) catByChapter[r.c] ??= r.cat;

  const activeIsos = new Set(recs.map((r) => r.p));
  const meta = {
    generatedAt: new Date().toISOString(),
    reporter: UZBEKISTAN,
    window: { start: ANALYSIS_START_YEAR, end: ANALYSIS_END_YEAR },
    years: ANALYSIS_YEARS,
    defaultYear: ANALYSIS_END_YEAR,
    cif: CIF_BAND,
    uzbReportingYears: [...uzbReportingYears].sort(),
    partners: partnerMeta.filter((p) => activeIsos.has(p.iso3)).sort((a, b) => a.name.localeCompare(b.name)),
    chapters,
    catByChapter,
    hs4labels,
    hs6labels,
    categories: HS_SECTIONS.map((s) => ({ key: s.key, label: s.label })),
    orphans: { importValue: Math.round(orphanImportValue), importCells: orphanImportCells },
    datasetRows: payload.cells.length,
  };

  await write("meta.json", meta);

  /*
   * Columnar encoding. Dropping the HS6 materiality floor takes the record count
   * from 67k to ~580k; as objects with repeated string keys that is ~50MB, which
   * cannot ship. Partners and codes become dictionary indices and each row is a
   * fixed-order tuple, which holds the complete dataset in a fraction of the size.
   * `chapter` and `category` are derivable from the code, so they are not stored.
   * Decoded back to objects in src/lib/dataset.ts.
   */
  const pIdx = new Map<string, number>();
  const kIdx = new Map<string, number>();
  const pList: string[] = [];
  const kList: string[] = [];
  const idOf = (v: string, m: Map<string, number>, list: string[]) => {
    let i = m.get(v);
    if (i === undefined) { i = list.length; m.set(v, i); list.push(v); }
    return i;
  };
  const rows = recs.map((r) => {
    const row: number[] = [idOf(r.p, pIdx, pList), idOf(r.k, kIdx, kList), r.y - ANALYSIS_START_YEAR, r.pe, r.ui];
    if (r.uw !== undefined && r.pw !== undefined) row.push(r.uw, r.pw);
    return row;
  });
  await write("cells.json", { v: 2, y0: ANALYSIS_START_YEAR, p: pList, k: kList, r: rows });
  await write("monthly.json", []);
  await write("products.json", topProducts);

  const n = (l: number) => recs.filter((r) => r.l === l).length.toLocaleString();
  console.log(`\nOutputs -> src/data/  (window ${ANALYSIS_START_YEAR}–${ANALYSIS_END_YEAR})`);
  console.log(`  meta.json      ${meta.partners.length} partners · ${chapters.length} chapters · ${Object.keys(hs6labels).length} HS6 labelled`);
  console.log(`  cells.json     ${recs.length.toLocaleString()} records (HS2 ${n(2)} · HS4 ${n(4)} · HS6 ${n(6)})`);
  console.log(`  products.json  ${topProducts.length} profiles (of ${products.length} material)`);
  console.log(`  orphan imports ${(orphanImportValue / 1e9).toFixed(1)}B across ${orphanImportCells.toLocaleString()} cell-years`);
}

async function write(name: string, data: unknown) {
  await fs.writeFile(path.join(OUT, name), JSON.stringify(data));
}

main().catch((e) => { console.error(e); process.exit(1); });
