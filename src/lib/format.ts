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

/** Month numbers as contiguous named runs: [1..10] -> "January–October". */
export function monthRuns(months: number[], name: (m: number) => string): string {
  if (months.length === 0) return "";
  const runs: string[] = [];
  let start = months[0];
  let prev = months[0];
  for (const m of months.slice(1)) {
    if (m === prev + 1) { prev = m; continue; }
    runs.push(start === prev ? name(start) : `${name(start)}–${name(prev)}`);
    start = prev = m;
  }
  runs.push(start === prev ? name(start) : `${name(start)}–${name(prev)}`);
  return runs.join(", ");
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
/*
 * The canvas palettes. CSS variables cannot reach a canvas, so the chart
 * colors are chosen HERE, once, at module init, from the data-theme attribute
 * the layout's inline script set before any bundle ran. Toggling the theme
 * reloads the page (see src/lib/theme-store.ts), which re-runs this choice —
 * that is the whole synchronisation mechanism, so nothing else may cache a
 * color across a theme change.
 *
 * Dark keeps the CBU identity with the ground inverted: navy cannot carry a
 * series on a navy ground, so the navy slots lighten; gold holds; the alert
 * red and greens lift just enough to read on #18202f.
 */
const IS_DARK = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

const NAVY_DEEP = IS_DARK ? "#51719f" : "#16233b";
const NAVY = IS_DARK ? "#7da2e0" : "#1e3a6e";
const NAVY_2 = IS_DARK ? "#6b8fc9" : "#2b4c8c";
const NAVY_3 = IS_DARK ? "#93b3e8" : "#4a6ea8";
const GOLD = "#d99a2b";
const GOLD_2 = IS_DARK ? "#d8b36a" : "#b07d1e";
const GOLD_INK = IS_DARK ? "#d8b36a" : "#8f6212";
const AMBER_HOT = IS_DARK ? "#d97f3e" : "#a4560f";
const ALERT_RED = IS_DARK ? "#e0655c" : "#b3261e";
const GREEN = IS_DARK ? "#3da875" : "#1a6b45";
const GREEN_INK = IS_DARK ? "#4dbd8a" : "#155c3b";
const SLATE = IS_DARK ? "#9aa2b1" : "#575c67";
const GREY = IS_DARK ? "#8d96a8" : "#898781";

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
  grid: IS_DARK ? "#2a3447" : "#e5e4de",
  baseline: IS_DARK ? "#3d4a63" : "#c9c8c0",
  axis: GREY,
  text: IS_DARK ? "#c7cdd9" : "#3f3e3a",
  surface: IS_DARK ? "#18202f" : "#fcfcfb",
  neutralMid: IS_DARK ? "#223048" : "#edece7",

  /* the geographic map's inert ground — themed here because a canvas cannot
     read the CSS tokens the rest of the page uses */
  mapArea: IS_DARK ? "#223048" : "#eef1ee",
  mapBorder: IS_DARK ? "#33405a" : "#d8ded9",
  mapEmphasis: IS_DARK ? "#2f3d58" : "#cfd8d1",
};
