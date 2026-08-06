/**
 * UN Comtrade Plus API client.
 *
 * - With COMTRADE_API_KEY set -> authenticated endpoint (full pulls, free tier:
 *   100k records/call, 500 calls/day).
 * - Without a key -> public preview endpoint (max 500 rows/call). Good enough to
 *   develop and smoke-test the whole pipeline before the key arrives.
 *
 * Every response is cached on disk (keyed by request params), so re-runs are free
 * and we never burn the daily quota twice on the same query.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { COMTRADE } from "./config";

const ROOT = process.cwd();
export const RAW_DIR = path.join(ROOT, "data", "raw");
const CACHE_DIR = path.join(RAW_DIR, "cache");

const API_KEY = process.env.COMTRADE_API_KEY?.trim() || "";
export const HAS_KEY = API_KEY.length > 0;

/** One Comtrade trade record (only the fields we use). */
export interface TradeRow {
  refYear: number;
  refPeriodId: number; // YYYYMMDD for annual, YYYYMM01 style for monthly
  period: string;
  reporterCode: string;
  reporterISO: string;
  reporterDesc: string;
  flowCode: string; // M | X
  partnerCode: string;
  partnerISO: string;
  partnerDesc: string;
  cmdCode: string;
  cmdDesc: string;
  aggrLevel: number;
  primaryValue: number; // trade value, USD
  netWgt: number;
  qty: number;
  qtyUnitAbbr: string;
}

export interface TradeQuery {
  freq: "A" | "M";
  reporterCode: string;
  partnerCode: string; // single code or comma list
  flowCode: string; // "M", "X", or "M,X"
  periods: (string | number)[];
  cmdCode: string; // "TOTAL", single, or comma list
  /** Friendly label for logs / cache filename. */
  label?: string;
}

let callCount = 0;
let lastCallAt = 0;
const MIN_GAP_MS = 350; // be polite; well under any rate ceiling
const MAX_CALLS_PER_RUN = 480; // safety margin under the 500/day free cap

export function getCallCount() {
  return callCount;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function cacheKey(q: TradeQuery): string {
  const norm = {
    e: HAS_KEY ? "auth" : "preview",
    f: q.freq,
    r: q.reporterCode,
    p: q.partnerCode,
    fl: q.flowCode,
    per: [...q.periods].sort().join(","),
    c: q.cmdCode,
  };
  const hash = createHash("sha1").update(JSON.stringify(norm)).digest("hex").slice(0, 12);
  const slug = (q.label ?? `${q.reporterCode}-${q.partnerCode}-${q.flowCode}`)
    .replace(/[^a-z0-9]+/gi, "-")
    .slice(0, 48);
  return `${slug}.${hash}.json`;
}

interface ComtradeResponse {
  count?: number;
  data?: Record<string, unknown>[];
  statusCode?: number;
  message?: string;
}

function buildUrl(q: TradeQuery, countOnly: boolean): string {
  const base = HAS_KEY ? COMTRADE.authBase : COMTRADE.previewBase;
  const url = new URL(`${base}/${COMTRADE.typeCode}/${q.freq}/${COMTRADE.clCode}`);
  const p = url.searchParams;
  p.set("reporterCode", q.reporterCode);
  p.set("partnerCode", q.partnerCode);
  p.set("partner2Code", "0");
  p.set("flowCode", q.flowCode);
  p.set("period", q.periods.join(","));
  if (q.cmdCode) p.set("cmdCode", q.cmdCode); // empty = ALL commodity codes at every HS level
  p.set("includeDesc", "true");
  p.set("maxRecords", String(COMTRADE.maxRecordsPerCall));
  p.set("format", "json");
  if (countOnly) p.set("countOnly", "true");
  return url.toString();
}

function toNum(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(r: Record<string, unknown>): TradeRow {
  return {
    refYear: toNum(r.refYear),
    refPeriodId: toNum(r.refPeriodId),
    period: String(r.period ?? r.refYear ?? ""),
    reporterCode: String(r.reporterCode ?? ""),
    reporterISO: String(r.reporterISO ?? ""),
    reporterDesc: String(r.reporterDesc ?? ""),
    flowCode: String(r.flowCode ?? ""),
    partnerCode: String(r.partnerCode ?? ""),
    partnerISO: String(r.partnerISO ?? ""),
    partnerDesc: String(r.partnerDesc ?? ""),
    cmdCode: String(r.cmdCode ?? ""),
    cmdDesc: String(r.cmdDesc ?? ""),
    aggrLevel: toNum(r.aggrLevel),
    primaryValue: toNum(r.primaryValue),
    netWgt: toNum(r.netWgt),
    qty: toNum(r.qty),
    qtyUnitAbbr: String(r.qtyUnitAbbr ?? ""),
  };
}

async function rawRequest(url: string): Promise<ComtradeResponse> {
  // throttle
  const since = Date.now() - lastCallAt;
  if (since < MIN_GAP_MS) await sleep(MIN_GAP_MS - since);

  const headers: Record<string, string> = { Accept: "application/json" };
  if (HAS_KEY) headers["Ocp-Apim-Subscription-Key"] = API_KEY;

  const maxAttempts = 4;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      lastCallAt = Date.now();
      callCount++;
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status >= 500) {
        const wait = 1500 * attempt;
        console.warn(`  ! HTTP ${res.status}; retry ${attempt}/${maxAttempts} in ${wait}ms`);
        await sleep(wait);
        continue;
      }
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      return JSON.parse(text) as ComtradeResponse;
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        const wait = 1500 * attempt;
        console.warn(`  ! ${(err as Error).message}; retry ${attempt}/${maxAttempts} in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw new Error(`Request failed after ${maxAttempts} attempts: ${String(lastErr)}`);
}

/** Probe how many records a query would return, without downloading them. */
export async function probeCount(q: TradeQuery): Promise<number> {
  if (!HAS_KEY) return -1; // countOnly not meaningful on preview
  const json = await rawRequest(buildUrl(q, true));
  return json.count ?? -1;
}

/**
 * Fetch trade rows for a query, with on-disk caching. Returns [] on empty result.
 */
export async function fetchTrade(q: TradeQuery): Promise<TradeRow[]> {
  await ensureDirs();
  const file = path.join(CACHE_DIR, cacheKey(q));

  try {
    const cached = await fs.readFile(file, "utf8");
    return JSON.parse(cached) as TradeRow[];
  } catch {
    /* cache miss */
  }

  if (callCount >= MAX_CALLS_PER_RUN) {
    throw new Error(
      `Reached safety cap of ${MAX_CALLS_PER_RUN} API calls this run. ` +
        `Re-run later (cache is preserved) to continue without exceeding the daily quota.`,
    );
  }

  const json = await rawRequest(buildUrl(q, false));
  const rows = (json.data ?? []).map(normalizeRow);
  await fs.writeFile(file, JSON.stringify(rows));
  return rows;
}

/** Fetch & cache a public reference JSON file (partner areas, reporters). */
export async function fetchReference(url: string, name: string): Promise<Record<string, unknown>[]> {
  await ensureDirs();
  const file = path.join(RAW_DIR, `ref-${name}.json`);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    /* miss */
  }
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Reference fetch failed (${name}): HTTP ${res.status}`);
  const json = (await res.json()) as { results?: Record<string, unknown>[] } | Record<string, unknown>[];
  const arr = Array.isArray(json) ? json : (json.results ?? []);
  await fs.writeFile(file, JSON.stringify(arr));
  return arr;
}
