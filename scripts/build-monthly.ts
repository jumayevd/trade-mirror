/**
 * Packs the monthly dataset for the client and reconciles partner metadata.
 *
 * Reads data/raw/monthly-cells.json (written by scripts/extract-monthly.py) and
 * emits src/data/monthly.json in the same columnar layout as cells.json, with
 * the time axis in months: [pIdx, kIdx, monthOffset, pe, ui] where
 * monthOffset = (year − y0) × 12 + (month − 1).
 *
 * The HS6 detail (data/raw/monthly-cells-hs6.json) packs the same way into
 * public/data/monthly-hs6.json — served statically and fetched on demand by
 * src/lib/dataset.ts, because at ~1.9M cells it cannot ride in the bundle.
 *
 * The monthly series runs past the annual window (currently into 2026) and can
 * mention partners the annual books never saw. Any such partner is appended to
 * src/data/meta.json so channel building — which resolves partners through the
 * meta list — keeps every reported dollar; dropping unknown partners would break
 * the 1:1 reconciliation against UN Comtrade.
 *
 * Run via `npm run data:monthly`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { NAME_OVERRIDES, REGION_BY_ISO, TRANSIT_HUBS } from "./config";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "data", "raw", "monthly-cells.json");
const SRC_HS6 = path.join(ROOT, "data", "raw", "monthly-cells-hs6.json");
const OUT = path.join(ROOT, "src", "data", "monthly.json");
const OUT_HS6 = path.join(ROOT, "public", "data", "monthly-hs6.json");
const META = path.join(ROOT, "src", "data", "meta.json");

interface InCell { p: string; k: string; y: number; m: number; pe: number; ui: number }
interface Payload {
  cells: InCell[];
  partnerNames: Record<string, string>;
  monthsByYear: Record<string, number[]>;
}
/** HS6 raw rows are positional to keep the big file lean: [iso, code, year, month, pe, ui]. */
type Hs6Row = [string, string, number, number, number, number];

async function main() {
  const payload: Payload = JSON.parse(await fs.readFile(SRC, "utf8"));
  const y0 = Math.min(...Object.keys(payload.monthsByYear).map(Number));

  const pIdx = new Map<string, number>();
  const kIdx = new Map<string, number>();
  const pList: string[] = [];
  const kList: string[] = [];
  const idOf = (v: string, m: Map<string, number>, list: string[]) => {
    let i = m.get(v);
    if (i === undefined) { i = list.length; m.set(v, i); list.push(v); }
    return i;
  };

  const rows = payload.cells.map((r) => [
    idOf(r.p, pIdx, pList),
    idOf(r.k, kIdx, kList),
    (r.y - y0) * 12 + (r.m - 1),
    r.pe,
    r.ui,
  ]);

  await fs.writeFile(OUT, JSON.stringify({ v: 1, y0, p: pList, k: kList, monthsByYear: payload.monthsByYear, r: rows }));

  // ---- HS6 detail, fetched on demand by the client ----
  const hs6: { cells: Hs6Row[] } = JSON.parse(await fs.readFile(SRC_HS6, "utf8"));
  const pIdx6 = new Map<string, number>();
  const kIdx6 = new Map<string, number>();
  const pList6: string[] = [];
  const kList6: string[] = [];
  const rows6 = hs6.cells.map((r) => [
    idOf(r[0], pIdx6, pList6),
    idOf(r[1], kIdx6, kList6),
    (r[2] - y0) * 12 + (r[3] - 1),
    r[4],
    r[5],
  ]);
  await fs.mkdir(path.dirname(OUT_HS6), { recursive: true });
  await fs.writeFile(OUT_HS6, JSON.stringify({ v: 1, y0, p: pList6, k: kList6, r: rows6 }));

  // ---- partner metadata reconciliation ----
  const meta = JSON.parse(await fs.readFile(META, "utf8"));
  const known = new Set(meta.partners.map((p: { iso3: string }) => p.iso3));
  const missing = [...new Set([...pList, ...pList6])].filter((iso) => !known.has(iso));
  for (const iso of missing) {
    meta.partners.push({
      iso3: iso,
      name: NAME_OVERRIDES[iso] ?? (payload.partnerNames[iso] ?? iso).trim(),
      region: REGION_BY_ISO[iso] ?? "Other",
      code: iso,
      transit: TRANSIT_HUBS.has(iso),
      // monthly-only partner: no annual Comtrade reports inside the yearly window
      coverage: 0,
      reportedYears: [],
      lastReportedYear: 0,
      lapse: false,
      tier: "Low",
    });
  }
  if (missing.length) {
    meta.partners.sort((a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name));
    await fs.writeFile(META, JSON.stringify(meta));
  }

  const stat = await fs.stat(OUT);
  const stat6 = await fs.stat(OUT_HS6);
  console.log(`monthly.json      ${rows.length.toLocaleString()} cells · ${pList.length} partners · ${kList.length} chapters · ${(stat.size / 1e6).toFixed(1)}MB`);
  console.log(`monthly-hs6.json  ${rows6.length.toLocaleString()} cells · ${pList6.length} partners · ${kList6.length} codes · ${(stat6.size / 1e6).toFixed(1)}MB`);
  console.log(`meta.json         +${missing.length} monthly-only partners${missing.length ? `: ${missing.join(", ")}` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
