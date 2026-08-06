/**
 * Orchestrates the Comtrade pull for the mirror analysis.
 *
 * Two sides of every flow:
 *   1. Uzbekistan AS REPORTER  — what UZB says it imported from / exported to each partner.
 *   2. Partner AS REPORTER     — what each partner says it exported to / imported from UZB.
 *
 * We pull at HS 2-digit (all chapters, both flows) plus FULL HS 6-digit detail for the
 * import mirror (UZB imports / partner exports to UZB) annually, plus monthly TOTALs
 * for recent years. HS6 comes from per-year "all commodities" queries (cmdCode omitted),
 * filtered to aggrLevel 6 above a small value floor to keep the dataset tractable.
 * All rows land in data/raw/trade-rows.json for the analytics step.
 *
 * Run:  npm run data:fetch        (uses COMTRADE_API_KEY from .env; falls back to the
 *                                  public 500-row preview endpoint if no key is set.)
 */
import "dotenv/config"; // must load .env BEFORE comtrade.ts reads process.env (ESM imports are hoisted)
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  ALL_CHAPTERS,
  ANALYSIS_YEARS,
  ANNUAL_YEARS,
  chunk,
  COMTRADE,
  HIGH_RISK_CHAPTERS,
  MONTHLY_YEARS,
  PARTNERS,
  UZBEKISTAN,
  type Partner,
} from "./config";
import {
  fetchReference,
  fetchTrade,
  getCallCount,
  HAS_KEY,
  RAW_DIR,
  type TradeQuery,
  type TradeRow,
} from "./comtrade";

const CAP = COMTRADE.maxRecordsPerCall;

/** Reconcile configured partner codes against Comtrade's live partnerAreas reference. */
async function resolvePartners(): Promise<Partner[]> {
  let ref: Record<string, unknown>[] = [];
  try {
    ref = await fetchReference(COMTRADE.reference.partnerAreas, "partnerAreas");
  } catch (e) {
    console.warn(`! Could not load partnerAreas reference (${(e as Error).message}). Using configured codes as-is.`);
    return PARTNERS;
  }

  const byCode = new Map<string, string>();
  const byIso = new Map<string, string>();
  for (const r of ref) {
    const code = String(r.id ?? r.PartnerCode ?? "");
    const text = String(r.text ?? r.PartnerDesc ?? "");
    const iso = String(r.PartnerCodeIsoAlpha3 ?? r.iso3 ?? "").toUpperCase();
    if (code) byCode.set(code, text);
    if (iso) byIso.set(iso, code);
  }

  return PARTNERS.map((p) => {
    const refName = byCode.get(p.code);
    // Only repair via ISO3 when the configured code is ABSENT from the reference.
    // A name mismatch alone is not grounds for correction: the reference lists both
    // plain M49 codes and Comtrade statistical-area codes (e.g. USA 841 vs 842,
    // France 250 vs 251) and auto-"correcting" once silently zeroed out three majors.
    if (refName) {
      const expect = p.name.toLowerCase().split(/[ (]/)[0];
      if (!refName.toLowerCase().includes(expect)) {
        console.warn(`~ ${p.name}: code ${p.code} maps to "${refName}" in reference (name mismatch); keeping configured code.`);
      }
      return p;
    }
    const isoCode = byIso.get(p.iso3);
    if (isoCode && isoCode !== p.code) {
      console.warn(`~ ${p.name}: code ${p.code} not in reference -> corrected to ${isoCode} (via ISO ${p.iso3}).`);
      return { ...p, code: isoCode };
    }
    console.warn(`~ ${p.name}: code ${p.code} not found in reference; pulling anyway.`);
    return p;
  });
}

/** Fetch with automatic splitting if a response hits the record cap (truncation guard). */
async function fetchSafe(q: TradeQuery, depth = 0): Promise<TradeRow[]> {
  const rows = await fetchTrade(q);
  const truncated = HAS_KEY && rows.length >= CAP * 0.99;
  if (!truncated || depth > 6) {
    if (truncated) console.warn(`  ! ${q.label}: hit record cap and could not split further; data may be partial.`);
    return rows;
  }
  console.warn(`  ! ${q.label}: ${rows.length} rows (cap). Splitting.`);

  // split priority: periods -> flows -> partners/reporters
  if (q.periods.length > 1) {
    const half = Math.ceil(q.periods.length / 2);
    const a = await fetchSafe({ ...q, periods: q.periods.slice(0, half) }, depth + 1);
    const b = await fetchSafe({ ...q, periods: q.periods.slice(half) }, depth + 1);
    return [...a, ...b];
  }
  if (q.flowCode.includes(",")) {
    const out: TradeRow[] = [];
    for (const f of q.flowCode.split(",")) out.push(...(await fetchSafe({ ...q, flowCode: f }, depth + 1)));
    return out;
  }
  const codes = q.reporterCode.includes(",") ? "reporterCode" : q.partnerCode.includes(",") ? "partnerCode" : null;
  if (codes) {
    const list = (q[codes] as string).split(",");
    const out: TradeRow[] = [];
    for (const c of list) out.push(...(await fetchSafe({ ...q, [codes]: c }, depth + 1)));
    return out;
  }
  return rows;
}

function dedupeKey(r: TradeRow): string {
  return `${r.refPeriodId}|${r.reporterCode}|${r.partnerCode}|${r.flowCode}|${r.cmdCode}`;
}

async function main() {
  console.log(`\n=== Trade Mirror — Comtrade fetch ===`);
  console.log(HAS_KEY ? "Mode: AUTHENTICATED (full data)" : "Mode: PREVIEW (no key — capped at 500 rows/call; dev only)\n");

  const partners = await resolvePartners();
  const partnerCsv = partners.map((p) => p.code).join(",");
  const chaptersCsv = ["TOTAL", ...ALL_CHAPTERS].join(",");

  const annualChunks = chunk(ANNUAL_YEARS, COMTRADE.maxPeriodsPerCall);

  // Build the job list. Each job = one Comtrade query.
  const jobs: TradeQuery[] = [];

  for (const yrs of annualChunks) {
    const tag = `${yrs[0]}-${yrs[yrs.length - 1]}`;
    // UZB as reporter, all chapters + TOTAL
    jobs.push({ freq: "A", reporterCode: UZBEKISTAN.code, partnerCode: partnerCsv, flowCode: "M,X", periods: yrs, cmdCode: chaptersCsv, label: `uzb-rep-hs2-${tag}` });
    // Partners as reporters (mirror), all chapters + TOTAL
    jobs.push({ freq: "A", reporterCode: partnerCsv, partnerCode: UZBEKISTAN.code, flowCode: "M,X", periods: yrs, cmdCode: chaptersCsv, label: `ptn-rep-hs2-${tag}` });
  }

  // FULL HS6 detail for the import mirror, one year per call (probe: UZB side ~42k,
  // partner side ~75k records/yr — both under the 100k cap). cmdCode "" = all codes.
  for (const yr of ANALYSIS_YEARS) {
    jobs.push({ freq: "A", reporterCode: UZBEKISTAN.code, partnerCode: partnerCsv, flowCode: "M", periods: [yr], cmdCode: "", label: `uzb-rep-hs6-${yr}` });
    jobs.push({ freq: "A", reporterCode: partnerCsv, partnerCode: UZBEKISTAN.code, flowCode: "X", periods: [yr], cmdCode: "", label: `ptn-rep-hs6-${yr}` });
  }

  // Monthly recent — TOTAL + high-risk 2-digit chapters only (keeps volume sane).
  const monthlyCmd = ["TOTAL", ...HIGH_RISK_CHAPTERS.map((c) => c.chapter)].join(",");
  for (const yr of MONTHLY_YEARS) {
    const months = Array.from({ length: 12 }, (_, i) => `${yr}${String(i + 1).padStart(2, "0")}`);
    jobs.push({ freq: "M", reporterCode: UZBEKISTAN.code, partnerCode: partnerCsv, flowCode: "M,X", periods: months, cmdCode: monthlyCmd, label: `uzb-rep-monthly-${yr}` });
    jobs.push({ freq: "M", reporterCode: partnerCsv, partnerCode: UZBEKISTAN.code, flowCode: "M,X", periods: months, cmdCode: monthlyCmd, label: `ptn-rep-monthly-${yr}` });
  }

  console.log(`Planned ${jobs.length} queries across ${partners.length} partners.\n`);

  const seen = new Set<string>();
  const all: TradeRow[] = [];
  for (const [i, job] of jobs.entries()) {
    process.stdout.write(`[${i + 1}/${jobs.length}] ${job.label} ... `);
    try {
      let rows = await fetchSafe(job);
      // HS6 jobs return every aggregation level — keep only true 6-digit lines above
      // a small value floor (analytics ignores sub-noise cells anyway).
      if (job.label?.includes("hs6")) {
        const floor = job.reporterCode === UZBEKISTAN.code ? 10_000 : 50_000;
        rows = rows.filter((r) => r.cmdCode.length === 6 && r.primaryValue >= floor);
      }
      let added = 0;
      for (const r of rows) {
        const k = dedupeKey(r);
        if (!seen.has(k)) {
          seen.add(k);
          all.push(r);
          added++;
        }
      }
      console.log(`${rows.length} rows (+${added} new)`);
    } catch (e) {
      console.error(`FAILED: ${(e as Error).message}`);
      if ((e as Error).message.includes("safety cap")) break;
    }
  }

  await fs.mkdir(RAW_DIR, { recursive: true });
  const outFile = path.join(RAW_DIR, "trade-rows.json");
  await fs.writeFile(outFile, JSON.stringify(all));

  // also persist the resolved partner list for the analytics step
  await fs.writeFile(path.join(RAW_DIR, "partners.json"), JSON.stringify(partners, null, 2));

  console.log(`\nDone. ${all.length} unique rows -> ${path.relative(process.cwd(), outFile)}`);
  console.log(`API calls this run: ${getCallCount()}`);
  if (!HAS_KEY) {
    console.log(`\nNOTE: preview mode caps each query at 500 rows, so this is a SAMPLE.`);
    console.log(`Set COMTRADE_API_KEY in .env and re-run for the full dataset.`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
