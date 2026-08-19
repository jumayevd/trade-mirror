/**
 * Quantity & unit-price layer (HS6 only).
 *
 * Built by scripts/extract-quantity.py from the raw UN Comtrade monthly chunks.
 * A row exists only where both books report the same HS6 line, in the same
 * month, for the same partner, in the SAME quantity unit — $/kg against $/unit
 * would not be a comparison, so the unit is part of the join key upstream.
 *
 * ~456k month rows is far past what the main bundle should carry, so the layer
 * ships as public/data/quantity-hs6.json and loads the first time the section is
 * opened, following the same store pattern as the monthly HS6 detail.
 */
import { tCountry, tText } from "@/lib/labels";
import { hsLabel, hs6Label, meta, partnerMetaOf, partnerName as datasetPartnerName, RISK_CONFIG } from "@/lib/dataset";

export interface PackedQuantity {
  v: number;
  y0: number;
  years: number[];
  p: string[];
  k: string[];
  u: string[];
  pn: Record<string, string>;
  kd: Record<string, string>;
  /** [partnerIdx, codeIdx, monthOffset, unitIdx, impValue, impQty, expValue, expQty] */
  r: number[][];
}

export type QuantityBasis = "year" | "month";

/**
 * Freight uplift from the partner's FOB value to a CIF-comparable one, at the
 * dashboard's central scenario. Uzbekistan records imports CIF and partners
 * record exports FOB, so without this the price difference would carry the
 * freight margin before any misinvoicing.
 */
export const QUANTITY_FREIGHT = meta.cif.central;

/**
 * Both sides must clear this over the selected periods. Unit price divides by
 * quantity, so a consignment of a few units or a few grams produces a price in
 * the millions that says nothing about valuation; the same floor the screening
 * engine applies keeps those out of the ranking.
 */
export const QUANTITY_FLOOR = RISK_CONFIG.materialityFloor;

export interface QuantityRow {
  key: string;
  partnerIso: string;
  partner: string;
  cmd: string;
  product: string;
  unit: string;
  impQty: number;
  expQty: number;
  impValue: number;
  expValue: number;
  /** Σ value ÷ Σ quantity over the selected periods — a weighted average, never a mean of ratios. */
  impPrice: number;
  /** Freight-adjusted: (Σ FOB value × (1 + f)) ÷ Σ quantity, so both sides are CIF-comparable. */
  expPrice: number;
  /** Import unit price − export unit price. */
  diff: number;
}

let payload: PackedQuantity | null = null;
let version = 0;
let loading = false;
let failed = false;
const listeners = new Set<() => void>();

export const quantityReady = (): boolean => payload !== null;
export const quantityFailed = (): boolean => failed;
export const quantityVer = (): number => version;

export function subscribeQuantity(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Direct injection for Node verification scripts; the client uses ensureQuantity. */
export function loadQuantity(next: PackedQuantity): void {
  payload = next;
  version++;
  for (const fn of listeners) fn();
}

export function ensureQuantity(): void {
  if (payload || loading || typeof window === "undefined") return;
  loading = true;
  fetch("/data/quantity-hs6.json")
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    })
    .then((j: PackedQuantity) => {
      loading = false;
      loadQuantity(j);
    })
    .catch(() => {
      loading = false;
      failed = true;
      version++;
      for (const fn of listeners) fn();
    });
}

/** Years the layer carries, ascending. Empty until the payload lands. */
export const quantityYears = (): number[] => payload?.years ?? [];

/**
 * Months each year actually carries, measured from the rows rather than assumed.
 * Uzbekistan's import book stops after October 2025 and the chunks reach only
 * April 2026, so a yearly total is not always a full year and the view has to
 * be able to say which ones are short. Cached per payload version — this walks
 * every row.
 */
let coverageCache: { ver: number; map: Map<number, number[]> } | null = null;
export function quantityCoverage(): Map<number, number[]> {
  if (!payload) return new Map();
  if (coverageCache && coverageCache.ver === version) return coverageCache.map;
  const seen = new Map<number, Set<number>>();
  for (const row of payload.r) {
    const y = payload.y0 + Math.floor(row[2] / 12);
    let set = seen.get(y);
    if (!set) { set = new Set<number>(); seen.set(y, set); }
    set.add((row[2] % 12) + 1);
  }
  const map = new Map([...seen].map(([y, set]) => [y, [...set].sort((a, b) => a - b)] as const));
  coverageCache = { ver: version, map: map as Map<number, number[]> };
  return coverageCache.map;
}

/** Months present for the given years — the book has gaps, so this is measured, not assumed. */
export function quantityMonths(years: number[]): number[] {
  if (!payload) return [];
  const want = years.length ? new Set(years) : null;
  const seen = new Set<number>();
  for (const row of payload.r) {
    const y = payload.y0 + Math.floor(row[2] / 12);
    if (want && !want.has(y)) continue;
    seen.add((row[2] % 12) + 1);
  }
  return [...seen].sort((a, b) => a - b);
}

/** Partners carrying at least one matched pair, as picker options. */
export function quantityPartners(): { iso: string; name: string }[] {
  if (!payload) return [];
  return payload.p
    .map((iso) => ({ iso, name: partnerName(iso) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function partnerName(iso: string): string {
  // Partners the annual dataset knows already have a translated name; the chunks
  // reach a few it never carried, so those fall back to the chunk's English name
  // put through the same country dictionary.
  if (partnerMetaOf(iso)) return datasetPartnerName(iso);
  return tCountry(iso, payload?.pn[iso] ?? iso);
}

function productName(cmd: string): string {
  // only HS6 descriptions ship with the chunks, so a 4-digit code resolves
  // through the dashboard's own label table
  if (cmd.length !== 6) {
    const label = hsLabel(cmd);
    return label && label !== `HS ${cmd}` ? label : `HS ${cmd}`;
  }
  // Prefer the dashboard's own translated HS6 label; the chunks reach codes and
  // years the annual workbook never carried, so fall back to their description.
  const label = hs6Label(cmd);
  if (label && label !== `HS ${cmd}`) return label;
  const english = payload?.kd[cmd];
  return english ? tText(english) : `HS ${cmd}`;
}

export type QuantityLevel = 4 | 6;

export interface QuantityQuery {
  basis: QuantityBasis;
  /**
   * HS digits to compare on. The file stores HS6; HS4 folds from it by truncating
   * the code, the same way the annual dataset derives its HS4 layer. A unit price
   * is a ratio, so the finer the code the more one small or oddly-scaled shipment
   * distorts it — pooling the heading before dividing is steadier, at the cost of
   * mixing more goods inside one price.
   */
  level: QuantityLevel;
  years: number[];
  /** Month basis only; empty means every month the years carry. */
  months: number[];
  /** Partner ISO3 filter; empty means every partner. */
  partners: string[];
}

/**
 * Fold the packed rows to one row per partner × HS6 × unit over the selected
 * periods. Value and quantity are summed first and divided once, so a yearly
 * price is weighted by how much actually moved in each month.
 */
export function quantityRows(q: QuantityQuery): QuantityRow[] {
  if (!payload) return [];
  const wantY = q.years.length ? new Set(q.years) : null;
  const wantM = q.basis === "month" && q.months.length ? new Set(q.months) : null;
  const wantP = q.partners.length ? new Set(q.partners) : null;

  const acc = new Map<string, { p: number; cmd: string; u: number; iv: number; iq: number; ev: number; eq: number }>();
  for (const row of payload.r) {
    const [pi, ki, off, ui, iv, iq, ev, eq] = row;
    const year = payload.y0 + Math.floor(off / 12);
    if (wantY && !wantY.has(year)) continue;
    if (wantM && !wantM.has((off % 12) + 1)) continue;
    if (wantP && !wantP.has(payload.p[pi])) continue;
    // the unit stays in the key at every level: $/kg against $/item is no comparison
    const code = q.level === 6 ? payload.k[ki] : payload.k[ki].slice(0, q.level);
    const key = `${pi}|${code}|${ui}`;
    const e = acc.get(key);
    if (e) {
      e.iv += iv; e.iq += iq; e.ev += ev; e.eq += eq;
    } else {
      acc.set(key, { p: pi, cmd: code, u: ui, iv, iq, ev, eq });
    }
  }

  const out: QuantityRow[] = [];
  const K = 1 + QUANTITY_FREIGHT;
  for (const [key, e] of acc) {
    if (e.iq <= 0 || e.eq <= 0) continue;
    // both books must have moved something material over the selection
    if (e.iv < QUANTITY_FLOOR || e.ev < QUANTITY_FLOOR) continue;
    const iso = payload.p[e.p];
    const cmd = e.cmd;
    const impPrice = e.iv / e.iq;
    const expPrice = (e.ev * K) / e.eq;
    out.push({
      key,
      partnerIso: iso,
      partner: partnerName(iso),
      cmd,
      product: productName(cmd),
      unit: payload.u[e.u],
      impQty: e.iq,
      expQty: e.eq,
      impValue: e.iv,
      expValue: e.ev,
      impPrice,
      expPrice,
      diff: impPrice - expPrice,
    });
  }
  return out;
}
