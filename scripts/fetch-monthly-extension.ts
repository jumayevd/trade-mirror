/**
 * Extend the monthly book with months UN Comtrade published AFTER the workbook
 * snapshot was taken.
 *
 *   COMTRADE_API_KEY=... npx tsx scripts/fetch-monthly-extension.ts
 *
 * The workbook is a single versioned snapshot (2026-08-10); Uzbekistan's own
 * import records for 2026-05 and 2026-06 reached Comtrade after it was cut,
 * so those months sat one-sided — partner exports present, nothing to compare
 * them against. This script finds exactly those months (the current year's
 * months where the packed book has partner exports but zero recorded imports),
 * fetches Uzbekistan's HS6 import records for them from the live API — pinned
 * to customsCode=C00 & motCode=0 & partner2Code=0, the same pinning the audit
 * uses, or every row splits by customs procedure and transport mode — and
 * appends them to BOTH the raw files data:verify anchors to and the packed
 * artifacts the dashboard reads. Engine and raw stay one population; the
 * appended rows carry pe=0 and only add the import side, so every fold (which
 * sums by cell) pairs them with the partner rows already there.
 *
 * Idempotent: months that already have imports are never fetched, so a rerun
 * after the next workbook refresh is a no-op. Rerun data:annualize (and let
 * the audits run) after this.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.COMTRADE_API_KEY?.trim() ?? "";
if (!KEY) { console.error("COMTRADE_API_KEY missing."); process.exit(1); }

const ROOT = process.cwd();
interface Packed { v: number; y0: number; p: string[]; k: string[]; monthsByYear?: Record<string, number[]>; r: number[][] }

const monthly: Packed = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "monthly.json"), "utf8"));
const detail: Packed = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "monthly-hs6.json"), "utf8"));

/* ---- which months need the import side? ---- */
const uiByMonth = new Map<number, number>();
const peByMonth = new Map<number, number>();
for (const r of detail.r) {
  uiByMonth.set(r[2], (uiByMonth.get(r[2]) ?? 0) + r[4]);
  peByMonth.set(r[2], (peByMonth.get(r[2]) ?? 0) + r[3]);
}
/*
 * Only months near the import book's frontier are candidates: the trailing
 * months Comtrade received after the snapshot, and interior holes within the
 * last year of the series (2025-11/12 today — unpublished upstream, so the
 * fetch finds nothing until the office releases them, then heals on rerun).
 * The early years are one-sided by HISTORY — Uzbekistan never published
 * monthly records before 2019 — and are not the snapshot's staleness.
 */
let lastUiOff = -1;
for (const [off, ui] of uiByMonth) if (ui > 0 && off > lastUiOff) lastUiOff = off;
const wanted: { off: number; period: string }[] = [];
for (const [off, pe] of peByMonth) {
  if (pe > 0 && (uiByMonth.get(off) ?? 0) === 0 && off >= lastUiOff - 11) {
    const y = detail.y0 + ((off / 12) | 0);
    const m = (off % 12) + 1;
    wanted.push({ off, period: `${y}${String(m).padStart(2, "0")}` });
  }
}
wanted.sort((a, b) => a.off - b.off);
console.log("one-sided months (partner exports, no recorded imports):", wanted.map((w) => w.period).join(", ") || "none");

/* ---- partner mapping: Comtrade numeric code -> ISO3 -> packed index ---- */
const areas = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", "ref-partnerAreas.json"), "utf8"));
const isoByCode = new Map<number, string>();
for (const a of areas.results ?? areas) if (a.PartnerCodeIsoAlpha3) isoByCode.set(Number(a.PartnerCode ?? a.id), a.PartnerCodeIsoAlpha3);
const pIdx = new Map(detail.p.map((iso, i) => [iso, i]));
const kIdx = new Map(detail.k.map((k, i) => [k, i]));
const pIdx2 = new Map(monthly.p.map((iso, i) => [iso, i]));
const kIdx2 = new Map(monthly.k.map((k, i) => [k, i]));

async function fetchMonth(period: string) {
  const out: { iso: string; k: string; ui: number }[] = [];
  const q = new URLSearchParams({
    // partnerCode omitted = every partner; 'all' is not an accepted value
    reporterCode: "860", period, flowCode: "M", partner2Code: "0",
    cmdCode: "AG6", customsCode: "C00", motCode: "0", includeDesc: "false",
  }).toString();
  let res: Response | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      res = await fetch(`https://comtradeapi.un.org/data/v1/get/C/M/HS?${q}`,
        { headers: { "Ocp-Apim-Subscription-Key": KEY, Accept: "application/json" } });
    } catch (e) {
      // transient network drops (ECONNRESET) get the same patience as 429s
      console.log(`${period}: ${(e as Error).message.slice(0, 60)}, retrying in 25s (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, 25_000));
      continue;
    }
    if (res.status !== 429) break;
    console.log(`${period}: rate limited, waiting 25s (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 25_000));
    res = null;
  }
  if (!res || !res.ok) throw new Error(`${period}: HTTP ${res?.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${period}: ${JSON.stringify(j.error).slice(0, 200)}`);
  for (const r of j.data ?? []) {
    if (Number(r.partnerCode) === 0) continue; // World aggregate row
    const iso = isoByCode.get(Number(r.partnerCode));
    if (!iso) continue;
    const value = Math.round(r.cifvalue ?? r.primaryValue ?? 0);
    if (!(value > 0)) continue;
    const k = String(r.cmdCode).padStart(6, "0");
    out.push({ iso, k, ui: value });
  }
  return out;
}

async function main() {
  if (wanted.length === 0) { console.log("nothing to extend."); return; }
  let added6 = 0, added2 = 0, skippedPartner = 0, skippedCode = 0, total = 0;
  // raw files the verifier anchors to — same rows, flat shape
  const rawPath = path.join(ROOT, "data", "raw", "monthly-cells-hs6.json");
  const raw2Path = path.join(ROOT, "data", "raw", "monthly-cells.json");
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const raw2 = JSON.parse(fs.readFileSync(raw2Path, "utf8"));

  for (const w of wanted) {
    const rows = await fetchMonth(w.period);
    const y = detail.y0 + ((w.off / 12) | 0);
    const m = (w.off % 12) + 1;
    for (const r of rows) {
      total += r.ui;
      const pi = pIdx.get(r.iso);
      if (pi === undefined) { skippedPartner++; continue; }
      let ki = kIdx.get(r.k);
      if (ki === undefined) {
        // a code the workbook never carried joins the dictionary
        ki = detail.k.length; detail.k.push(r.k); kIdx.set(r.k, ki); skippedCode++;
      }
      detail.r.push([pi, ki, w.off, 0, r.ui]);
      raw.cells.push([r.iso, r.k, y, m, 0, r.ui]);
      added6++;
    }
    // chapter layer: same rows truncated to HS2, per partner
    const byP2 = new Map<string, number>();
    for (const r of rows) {
      const pi2 = pIdx2.get(r.iso);
      if (pi2 === undefined) continue;
      byP2.set(`${r.iso}|${r.k.slice(0, 2)}`, (byP2.get(`${r.iso}|${r.k.slice(0, 2)}`) ?? 0) + r.ui);
    }
    for (const [key, ui] of byP2) {
      const [iso, c] = key.split("|");
      const pi2 = pIdx2.get(iso)!;
      let ki2 = kIdx2.get(c);
      if (ki2 === undefined) { ki2 = monthly.k.length; monthly.k.push(c); kIdx2.set(c, ki2); }
      monthly.r.push([pi2, ki2, w.off, 0, Math.round(ui)]);
      raw2.cells.push({ p: iso, k: c, y, m, pe: 0, ui: Math.round(ui) });
      added2++;
    }
    console.log(`${w.period}: ${rows.length} API rows, $${(rows.reduce((s, r) => s + r.ui, 0) / 1e6).toFixed(0)}M imports`);
    await new Promise((r) => setTimeout(r, 800));
  }

  fs.writeFileSync(path.join(ROOT, "public", "data", "monthly-hs6.json"), JSON.stringify(detail));
  fs.writeFileSync(path.join(ROOT, "src", "data", "monthly.json"), JSON.stringify(monthly));
  fs.writeFileSync(rawPath, JSON.stringify(raw));
  fs.writeFileSync(raw2Path, JSON.stringify(raw2));
  console.log(`appended ${added6} HS6 rows and ${added2} chapter rows; ` +
    `${skippedPartner} rows skipped (partner outside the dataset), ${skippedCode} new HS6 codes; ` +
    `total appended imports $${(total / 1e6).toFixed(0)}M (incl. skipped)`);
  console.log("now run: npm run data:annualize && npx tsx scripts/audit-onscreen.ts && npm run data:verify");
}
main();
