import { labelLang } from "@/lib/labels";

/**
 * Magnitude suffixes for compact money, per language.
 *
 * English keeps the tight single letter ($1.5B). Russian and Uzbek use their
 * own conventional abbreviations, which are several letters long and so take a
 * thin gap from the digits — "$1.5млрд" run together reads as a typo.
 */
const MAGNITUDES: Record<string, readonly [string, string, string]> = {
  en: ["B", "M", "K"],
  ru: [" млрд", " млн", " тыс."],
  uz: [" mlrd", " mln", " ming"],
};

export function fmtUSD(v: number, opts: { sign?: boolean } = {}): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : opts.sign ? "+" : "";
  const [B, M, K] = MAGNITUDES[labelLang()] ?? MAGNITUDES.en;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}${B}`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}${M}`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}${K}`;
  return `${sign}$${a.toFixed(0)}`;
}

/** Full value for tooltips/exports (spec §10.3). */
export function fmtUSDFull(v: number): string {
  return `USD ${new Intl.NumberFormat("en-US").format(Math.round(v))}`;
}

export function fmtPct(v: number, digits = 1): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function fmtNum(v: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(v));
}

/**
 * CBU house palette — deep navy + gold.
 *
 *  navy     #1e3a6e  primary data series (positive discrepancy)
 *  navy-2   #2b4c8c  secondary series (Uzbekistan-recorded imports)
 *  navy-3   #4a6ea8  tertiary series
 *  gold     #d99a2b  accent / highlight (rails, borders, selection)
 *  gold-2   #b07d1e  gold used as a data FILL (partner-reported series)
 *  gold-ink #8f6212  gold used as TEXT (stays legible at 11px)
 *  red      #b3261e  the single reserved alert — Critical risk band only
 *
 * All fills are solid: no alpha suffixes, so bars and markers stay crisp on
 * the #fcfcfb card surface. Chrome (grid, axis, baseline) stays neutral grey
 * and recessive; ink stays dark.
 */
const NAVY_DEEP = "#16233b";
const NAVY = "#1e3a6e";
const NAVY_2 = "#2b4c8c";
const NAVY_3 = "#4a6ea8";
const GOLD = "#d99a2b";
const GOLD_2 = "#b07d1e";
const GOLD_INK = "#8f6212";
const AMBER_HOT = "#a4560f";
const ALERT_RED = "#b3261e";
const GREEN = "#1a6b45";
const GREEN_INK = "#155c3b";
const SLATE = "#575c67";
const GREY = "#898781";

/** MTRS band palette (fixed): never reused as series colors. */
export const BAND_COLORS: Record<string, string> = {
  critical: ALERT_RED, // the only red in the system
  high: AMBER_HOT,
  elevated: GOLD_2,
  low: GREY,
};

/** Categorical slots, in order, for charts that need more than one series. */
export const SERIES_COLORS = [NAVY, GOLD_2, NAVY_3, GREEN, NAVY_DEEP, SLATE];

export const COLORS = {
  // CBU brand ramps
  navy: NAVY_DEEP,
  navy1: NAVY,
  navy2: NAVY_2,
  navy3: NAVY_3,
  gold: GOLD,
  goldDeep: GOLD_2,
  goldInk: GOLD_INK,

  // series (semantic aliases — solid fills, no alpha)
  positive: NAVY, // positive discrepancy: the primary metric
  uzb: NAVY_2, // Uzbekistan-recorded imports (CIF)
  partner: GOLD_2, // partner-reported exports (FOB)
  /** @deprecated reverse discrepancy is no longer screened — alias kept for transition */
  reverse: GOLD_2,

  // status / accents
  transit: SLATE,
  investigate: ALERT_RED,
  ok: GREEN_INK, // success text
  good: GREEN,
  warn: GOLD_INK,
  accent: GOLD,

  // chrome & ink
  grid: "#e5e4de",
  baseline: "#c9c8c0",
  axis: GREY,
  text: "#3f3e3a",
  surface: "#fcfcfb",
  neutralMid: "#edece7",
};
