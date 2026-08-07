/**
 * Mirror Trade Dashboard v2 — single calculation source (spec §7).
 *
 * Implements: expected CIF, signed/positive/reverse/absolute discrepancy, bounded
 * asymmetry, positive share, reconciliation stages (observed → comparable → residual),
 * Anomaly Strength (0–100), Evidence Quality (0–100), the classification matrix
 * (Investigate / Verify data first / Monitor / Low priority / Transit-sensitive) and
 * robustness labels. All pages and exports read from aggregate() — one version of the
 * numbers everywhere. Missing partner-years are never treated as zero flows.
 */
import cellsRaw from "@/data/cells.json";
import metaRaw from "@/data/meta.json";
import monthlyRaw from "@/data/monthly.json";
import productsRaw from "@/data/products.json";

export const METHODOLOGY_VERSION = "2.0";

export type Tier = "High" | "Medium" | "Low";
export type Direction = "positive" | "reverse" | "absolute" | "net";
export type ViewMode = "all" | "high" | "core" | "transit";
export type Stage = "comparable" | "residual";
export type SignalClass = "investigate" | "verify" | "monitor" | "low" | "transit";
export type Robustness = "robust" | "freight-sensitive" | "coverage-sensitive" | "insufficient";

interface Cell { p: string; k: string; c: string; cat: string; l: number; y: number; pe: number; ui: number; uw?: number; pw?: number }
export interface PartnerMeta {
  iso3: string; name: string; region: string; code: string; transit: boolean;
  coverage: number; reportedYears: number[]; lastReportedYear: number; lapse: boolean; tier: Tier;
}
export interface Meta {
  generatedAt: string;
  reporter: { code: string; iso3: string; name: string };
  window: { start: number; end: number };
  years: number[];
  defaultYear: number;
  cif: { low: number; central: number; high: number };
  uzbReportingYears: number[];
  partners: PartnerMeta[];
  chapters: { chapter: string; label: string; category: string }[];
  hs4labels: Record<string, string>;
  hs6labels: Record<string, string>;
  categories: { key: string; label: string }[];
  orphans: { importValue: number; importCells: number };
  datasetRows: number;
}
export interface MonthlyPoint { period: string; ptnExp: number; uzbImp: number; provisional: boolean }
export interface ProductPartner { iso3: string; name: string; tier: Tier; transit: boolean; ptnExp: number; uzbImp: number; gap: number }
export interface Product {
  cmd: string; label: string; chapter: string; chapterLabel: string; category: string;
  ptnExp: number; uzbImp: number; gap: number; positiveGap: number;
  byYear: { y: number; pe: number; ui: number; gap: number }[];
  partners: ProductPartner[];
  highConfShare: number; transitShare: number;
  uv: { uvUzb: number; uvPtn: number; uvRatio: number; years: number } | null;
}

const cells = cellsRaw as unknown as Cell[];
export const meta = metaRaw as unknown as Meta;
export const monthly = monthlyRaw as unknown as MonthlyPoint[];
export const products = productsRaw as unknown as Product[];
export const DATA_VERSION = meta.generatedAt.slice(0, 10).replace(/-/g, ".");

const pMeta = new Map(meta.partners.map((p) => [p.iso3, p]));
const chapLabel = new Map(meta.chapters.map((c) => [c.chapter, c.label]));
const catLabel = new Map(meta.categories.map((c) => [c.key, c.label]));
export const partnerName = (iso: string) => pMeta.get(iso)?.name ?? iso;
export const partnerMetaOf = (iso: string) => pMeta.get(iso);
export const categoryLabel = (key: string) => catLabel.get(key) ?? key;
export const hs6Label = (cmd: string) => meta.hs6labels[cmd] ?? `HS ${cmd}`;
/** HS4 is derived from HS6; labels borrow the largest child's description. */
export const hs4Label = (cmd: string) => meta.hs4labels[cmd] ?? `HS ${cmd}`;
export const hsLabel = (cmd: string) =>
  cmd.length === 2 ? (chapLabel.get(cmd) ?? `HS ${cmd}`) : cmd.length === 4 ? hs4Label(cmd) : hs6Label(cmd);
export const productByCmd = (cmd: string) => products.find((p) => p.cmd === cmd);
export const isResidualChapter = (c: string) => c === "98" || c === "99";

// full-window channel history: how many comparable years each (partner × code) has
// across 2017–2024 REGARDLESS of the selected period. Stage and data-sufficiency are
// judged against history — zooming into a single year must not make every channel
// "insufficient" or empty the default Residual view.
const histYears = (() => {
  const m = new Map<string, number>();
  for (const r of cells) {
    const key = `${r.l}|${r.p}|${r.k}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
})();

// partner-level dual-weight availability share (value-weighted, from HS6 cells) —
// used as the weight/quantity evidence component for HS2 channels
const wgtShare = (() => {
  const tot = new Map<string, number>();
  const withW = new Map<string, number>();
  for (const r of cells) {
    if (r.l !== 6) continue;
    tot.set(r.p, (tot.get(r.p) ?? 0) + r.pe);
    if (r.uw && r.pw) withW.set(r.p, (withW.get(r.p) ?? 0) + r.pe);
  }
  const out = new Map<string, number>();
  for (const [iso, t] of tot) out.set(iso, t > 0 ? (withW.get(iso) ?? 0) / t : 0);
  return out;
})();

export const VIEW_LABELS: Record<ViewMode, string> = {
  all: "All data",
  high: "High-quality data",
  core: "Core (excl. transit)",
  transit: "Transit-sensitive only",
};
export const DIRECTION_LABELS: Record<Direction, string> = {
  positive: "Positive (partner > UZB)",
  reverse: "Reverse (UZB > partner)",
  absolute: "Absolute",
  net: "Net (signed)",
};
export const STAGE_LABELS: Record<Stage, string> = {
  comparable: "Comparable",
  residual: "Residual unexplained",
};
export const CLASS_LABELS: Record<SignalClass, { label: string; desc: string }> = {
  investigate: { label: "Investigate", desc: "High anomaly with high-quality data — the strongest open-data signal; a priority for further statistical or customs review." },
  verify: { label: "Verify data first", desc: "High anomaly but weaker data quality — confirm statistical comparability before interpreting." },
  monitor: { label: "Monitor", desc: "Good data quality but the anomaly is not yet strong or persistent." },
  low: { label: "Low priority", desc: "Neither strong nor well-evidenced — do not use for substantive conclusions." },
  transit: { label: "Transit-sensitive", desc: "Involves a re-export/transit hub, where origin-vs-consignment recording can create legitimate discrepancies. Assessed separately from core channels." },
};
export const ROBUSTNESS_LABELS: Record<Robustness, string> = {
  robust: "Robust",
  "freight-sensitive": "Freight-sensitive",
  "coverage-sensitive": "Coverage-sensitive",
  insufficient: "Insufficient data",
};

export interface Filter {
  from: number;
  to: number;
  direction: Direction;
  view: ViewMode;
  stage: Stage;
  cif: number;
  country: string; // "all" | iso3
  hs2: string; // "all" | chapter
  category: string; // "all" | key
  minGap: number; // materiality floor on the direction metric
  signal: "all" | SignalClass;
  robust: "all" | "robust" | "sensitive";
}
export const DEFAULT_FILTER: Filter = {
  from: meta.defaultYear,
  to: meta.defaultYear,
  direction: "positive",
  view: "all",
  stage: "residual",
  cif: meta.cif.central,
  country: "all",
  hs2: "all",
  category: "all",
  minGap: 0,
  signal: "all",
  robust: "all",
};

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const NOISE = 100_000;
const pos = (x: number) => Math.max(0, x);
const sgn = (x: number) => (x > NOISE ? 1 : x < -NOISE ? -1 : 0);

export interface YearRow { y: number; pe: number; ui: number; signed: number; uvOk: boolean }
export interface Channel {
  partner: string; partnerIso: string; region: string; transit: boolean; tier: Tier;
  chapter: string; cmd: string; cmdLabel: string; level: number; category: string;
  years: YearRow[];
  peT: number; uiT: number; expectedT: number;
  signedT: number; posT: number; revT: number; absT: number;
  boundedAsymmetry: number; positiveShare: number;
  comparableYears: number; posYears: number; revYears: number; longestPosStreak: number;
  flipsAcrossFreight: boolean;
  uvYears: number; uvRatio: number | null;
  stage: Stage; robustness: Robustness; flags: string[];
  anomaly: number; evidence: number; risk: number; cls: SignalClass;
  /** ranking value for the active direction */
  primary: number;
  trend: number;
}

function trendOf(series: { y: number; v: number }[]) {
  if (series.length < 2) return 0;
  const n = Math.min(3, Math.floor(series.length / 2) || 1);
  const mean = (a: { v: number }[]) => a.reduce((s, x) => s + x.v, 0) / a.length;
  return mean(series.slice(-n)) - mean(series.slice(0, n));
}

function buildChannels(fc: Cell[], level: number, f: Filter, yearsInRange: number): Channel[] {
  const K = 1 + f.cif;
  const Klo = 1 + meta.cif.low;
  const Khi = 1 + meta.cif.high;
  const groups = new Map<string, Cell[]>();
  for (const r of fc) {
    if (r.l !== level) continue;
    const key = `${r.p}|${r.k}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  const out: Channel[] = [];
  for (const [, rs] of groups) {
    const r0 = rs[0];
    const pm = pMeta.get(r0.p);
    if (!pm) continue;
    rs.sort((a, b) => a.y - b.y);

    const years: YearRow[] = [];
    let peT = 0, uiT = 0, posT = 0, revT = 0, posLo = 0, posHi = 0, revLo = 0, revHi = 0;
    let posYears = 0, revYears = 0, streak = 0, longest = 0, revStreak = 0, longestRev = 0;
    let uvYears = 0, uw = 0, pw = 0, uwv = 0, pwv = 0;
    for (const r of rs) {
      const signed = r.pe * K - r.ui;
      years.push({ y: r.y, pe: r.pe, ui: r.ui, signed, uvOk: !!(r.uw && r.pw) });
      peT += r.pe; uiT += r.ui;
      posT += pos(signed); revT += pos(-signed);
      posLo += pos(r.pe * Klo - r.ui); posHi += pos(r.pe * Khi - r.ui);
      revLo += pos(r.ui - r.pe * Klo); revHi += pos(r.ui - r.pe * Khi);
      if (signed > NOISE) { posYears++; streak++; longest = Math.max(longest, streak); } else streak = 0;
      if (signed < -NOISE) { revYears++; revStreak++; longestRev = Math.max(longestRev, revStreak); } else revStreak = 0;
      if (r.uw && r.pw) { uvYears++; uw += r.uw; pw += r.pw; uwv += r.ui; pwv += r.pe; }
    }
    if (peT <= NOISE && uiT <= NOISE) continue;
    const expectedT = peT * K;
    const signedT = expectedT - uiT;
    const absT = posT + revT;
    const n = years.length;

    const boundedAsymmetry = Math.max(expectedT, uiT) > 0 ? clamp(absT / Math.max(expectedT, uiT)) : 0;
    const positiveShare = expectedT > 0 ? clamp(posT / expectedT) : 0;
    const uvRatio = uvYears >= 2 && uw > 0 && pw > 0 && pwv > 0 ? (uwv / uw) / (pwv / pw) : null;

    // scenario robustness: does the direction-relevant sign hold across 6/10/15%?
    const netSigns = [sgn(peT * Klo - uiT), sgn(signedT), sgn(peT * Khi - uiT)];
    const flipsAcrossFreight = new Set(netSigns.filter((s) => s !== 0)).size > 1 || netSigns.includes(0);

    // flags
    const flags: string[] = [];
    if (pm.transit) flags.push("transit");
    if (isResidualChapter(r0.c)) flags.push("residual-hs");
    if (pm.lapse) flags.push("reporting-stop");
    if (pm.coverage < 0.5) flags.push("sparse-reporter");
    if (uvYears === 0 && level === 6) flags.push("missing-weight");
    if (flipsAcrossFreight) flags.push("freight-sensitive");

    const nHist = histYears.get(`${level}|${r0.p}|${r0.k}`) ?? n; // full-window comparable years
    const robustness: Robustness =
      nHist < 2 ? "insufficient"
        : flipsAcrossFreight ? "freight-sensitive"
          : pm.lapse || pm.coverage < 0.5 ? "coverage-sensitive"
            : "robust";
    const stage: Stage =
      !pm.transit && !isResidualChapter(r0.c) && nHist >= 2 && !flipsAcrossFreight ? "residual" : "comparable";

    // (label resolution handles HS2 / derived HS4 / HS6 uniformly)
    // direction metric
    const primary =
      f.direction === "positive" ? posT
        : f.direction === "reverse" ? revT
          : f.direction === "absolute" ? absT
            : signedT;

    // ---- Anomaly Strength (spec §7.4): 35 magnitude / 25 relative / 20 persistence / 10 dynamics / 10 UV ----
    const dirYears = f.direction === "reverse" ? revYears : posYears;
    const dirSeries = years.map((x) => ({
      y: x.y,
      v: f.direction === "reverse" ? pos(-x.signed) : f.direction === "absolute" ? Math.abs(x.signed) : pos(x.signed),
    }));
    const trend = trendOf(dirSeries);
    const meanYearly = dirSeries.reduce((s, x) => s + x.v, 0) / Math.max(dirSeries.length, 1);
    const mag = clamp((Math.log10(1 + Math.abs(primary)) - 6) / 4);
    const rel = boundedAsymmetry;
    const dirStreak = f.direction === "reverse" ? longestRev : longest;
    const pers = 0.7 * (dirYears / Math.max(n, 3)) + 0.3 * (dirStreak / Math.max(n, 3));
    const dyn = trend > 0 && meanYearly > 0 ? clamp(trend / meanYearly) : 0;
    const uvA = uvRatio == null ? null
      : f.direction === "reverse" ? clamp((uvRatio - 1) / 0.5) : clamp((1 - uvRatio) / 0.5);
    const anomaly = Math.round(10 * 100 * (uvA == null
      ? (0.35 * mag + 0.25 * rel + 0.2 * pers + 0.1 * dyn) / 0.9
      : 0.35 * mag + 0.25 * rel + 0.2 * pers + 0.1 * dyn + 0.1 * uvA)) / 10;

    // ---- Evidence Quality (spec §7.5): 25 coverage / 20 reliability / 15 HS / 15 weight / 10 freight / 10 transit / 5 residual ----
    const covC = clamp(n / Math.max(yearsInRange, 1));
    const relC = clamp(pm.coverage * (pm.lapse ? 0.5 : 1));
    const hsC = isResidualChapter(r0.c) ? 0 : 0.8; // single-revision extract; concordance table pending (P1 data)
    const wqC = level === 6 ? clamp(uvYears / Math.max(n, 1)) : clamp(wgtShare.get(r0.p) ?? 0);
    const frC = flipsAcrossFreight ? 0 : 1;
    const trC = pm.transit ? 0 : 1;
    const rsC = isResidualChapter(r0.c) ? 0 : Math.abs(primary) < 1_000_000 ? 0.5 : 1;
    const evidence = Math.round(10 * 100 * (0.25 * covC + 0.2 * relC + 0.15 * hsC + 0.15 * wqC + 0.1 * frC + 0.1 * trC + 0.05 * rsC)) / 10;

    // ---- classification matrix (§7.6); thresholds documented in Methodology ----
    const cls: SignalClass = pm.transit ? "transit"
      : anomaly >= 55 && evidence >= 60 ? "investigate"
        : anomaly >= 55 ? "verify"
          : evidence >= 60 ? "monitor"
            : "low";

    // ---- composite risk score R = √(A·E) — geometric aggregation limits compensability:
    // R ≤ 10·√E, so weak evidence bounds the score (OECD/JRC 2008) ----
    const risk = Math.round(10 * Math.sqrt(anomaly * evidence)) / 10;

    out.push({
      partner: pm.name, partnerIso: pm.iso3, region: pm.region, transit: pm.transit, tier: pm.tier,
      chapter: r0.c, cmd: r0.k, cmdLabel: hsLabel(r0.k),
      level, category: r0.cat,
      years, peT, uiT, expectedT, signedT, posT, revT, absT,
      boundedAsymmetry, positiveShare,
      comparableYears: n, posYears, revYears, longestPosStreak: longest,
      flipsAcrossFreight, uvYears, uvRatio,
      stage, robustness, flags, anomaly, evidence, risk, cls, primary, trend,
    });
  }
  return out;
}

const CLS_RANK: Record<SignalClass, number> = { investigate: 0, verify: 1, transit: 2, monitor: 3, low: 4 };

function applyChannelFilters(chs: Channel[], f: Filter): Channel[] {
  return chs
    .filter((c) => {
      if (f.stage === "residual" && c.stage !== "residual") return false;
      if (f.signal !== "all" && c.cls !== f.signal) return false;
      if (f.robust === "robust" && c.robustness !== "robust") return false;
      if (f.robust === "sensitive" && c.robustness === "robust") return false;
      if (Math.abs(c.primary) < f.minGap) return false;
      if (f.direction === "positive" && c.posT <= NOISE) return false;
      if (f.direction === "reverse" && c.revT <= NOISE) return false;
      return true;
    })
    .sort((a, b) =>
      CLS_RANK[a.cls] - CLS_RANK[b.cls] || b.anomaly - a.anomaly || b.evidence - a.evidence || Math.abs(b.primary) - Math.abs(a.primary));
}

export interface PartnerAgg {
  iso3: string; name: string; region: string; transit: boolean; tier: Tier;
  coverage: number; lapse: boolean; lastReportedYear: number; reportedYears: number[];
  peT: number; uiT: number; posT: number; revT: number; absT: number; signedT: number;
  channels: number; investigate: number; anomaly: number; evidence: number;
  byYear: { year: number; pe: number; ui: number; positive: number; reverse: number; reported: boolean }[];
  topChapters: { chapter: string; label: string; value: number; share: number }[];
  trend: number;
}
export interface ChapterAgg {
  chapter: string; label: string; category: string; residual: boolean;
  peT: number; uiT: number; posT: number; revT: number; absT: number; signedT: number;
  gapRate: number; channels: number; topPartner: { name: string; iso3: string; value: number } | null; trend: number;
}

export interface Aggregate {
  filter: Filter;
  years: number[];
  channels: Channel[]; // HS2 after all filters
  channels4: Channel[]; // derived HS4 after all filters
  channels6: Channel[]; // HS6 after all filters
  baseChannels: Channel[]; // HS2 before stage/signal/materiality (for funnel & KPIs)
  baseChannels4: Channel[];
  baseChannels6: Channel[];
  partners: PartnerAgg[];
  chapters: ChapterAgg[];
  categories: { key: string; label: string; value: number; share: number }[];
  annual: { year: number; pe: number; ui: number; positive: number; reverse: number; comparablePartners: number }[];
  concentration: { name: string; partner: string; iso3: string; cmd: string; value: number; share: number; cumShare: number }[];
  movers: {
    goods: { key: string; label: string; total: number; trend: number; series: { y: number; v: number }[] }[];
    countries: { key: string; label: string; iso3: string; total: number; trend: number; series: { y: number; v: number }[] }[];
  };
  heatmap: { import: Record<string, Record<string, number>>; partners: { iso3: string; name: string; tier: Tier }[] };
  funnel: { observedChannels: number; comparableChannels: number; residualChannels: number; comparableValue: number; residualValue: number };
  kpis: {
    comparableTrade: number;
    positive: { low: number; central: number; high: number };
    reverse: number; absolute: number; net: number;
    residualPositive: number;
    coveragePct: number; // comparable partner-years / possible partner-years
    robustSignals: number;
    flipShare: number; // share of channels changing sign across the freight band
    channelCount: number; partnerCount: number;
    top5Share: number; hhi: number;
  };
}

export function aggregate(f: Filter): Aggregate {
  const years = meta.years.filter((y) => y >= f.from && y <= f.to);
  const yearsInRange = years.length;
  const allowPartner = (iso: string) => {
    const pm = pMeta.get(iso);
    if (!pm) return false;
    if (f.country !== "all" && iso !== f.country) return false;
    if (f.view === "high" && pm.tier !== "High") return false;
    if (f.view === "core" && pm.transit) return false;
    if (f.view === "transit" && !pm.transit) return false;
    return true;
  };
  const fc = cells.filter(
    (r) => r.y >= f.from && r.y <= f.to && allowPartner(r.p) &&
      (f.category === "all" || r.cat === f.category) && (f.hs2 === "all" || r.c === f.hs2),
  );

  const baseChannels = buildChannels(fc, 2, f, yearsInRange);
  const baseChannels4 = buildChannels(fc, 4, f, yearsInRange);
  const baseChannels6 = buildChannels(fc, 6, f, yearsInRange);
  const channels = applyChannelFilters(baseChannels, f);
  const channels4 = applyChannelFilters(baseChannels4, f);
  const channels6 = applyChannelFilters(baseChannels6, f);

  const dirVal = (c: Channel) =>
    f.direction === "positive" ? c.posT : f.direction === "reverse" ? c.revT : f.direction === "absolute" ? c.absT : c.signedT;

  // ---- partner rollups (from filtered HS2 channels) ----
  const pMap = new Map<string, Channel[]>();
  for (const c of channels) (pMap.get(c.partnerIso) ?? pMap.set(c.partnerIso, []).get(c.partnerIso)!).push(c);
  const partners: PartnerAgg[] = [];
  for (const [iso, cs] of pMap) {
    const pm = pMeta.get(iso)!;
    const byYearMap = new Map<number, { pe: number; ui: number; positive: number; reverse: number }>();
    for (const c of cs) for (const yr of c.years) {
      const e = byYearMap.get(yr.y) ?? { pe: 0, ui: 0, positive: 0, reverse: 0 };
      e.pe += yr.pe; e.ui += yr.ui; e.positive += pos(yr.signed); e.reverse += pos(-yr.signed);
      byYearMap.set(yr.y, e);
    }
    const posTotal = cs.reduce((s, c) => s + c.posT, 0);
    const dirSeries = years.filter((y) => byYearMap.has(y) && pm.reportedYears.includes(y))
      .map((y) => ({ y, v: f.direction === "reverse" ? byYearMap.get(y)!.reverse : byYearMap.get(y)!.positive }));
    const topChapters = [...cs].sort((a, b) => dirVal(b) - dirVal(a)).filter((c) => Math.abs(dirVal(c)) > NOISE).slice(0, 8)
      .map((c) => ({ chapter: c.chapter, label: c.cmdLabel, value: Math.round(dirVal(c)), share: posTotal > 0 ? c.posT / posTotal : 0 }));
    partners.push({
      iso3: iso, name: pm.name, region: pm.region, transit: pm.transit, tier: pm.tier,
      coverage: pm.coverage, lapse: pm.lapse, lastReportedYear: pm.lastReportedYear, reportedYears: pm.reportedYears,
      peT: cs.reduce((s, c) => s + c.peT, 0), uiT: cs.reduce((s, c) => s + c.uiT, 0),
      posT: posTotal, revT: cs.reduce((s, c) => s + c.revT, 0),
      absT: cs.reduce((s, c) => s + c.absT, 0), signedT: cs.reduce((s, c) => s + c.signedT, 0),
      channels: cs.length, investigate: cs.filter((c) => c.cls === "investigate").length,
      anomaly: cs.reduce((m, c) => Math.max(m, c.anomaly), 0), evidence: cs.reduce((m, c) => Math.max(m, c.evidence), 0),
      byYear: years.map((y) => {
        const e = byYearMap.get(y);
        return { year: y, pe: e?.pe ?? 0, ui: e?.ui ?? 0, positive: e?.positive ?? 0, reverse: e?.reverse ?? 0, reported: pm.reportedYears.includes(y) };
      }),
      topChapters, trend: trendOf(dirSeries),
    });
  }
  partners.sort((a, b) => (f.direction === "reverse" ? b.revT - a.revT : b.posT - a.posT));

  // ---- chapter rollups ----
  const cMap = new Map<string, Channel[]>();
  for (const c of channels) (cMap.get(c.chapter) ?? cMap.set(c.chapter, []).get(c.chapter)!).push(c);
  const chapters: ChapterAgg[] = [];
  for (const [chapter, cs] of cMap) {
    const byYear = new Map<number, number>();
    for (const c of cs) for (const yr of c.years) {
      const v = f.direction === "reverse" ? pos(-yr.signed) : pos(yr.signed);
      byYear.set(yr.y, (byYear.get(yr.y) ?? 0) + v);
    }
    const series = years.filter((y) => byYear.has(y)).map((y) => ({ y, v: byYear.get(y)! }));
    const peT = cs.reduce((s, c) => s + c.peT, 0);
    const posT = cs.reduce((s, c) => s + c.posT, 0);
    const top = [...cs].sort((a, b) => Math.abs(dirVal(b)) - Math.abs(dirVal(a)))[0];
    chapters.push({
      chapter, label: chapLabel.get(chapter) ?? `HS ${chapter}`, category: cs[0].category, residual: isResidualChapter(chapter),
      peT, uiT: cs.reduce((s, c) => s + c.uiT, 0),
      posT, revT: cs.reduce((s, c) => s + c.revT, 0),
      absT: cs.reduce((s, c) => s + c.absT, 0), signedT: cs.reduce((s, c) => s + c.signedT, 0),
      gapRate: peT > 0 ? posT / (peT * (1 + f.cif)) : 0, channels: cs.length,
      topPartner: top ? { name: top.partner, iso3: top.partnerIso, value: Math.round(dirVal(top)) } : null,
      trend: trendOf(series),
    });
  }
  chapters.sort((a, b) => Math.abs(f.direction === "reverse" ? b.revT : b.posT) - Math.abs(f.direction === "reverse" ? a.revT : a.posT));

  // ---- categories ----
  const catTotals = new Map<string, number>();
  for (const c of channels) catTotals.set(c.category, (catTotals.get(c.category) ?? 0) + (f.direction === "reverse" ? c.revT : c.posT));
  const catSum = [...catTotals.values()].reduce((a, b) => a + b, 0) || 1;
  const categories = [...catTotals.entries()].map(([key, v]) => ({ key, label: catLabel.get(key) ?? key, value: v, share: v / catSum }))
    .filter((c) => c.value > 0).sort((a, b) => b.value - a.value);

  // ---- annual (positive AND reverse, plus comparable partner count) ----
  const yAgg = new Map<number, { pe: number; ui: number; positive: number; reverse: number; partners: Set<string> }>();
  for (const c of baseChannels) for (const yr of c.years) {
    const e = yAgg.get(yr.y) ?? { pe: 0, ui: 0, positive: 0, reverse: 0, partners: new Set<string>() };
    e.pe += yr.pe; e.ui += yr.ui; e.positive += pos(yr.signed); e.reverse += pos(-yr.signed); e.partners.add(c.partnerIso);
    yAgg.set(yr.y, e);
  }
  const annual = years.map((y) => {
    const e = yAgg.get(y) ?? { pe: 0, ui: 0, positive: 0, reverse: 0, partners: new Set<string>() };
    return { year: y, pe: e.pe, ui: e.ui, positive: e.positive, reverse: e.reverse, comparablePartners: e.partners.size };
  });

  // ---- concentration (on the active direction over filtered channels) ----
  const sorted = [...channels].filter((c) => Math.abs(dirVal(c)) > NOISE).sort((a, b) => Math.abs(dirVal(b)) - Math.abs(dirVal(a)));
  const dirTotal = sorted.reduce((s, c) => s + Math.abs(dirVal(c)), 0) || 1;
  let cum = 0;
  const concentration = sorted.slice(0, 20).map((c) => {
    cum += Math.abs(dirVal(c));
    return { name: `${c.partner} · ${c.cmdLabel}`, partner: c.partner, iso3: c.partnerIso, cmd: c.cmd, value: Math.round(dirVal(c)), share: Math.abs(dirVal(c)) / dirTotal, cumShare: cum / dirTotal };
  });

  // ---- movers ----
  const goods = chapters.map((c) => {
    const byYear = new Map<number, number>();
    for (const ch of channels) if (ch.chapter === c.chapter) for (const yr of ch.years) {
      const v = f.direction === "reverse" ? pos(-yr.signed) : pos(yr.signed);
      byYear.set(yr.y, (byYear.get(yr.y) ?? 0) + v);
    }
    const series = years.filter((y) => byYear.has(y)).map((y) => ({ y, v: byYear.get(y)! }));
    const total = series.reduce((s, x) => s + x.v, 0);
    return { key: c.chapter, label: c.label, total, trend: trendOf(series), series };
  });
  const countries = partners.filter((p) => !p.lapse).map((p) => {
    const series = p.byYear.filter((x) => x.reported && (x.positive > 0 || x.reverse > 0))
      .map((x) => ({ y: x.year, v: f.direction === "reverse" ? x.reverse : x.positive }));
    const total = series.reduce((s, x) => s + x.v, 0);
    return { key: p.iso3, label: p.name, iso3: p.iso3, total, trend: trendOf(series), series };
  });

  // ---- heatmap ----
  const heatImport: Record<string, Record<string, number>> = {};
  for (const c of channels) (heatImport[c.chapter] ??= {})[c.partnerIso] = Math.round(c.signedT);

  // ---- funnel & KPIs (from base = pre-stage/signal/materiality channels) ----
  const residualBase = baseChannels.filter((c) => c.stage === "residual");
  const funnel = {
    observedChannels: baseChannels.length,
    comparableChannels: baseChannels.length,
    residualChannels: residualBase.length,
    comparableValue: baseChannels.reduce((s, c) => s + c.peT, 0),
    residualValue: residualBase.reduce((s, c) => s + c.posT, 0),
  };
  const Klo = 1 + meta.cif.low;
  const Khi = 1 + meta.cif.high;
  const posAt = (mult: number) =>
    baseChannels.reduce((s, c) => s + c.years.reduce((t, yr) => t + pos(yr.pe * mult - yr.ui), 0), 0);
  const activePartners = meta.partners.filter((p) => allowPartner(p.iso3));
  const possiblePY = activePartners.length * yearsInRange || 1;
  const comparablePY = activePartners.reduce((s, p) => s + p.reportedYears.filter((y) => y >= f.from && y <= f.to).length, 0);
  const flippers = baseChannels.filter((c) => c.flipsAcrossFreight).length;

  const kpis = {
    comparableTrade: baseChannels.reduce((s, c) => s + c.peT, 0),
    positive: { low: posAt(Klo), central: baseChannels.reduce((s, c) => s + c.posT, 0), high: posAt(Khi) },
    reverse: baseChannels.reduce((s, c) => s + c.revT, 0),
    absolute: baseChannels.reduce((s, c) => s + c.absT, 0),
    net: baseChannels.reduce((s, c) => s + c.signedT, 0),
    residualPositive: funnel.residualValue,
    coveragePct: comparablePY / possiblePY,
    robustSignals: baseChannels6.filter((c) => c.cls === "investigate" && c.robustness === "robust").length,
    flipShare: baseChannels.length ? flippers / baseChannels.length : 0,
    channelCount: channels.length, partnerCount: partners.length,
    top5Share: sorted.slice(0, 5).reduce((s, c) => s + Math.abs(dirVal(c)), 0) / dirTotal,
    hhi: Math.round(sorted.reduce((s, c) => s + (Math.abs(dirVal(c)) / dirTotal) ** 2, 0) * 10000),
  };

  return {
    filter: f, years, channels, channels4, channels6, baseChannels, baseChannels4, baseChannels6,
    partners, chapters, categories, annual, concentration,
    movers: { goods, countries },
    heatmap: { import: heatImport, partners: partners.map((p) => ({ iso3: p.iso3, name: p.name, tier: p.tier })) },
    funnel, kpis,
  };
}

/** Context line per spec §5.3 — shown above every analytical block. */
export function contextLine(f: Filter): string {
  const period = f.from === f.to ? String(f.from) : `${f.from}–${f.to}`;
  const parts = [period, DIRECTION_LABELS[f.direction], STAGE_LABELS[f.stage]];
  if (f.view !== "all") parts.push(VIEW_LABELS[f.view]);
  parts.push(`freight ${Math.round(f.cif * 100)}%`);
  return parts.join(" · ");
}
