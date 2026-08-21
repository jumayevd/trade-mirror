import raw from "@/data/anomaly.json";
import { hsFullLabel, hsLabel, partnerName } from "@/lib/dataset";

/**
 * Unexplained Discrepancy Analysis — the precomputed mixed-model output.
 *
 * Built by analysis/step5_export.py following Gara, Giammatteo & Tosti (2018).
 * The regression is fitted offline; nothing here estimates anything. What the
 * dashboard reads are the random intercepts — the systematic part of a cell's
 * discrepancy that distance, weight, product, partner and year do not explain.
 *
 * Four configurations ship, and the reader picks: the cluster the random effect
 * is defined on (partner × HS4 or partner × HS6) and the freight instrument (the
 * fitted flat wedge or the section × weight-class variant). They are offered
 * rather than resolved because the two cluster levels answer to different
 * trade-offs, and the numbers should be able to be compared rather than taken on
 * trust — see the diagnostics panel.
 */

export type ClusterLevel = "hs4" | "hs6";
export type FreightMode = "flat" | "modelc";
export type ConfigKey = `${ClusterLevel}_${FreightMode}`;

/** 1 Confirmed, 2 Provisional, 0 not flagged, 3 suppressed singleton. */
export type Tier = 0 | 1 | 2 | 3;

export interface Coefficient { term: string; coef: number; se: number; z: number; p: number }

export interface ConfigMeta {
  cluster: ClusterLevel;
  freight: FreightMode;
  /** Cell-years entering the regression. */
  observations: number;
  /** Matched cells in the panel before the positive-gap filter. */
  panelCells: number;
  clusters: number;
  gapUsd: number;
  /** 97.5th percentile of û — the flagging threshold. */
  threshold: number;
  /** Share of residual variance in the cluster effects. The honest headline. */
  rho: number;
  varU: number;
  varE: number;
  freightFactorMedian: number;
  freightWedge: number;
  tier1: number;
  tier2: number;
  suppressed: number;
  unexplainedUsd: number;
  singletonShare: number;
  le3Share: number;
  medianSize: number;
  maxSize: number;
  sizeHist: Record<string, number>;
  coefficients: Coefficient[];
  converged: boolean;
}

export interface Cluster {
  iso: string;
  partner: string;
  code: string;
  /** Nomenclature name for the code, localised. */
  label: string;
  /** The full nomenclature line, for the hover. */
  fullLabel: string;
  nObs: number;
  /** û, the empirical Bayes estimate of the cluster's unexplained component. */
  uHat: number;
  /** Lower bound of the 90% posterior interval. */
  lo90: number;
  postSd: number;
  shrinkage: number;
  /** Cumulative freight-adjusted positive gap, USD. */
  gapUsd: number;
  /** exp(fixed part) × (exp(û) − 1), summed over the cluster's years. */
  unexplainedUsd: number;
  tier: Tier;
  firstYear: number;
  lastYear: number;
}

export interface PartnerRow {
  iso: string;
  partner: string;
  clusters: number;
  flagged: number;
  confirmed: number;
  share: number;
  /** One-sided binomial p against the 2.5% base rate the threshold defines. */
  pValue: number;
  gapUsd: number;
  unexplainedUsd: number;
}

export interface ChapterRow {
  hs2: string;
  label: string;
  clusters: number;
  flagged: number;
  confirmed: number;
  share: number;
  gapUsd: number;
  unexplainedUsd: number;
}

interface PackedCells {
  p: number[]; k: number[]; n: number[]; u: number[]; lo: number[]; sd: number[];
  sh: number[]; g: number[]; x: number[]; t: number[]; y0: number[]; y1: number[];
}

interface Doc {
  version: string;
  window: [number, number];
  minGapUsd: number;
  criticalTop: number;
  z90: number;
  partners: string[];
  codes: string[];
  defaultConfig: ConfigKey;
  configs: Record<ConfigKey, {
    meta: ConfigMeta;
    partnerRollup: Omit<PartnerRow, "partner">[];
    chapterRollup: Omit<ChapterRow, "label">[];
    cells: PackedCells;
  }>;
  trend: {
    partners: Record<string, { p: number[]; v: number[] }>;
    chapters: Record<string, { p: number[]; v: number[] }>;
  };
  source: { gravity: string; method: string; tariff: string };
}

const doc = raw as unknown as Doc;

export const ANOMALY_WINDOW = doc.window;
export const ANOMALY_MIN_GAP = doc.minGapUsd;
export const ANOMALY_BASE_RATE = doc.criticalTop;
export const ANOMALY_SOURCE = doc.source;
export const DEFAULT_CONFIG = doc.defaultConfig;

export const CONFIG_KEYS: ConfigKey[] = ["hs4_flat", "hs4_modelc", "hs6_flat", "hs6_modelc"];

export const configKey = (cluster: ClusterLevel, freight: FreightMode): ConfigKey =>
  `${cluster}_${freight}`;

export const metaOf = (key: ConfigKey): ConfigMeta => doc.configs[key].meta;

/** Unpack one configuration's clusters, already ordered by û descending. */
export function clustersOf(key: ConfigKey): Cluster[] {
  const c = doc.configs[key].cells;
  const out: Cluster[] = new Array(c.p.length);
  for (let i = 0; i < c.p.length; i++) {
    const iso = doc.partners[c.p[i]];
    out[i] = {
      iso,
      partner: partnerName(iso),
      code: doc.codes[c.k[i]],
      label: hsLabel(doc.codes[c.k[i]]),
      fullLabel: hsFullLabel(doc.codes[c.k[i]]),
      nObs: c.n[i],
      uHat: c.u[i],
      lo90: c.lo[i],
      postSd: c.sd[i],
      shrinkage: c.sh[i],
      // millions on the wire, dollars in the interface
      gapUsd: c.g[i] * 1e6,
      unexplainedUsd: c.x[i] * 1e6,
      tier: c.t[i] as Tier,
      firstYear: c.y0[i],
      lastYear: c.y1[i],
    };
  }
  return out;
}

export function partnerRollup(key: ConfigKey): PartnerRow[] {
  return doc.configs[key].partnerRollup.map((r) => ({ ...r, partner: partnerName(r.iso) }));
}

export function chapterRollup(key: ConfigKey): ChapterRow[] {
  return doc.configs[key].chapterRollup.map((r) => ({ ...r, label: hsLabel(r.hs2) }));
}

/** Monthly gap series, in USD millions, for the trend panel only. */
export function trendSeries(kind: "partners" | "chapters", key: string) {
  return doc.trend[kind][key] ?? null;
}

export const trendKeys = (kind: "partners" | "chapters"): string[] =>
  Object.keys(doc.trend[kind]);

/** `202403` → `2024-03`, the wire format for a monthly period. */
export const periodLabel = (p: number): string =>
  `${Math.floor(p / 100)}-${String(p % 100).padStart(2, "0")}`;
