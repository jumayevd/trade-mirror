/**
 * Extend the monthly book with months UN Comtrade published AFTER the workbook
 * snapshot was taken.
 *
 *   COMTRADE_API_KEY=... npx tsx scripts/fetch-monthly-extension.ts
 *   COMTRADE_API_KEY=... npx tsx scripts/fetch-monthly-extension.ts 202607 202608
 *
 * The workbook is a single versioned snapshot (2026-08-10). Two kinds of month
 * reach Comtrade after it:
 *
 *   - one-sided months (found automatically): the book has partner exports
 *     but no recorded imports — Uzbekistan's records for 2026-05 and 2026-06
 *     arrived after the cut. Only Uzbekistan's import side is fetched.
 *   - new months (named on the command line, as YYYYMM): months past the
 *     book's end. BOTH sides are fetched — Uzbekistan's imports from every
 *     partner, and every partner's exports to Uzbekistan — each only where the
 *     book has nothing yet, so a side the workbook already carries is never
 *     doubled.
 *
 * Every query is pinned to customsCode=C00 & motCode=0 & partner2Code=0, the
 * same pinning the audit uses, or every row splits by customs procedure and
 * transport mode. Values are primaryValue — the field the workbook carries
 * (the audit matched it to the dollar). Aggregate areas never enter: World,
 * "Areas, nes", and group reporters such as the EU (EUR), which would count its
 * members twice.
 *
 * Rows are appended to BOTH the raw files data:verify anchors to and the
 * packed artifacts the dashboard reads, so engine and raw stay one population;
 * every fold sums by cell, so appended rows pair with whatever the book holds.
 * A partner new to the book joins its dictionaries, and data:annualize then
 * adds it to meta.json (scripts/reconcile-partners.ts).
 *
 * Idempotent: a side that already has data for a month is never fetched again.
 * Rerun data:annualize (and let the audits run) after this.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

const KEY = process.env.COMTRADE_API_KEY?.trim() ?? "";
if (!KEY) { console.error("COMTRADE_API_KEY missing."); process.exit(1); }

const ROOT = process.cwd();
const UZB = "860";
interface Packed { v: number; y0: number; p: string[]; k: string[]; monthsByYear?: Record<string, number[]>; r: number[][] }

const monthly: Packed = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "monthly.json"), "utf8"));
const detail: Packed = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "data", "monthly-hs6.json"), "utf8"));

/* ---- what the book already holds, per month ---- */
const uiByMonth = new Map<number, number>();
const peByMonth = new Map<number, number>();
const exportersByMonth = new Map<number, Set<number>>(); // partner indices with exports in the month
for (const r of detail.r) {
  uiByMonth.set(r[2], (uiByMonth.get(r[2]) ?? 0) + r[4]);
  peByMonth.set(r[2], (peByMonth.get(r[2]) ?? 0) + r[3]);
  if (r[3] > 0) (exportersByMonth.get(r[2]) ?? exportersByMonth.set(r[2], new Set()).get(r[2])!).add(r[0]);
}
const offOf = (period: string) => (Number(period.slice(0, 4)) - detail.y0) * 12 + Number(period.slice(4)) - 1;
const periodOf = (off: number) => `${detail.y0 + ((off / 12) | 0)}${String((off % 12) + 1).padStart(2, "0")}`;

interface Want { off: number; period: string; imports: boolean; exports: boolean }
const wanted = new Map<number, Want>();
/*
 * One-sided months near the import book's frontier: the trailing months
 * Comtrade received after the snapshot, and interior holes within the last
 * year of the series (2025-11/12 today — unpublished upstream, so the fetch
 * finds nothing until the office releases them, then heals on rerun). The
 * early years are one-sided by HISTORY — Uzbekistan never published monthly
 * records before 2019 — and are not the snapshot's staleness.
 */
let lastUiOff = -1;
for (const [off, ui] of uiByMonth) if (ui > 0 && off > lastUiOff) lastUiOff = off;
for (const [off, pe] of peByMonth) {
  if (pe > 0 && (uiByMonth.get(off) ?? 0) === 0 && off >= lastUiOff - 11) {
    wanted.set(off, { off, period: periodOf(off), imports: true, exports: false });
  }
}
// months named on the command line: both sides
for (const arg of process.argv.slice(2)) {
  if (!/^\d{6}$/.test(arg)) { console.error(`not a YYYYMM period: ${arg}`); process.exit(1); }
  const off = offOf(arg);
  wanted.set(off, { off, period: arg, imports: (uiByMonth.get(off) ?? 0) === 0, exports: true });
}
const plan = [...wanted.values()].sort((a, b) => a.off - b.off);
console.log("months to extend:", plan.map((w) => `${w.period} (${[w.imports && "imports", w.exports && "exports"].filter(Boolean).join(" + ") || "nothing missing"})`).join(", ") || "none");

/* ---- partner mapping and aggregates to keep out ---- */
const areas = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "raw", "ref-partnerAreas.json"), "utf8"));
const isoByCode = new Map<number, string>();
const groupCodes = new Set<number>();
for (const a of areas.results ?? areas) {
  const code = Number(a.PartnerCode ?? a.id);
  if (a.PartnerCodeIsoAlpha3) isoByCode.set(code, String(a.PartnerCodeIsoAlpha3).trim());
  if (a.isGroup) groupCodes.add(code);
}
// the same aggregate pseudo-partners extract-monthly.py drops, plus the EU
const DROP_ISO = new Set(["W00", "_X", "WLD", "NULL", "nan", "", "EUR", "EUN", "EU"]);
const isoOf = (code: number, iso?: string): string | null => {
  if (code === 0 || groupCodes.has(code)) return null;
  const v = (iso ?? isoByCode.get(code) ?? "").trim();
  return v && !DROP_ISO.has(v) ? v : null;
};

async function fetchRows(params: Record<string, string>): Promise<{ iso: string; k: string; v: number }[]> {
  const q = new URLSearchParams({
    flowCode: "M", partner2Code: "0", cmdCode: "AG6", customsCode: "C00", motCode: "0",
    includeDesc: "true", maxRecords: "250000", ...params,
  }).toString();
  let res: Response | null = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      res = await fetch(`https://comtradeapi.un.org/data/v1/get/C/M/HS?${q}`,
        { headers: { "Ocp-Apim-Subscription-Key": KEY, Accept: "application/json" } });
    } catch (e) {
      // transient network drops (ECONNRESET) get the same patience as 429s
      console.log(`${params.period}: ${(e as Error).message.slice(0, 60)}, retrying in 25s (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, 25_000));
      continue;
    }
    if (res.status !== 429) break;
    console.log(`${params.period}: rate limited, waiting 25s (attempt ${attempt + 1})`);
    await new Promise((r) => setTimeout(r, 25_000));
    res = null;
  }
  if (!res || !res.ok) throw new Error(`${params.period}: HTTP ${res?.status}`);
  const j = await res.json();
  if (j.error) throw new Error(`${params.period}: ${JSON.stringify(j.error).slice(0, 200)}`);
  const data: Record<string, unknown>[] = j.data ?? [];
  // a result exactly at a page limit has almost certainly been cut short
  if ([500, 100_000, 250_000].includes(data.length)) throw new Error(`${params.period}: ${data.length} rows — truncated at the API's limit`);
  const out: { iso: string; k: string; v: number }[] = [];
  const side = params.flowCode;
  for (const r of data) {
    // imports: the counterpart is the partner; exports: it is the reporter
    const iso = side === "M"
      ? isoOf(Number(r.partnerCode), r.partnerISO as string | undefined)
      : isoOf(Number(r.reporterCode), r.reporterISO as string | undefined);
    if (!iso) continue;
    const v = Math.round(Number(r.primaryValue ?? 0));
    if (!(v > 0)) continue;
    out.push({ iso, k: String(r.cmdCode).padStart(6, "0"), v });
  }
  return out;
}

async function main() {
  const todo = plan.filter((w) => w.imports || w.exports);
  if (todo.length === 0) { console.log("nothing to extend."); return; }
  const rawPath = path.join(ROOT, "data", "raw", "monthly-cells-hs6.json");
  const raw2Path = path.join(ROOT, "data", "raw", "monthly-cells.json");
  const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));
  const raw2 = JSON.parse(fs.readFileSync(raw2Path, "utf8"));

  const index = (list: string[]) => new Map(list.map((v, i) => [v, i]));
  const pIdx = index(detail.p), kIdx = index(detail.k), pIdx2 = index(monthly.p), kIdx2 = index(monthly.k);
  const idOf = (v: string, m: Map<string, number>, list: string[]) => {
    let i = m.get(v);
    if (i === undefined) { i = list.length; list.push(v); m.set(v, i); }
    return i;
  };
  const newPartners = new Set<string>();
  let added6 = 0, added2 = 0, newCodes = 0;

  for (const w of todo) {
    const y = detail.y0 + ((w.off / 12) | 0);
    const m = (w.off % 12) + 1;
    // (iso|hs6) -> [pe, ui] for this month
    const rows = new Map<string, [number, number]>();
    const add = (iso: string, k: string, pe: number, ui: number) => {
      const key = `${iso}|${k}`;
      const e = rows.get(key) ?? [0, 0];
      e[0] += pe; e[1] += ui;
      rows.set(key, e);
    };
    let impTotal = 0, expTotal = 0, exporters = 0, skippedExporters = 0;
    if (w.imports) {
      for (const r of await fetchRows({ reporterCode: UZB, flowCode: "M", period: w.period })) { add(r.iso, r.k, 0, r.v); impTotal += r.v; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (w.exports) {
      const have = exportersByMonth.get(w.off) ?? new Set<number>();
      const seen = new Set<string>(), skipped = new Set<string>();
      for (const r of await fetchRows({ partnerCode: UZB, flowCode: "X", period: w.period })) {
        // a partner whose exports for the month the book already carries keeps them
        const pi = pIdx.get(r.iso);
        if (pi !== undefined && have.has(pi)) { skipped.add(r.iso); continue; }
        add(r.iso, r.k, r.v, 0); expTotal += r.v; seen.add(r.iso);
      }
      exporters = seen.size; skippedExporters = skipped.size;
      await new Promise((r) => setTimeout(r, 1500));
    }

    // append: HS6 detail + raw, then the chapter layer as the HS6 rows truncated
    const byP2 = new Map<string, [number, number]>();
    for (const [key, [pe, ui]] of rows) {
      const [iso, k] = key.split("|");
      if (!pIdx.has(iso)) newPartners.add(iso);
      const pi = idOf(iso, pIdx, detail.p);
      if (!kIdx.has(k)) newCodes++;
      const ki = idOf(k, kIdx, detail.k);
      detail.r.push([pi, ki, w.off, pe, ui]);
      raw.cells.push([iso, k, y, m, pe, ui]);
      added6++;
      const k2 = `${iso}|${k.slice(0, 2)}`;
      const e = byP2.get(k2) ?? [0, 0];
      e[0] += pe; e[1] += ui;
      byP2.set(k2, e);
    }
    for (const [key, [pe, ui]] of byP2) {
      const [iso, c] = key.split("|");
      monthly.r.push([idOf(iso, pIdx2, monthly.p), idOf(c, kIdx2, monthly.k), w.off, Math.round(pe), Math.round(ui)]);
      raw2.cells.push({ p: iso, k: c, y, m, pe: Math.round(pe), ui: Math.round(ui) });
      added2++;
    }
    // the month now exists in the book
    if (rows.size) for (const mb of [monthly.monthsByYear, raw2.monthsByYear]) {
      if (!mb) continue;
      mb[String(y)] = [...new Set([...(mb[String(y)] ?? []), m])].sort((a, b) => a - b);
    }
    console.log(`${w.period}: imports $${(impTotal / 1e6).toFixed(0)}M` +
      (w.exports ? ` · exports $${(expTotal / 1e6).toFixed(0)}M from ${exporters} partners` +
        (skippedExporters ? ` (${skippedExporters} already in the book, kept)` : "") : ""));
  }

  fs.writeFileSync(path.join(ROOT, "public", "data", "monthly-hs6.json"), JSON.stringify(detail));
  fs.writeFileSync(path.join(ROOT, "src", "data", "monthly.json"), JSON.stringify(monthly));
  fs.writeFileSync(rawPath, JSON.stringify(raw));
  fs.writeFileSync(raw2Path, JSON.stringify(raw2));
  console.log(`appended ${added6} HS6 rows and ${added2} chapter rows; ${newCodes} new HS6 codes` +
    (newPartners.size ? `; partners new to the book: ${[...newPartners].join(", ")}` : ""));
  console.log("now run: npm run data:annualize && npm run data:verify && npm run data:audit:ui");
}
main();
