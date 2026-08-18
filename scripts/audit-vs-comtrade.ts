/**
 * Accuracy audit: the shipped workbook against LIVE UN Comtrade.
 *
 *   npx tsx scripts/audit-vs-comtrade.ts
 *
 * scripts/verify-against-source.ts proves the ENGINE reproduces the workbook.
 * This script tests the link upstream of it — whether the workbook matches what
 * UN Comtrade serves — by querying the API directly:
 *
 *   A  partner-side exports  reporter = partner, flow = X, partner = UZB
 *   B  Uzbek-side imports    reporter = UZB,     flow = M, partner = partner
 *
 * Two things must be pinned or the comparison is meaningless:
 *
 *   customsCode=C00 & motCode=0
 *     Without them the API returns one row per customs procedure and mode of
 *     transport for the SAME aggregate — 21 rows for Germany 2023 — which sum to
 *     four times the true figure. C00/0 selects the single canonical record.
 *
 *   the HS revision
 *     The workbook is on the HS2017 (H5) basis; Comtrade serves 2022+ natively
 *     in HS2022. Chapter (HS2) totals are unaffected because the 2022 splits stay
 *     inside their chapter, so chapters are compared directly. Individual HS6
 *     lines are NOT comparable across the revision boundary (851712 became
 *     851713/851714) and are only checked for years before it.
 *
 * Self-contained: its own fetch and its own on-disk cache, so the production
 * pipeline's client is left untouched. Re-runs cost no quota.
 */
import "dotenv/config";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PARTNERS, UZBEKISTAN } from "./config";

const KEY = process.env.COMTRADE_API_KEY?.trim() ?? "";
if (!KEY) { console.error("COMTRADE_API_KEY missing — cannot audit against the live API."); process.exit(1); }

const CACHE = path.join(process.cwd(), "data", "raw", "audit-cache");
fs.mkdirSync(CACHE, { recursive: true });

interface ApiRow { cmdCode: string; aggrLevel: number; primaryValue: number; refYear: number; period: string }

let calls = 0;
async function api(params: Record<string, string>): Promise<ApiRow[]> {
  const q = new URLSearchParams({
    partner2Code: "0", customsCode: "C00", motCode: "0",
    includeDesc: "false", format: "json", ...params,
  });
  const freq = params.freq ?? "A";
  const url = `https://comtradeapi.un.org/data/v1/get/C/${freq}/HS?${q}`;
  const file = path.join(CACHE, `${createHash("sha1").update(url).digest("hex").slice(0, 16)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  calls++;
  await new Promise((r) => setTimeout(r, 400));
  const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": KEY, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${params.reporterCode}/${params.flowCode}/${params.period}`);
  const body = (await res.json()) as { data?: ApiRow[] };
  const rows = body.data ?? [];
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}

interface SrcCell { p: string; l: number; k: string; y: number; pe: number; ui: number }
const src: SrcCell[] = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data", "raw", "excel-cells.json"), "utf8"),
).cells;

const codeOf = new Map(PARTNERS.map((p) => [p.iso3, p.code]));
const nameOf = new Map(PARTNERS.map((p) => [p.iso3, p.name]));

const book = (iso: string, y: number, side: "pe" | "ui", level: number, code?: string) => {
  let t = 0;
  for (const r of src) {
    if (r.p !== iso || r.y !== y || r.l !== level) continue;
    if (code && r.k !== code) continue;
    t += r[side];
  }
  return t;
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
interface Res { slice: string; book: number; api: number }
const out: Res[] = [];

/** All-commodity total, checked against BOTH workbook layers. */
async function totals(iso: string, years: number[]) {
  const code = codeOf.get(iso);
  if (!code) return;
  for (const [flow, side, rep, par] of [["X", "pe", code, UZBEKISTAN.code], ["M", "ui", UZBEKISTAN.code, code]] as const) {
    const rows = await api({ reporterCode: rep, partnerCode: par, flowCode: flow, period: years.join(","), cmdCode: "TOTAL" });
    for (const y of years) {
      const v = rows.filter((r) => r.refYear === y).reduce((s, r) => s + r.primaryValue, 0);
      out.push({ slice: `${nameOf.get(iso)} ${y} ${flow === "X" ? "partner exports" : "UZB imports"} · TOTAL vs HS2`, book: book(iso, y, side, 2), api: v });
      out.push({ slice: `${nameOf.get(iso)} ${y} ${flow === "X" ? "partner exports" : "UZB imports"} · TOTAL vs HS6`, book: book(iso, y, side, 6), api: v });
    }
  }
}

/** Chapter-level check — valid across the HS revision boundary. */
async function chapters(iso: string, year: number, chs: string[]) {
  const code = codeOf.get(iso);
  if (!code) return;
  const rows = await api({ reporterCode: UZBEKISTAN.code, partnerCode: code, flowCode: "M", period: String(year), cmdCode: chs.join(",") });
  for (const c of chs) {
    const v = rows.filter((r) => r.cmdCode === c).reduce((s, r) => s + r.primaryValue, 0);
    out.push({ slice: `${nameOf.get(iso)} ${year} UZB imports · chapter ${c}`, book: book(iso, year, "ui", 2, c), api: v });
  }
}

/** HS6 lines — only pre-2022, where the workbook's H5 basis matches the native one. */
async function hs6(iso: string, year: number, codes: string[]) {
  const code = codeOf.get(iso);
  if (!code) return;
  const rows = await api({ reporterCode: UZBEKISTAN.code, partnerCode: code, flowCode: "M", period: String(year), cmdCode: codes.join(",") });
  for (const c of codes) {
    const v = rows.filter((r) => r.cmdCode === c).reduce((s, r) => s + r.primaryValue, 0);
    out.push({ slice: `${nameOf.get(iso)} ${year} UZB imports · HS ${c}`, book: book(iso, year, "ui", 6, c), api: v });
  }
}

async function main() {
  console.log("Workbook vs live UN Comtrade — customsCode=C00, motCode=0, native HS\n");

  // large, transit, lapsed, mid-size, small — early / mid / late years
  await totals("CHN", [2017, 2019, 2023]);
  await totals("RUS", [2019, 2022]);
  await totals("ARE", [2023]);
  await totals("DEU", [2021, 2023]);
  await totals("KOR", [2020]);
  await totals("PAK", [2023]);
  await totals("TUR", [2024]);

  // chapters survive the HS2022 splits
  await chapters("CHN", 2023, ["85", "87", "84", "72"]);
  await chapters("TUR", 2023, ["39", "62"]);

  // HS6 only where both sides use the same revision
  await hs6("CHN", 2019, ["851712", "870323", "854140"]);
  await hs6("DEU", 2021, ["300490", "870332"]);

  console.log(`${"slice".padEnd(58)}${"workbook".padStart(17)}${"Comtrade".padStart(17)}  delta`);
  console.log("-".repeat(112));
  let exact = 0, near = 0, big = 0;
  for (const r of out) {
    const d = r.api === 0 ? (r.book === 0 ? 0 : Infinity) : Math.abs(r.book - r.api) / r.api;
    const tag = d === 0 ? "exact" : d < 0.0001 ? "rounding" : d < 0.01 ? `${(d * 100).toFixed(2)}%` : `${(d * 100).toFixed(1)}%  <-- INVESTIGATE`;
    if (d === 0) exact++; else if (d < 0.0001) near++; else big++;
    console.log(`${r.slice.padEnd(58)}${fmt(r.book).padStart(17)}${fmt(r.api).padStart(17)}  ${tag}`);
  }
  console.log("-".repeat(112));
  console.log(`${out.length} slices — ${exact} exact, ${near} within rounding, ${big} above 0.01%`);
  console.log(`live API calls this run: ${calls}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
