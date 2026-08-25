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
 * Two configurations ship, and the reader picks how finely the score is defined:
 * per partner × HS4 heading, or per partner × HS6 line. They are offered rather
 * than resolved because the choice is a real trade-off — HS6 is more specific but
 * most of its groups hold one or two years, which the diagnostics panel shows.
 */

export type ClusterLevel = "hs4" | "hs6";
export type ConfigKey = ClusterLevel;

/** 1 Confirmed, 2 Provisional, 0 not flagged, 3 suppressed singleton. */
export type Tier = 0 | 1 | 2 | 3;

export interface Coefficient { term: string; coef: number; se: number; z: number; p: number }

/**
 * The partner funnel behind the estimated panel. Published so that a count in a
 * rollup can always be traced back to how many partners the extract started with
 * and which stage removed the rest.
 */
export interface Coverage {
  /** Partners appearing anywhere in the extract over the window. */
  inExtract: number;
  /** Partners with at least one cell-year both books reported. */
  matched: number;
  /** …and trade size above the floor. */
  aboveFloor: number;
  /** …and therefore estimated. Nothing is dropped on the size of the gap. */
  positiveGap: number;
}

export interface ConfigMeta {
  cluster: ClusterLevel;
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
  /** Partners and chapters the rollups list — every one of them, not a top slice. */
  partnersScored: number;
  chaptersScored: number;
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
  sh: number[]; g: number[]; x: number[]; t: number[];
}

interface Doc {
  version: string;
  window: [number, number];
  /** Cells enter the panel at this much trade, measured as the mean of both sides. */
  minTradeUsd: number;
  /** Percentile bounds ln|gap| is winsorised at, rather than cells being dropped. */
  winsor: [number, number];
  criticalTop: number;
  z90: number;
  partners: string[];
  codes: string[];
  defaultConfig: ConfigKey;
  coverage: Coverage;
  configs: Record<ConfigKey, {
    meta: ConfigMeta;
    partnerRollup: Omit<PartnerRow, "partner">[];
    chapterRollup: Omit<ChapterRow, "label">[];
    cells: PackedCells;
  }>;
  source: { gravity: string; method: string; tariff: string };
}

const doc = raw as unknown as Doc;

export const ANOMALY_WINDOW = doc.window;
export const ANOMALY_MIN_TRADE = doc.minTradeUsd;
export const ANOMALY_WINSOR = doc.winsor;
export const ANOMALY_BASE_RATE = doc.criticalTop;
export const ANOMALY_SOURCE = doc.source;
export const ANOMALY_COVERAGE = doc.coverage;
export const DEFAULT_CONFIG = doc.defaultConfig;

export const CONFIG_KEYS: ConfigKey[] = ["hs4", "hs6"];

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

/**
 * The score in the unit a reader can hold: how many times larger this group's
 * gaps run than the model expects. The score is a log difference, so e^score is
 * the multiple — 0.69 is "twice as large", 0 is "exactly as expected".
 */
export const asMultiple = (logPoints: number): number => Math.exp(logPoints);

/** Upper end of the 90% interval, the mirror of lo90. */
export const hi90 = (c: Pick<Cluster, "uHat" | "postSd">): number =>
  c.uHat + doc.z90 * c.postSd;
