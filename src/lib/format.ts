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
 * CBU palette — navy and white, one blue family.
 *
 *  navy      #1e3a6e  primary data series (positive discrepancy, declared side)
 *  navy-2    #2b4c8c  secondary series (Uzbekistan-recorded imports)
 *  navy-3    #4a6ea8  tertiary series
 *  sky       #5b9bf0  accent / highlight (rails, selection) — the old gold slot
 *  sky-2     #4a86d8  sky as a data FILL (partner-reported, metered series)
 *  sky-ink   #2c64b8  sky as TEXT (stays legible at 11px)
 *  royal     #1d5fd6  attention — suspicious, Critical band — the old red slot
 *  slate     #6b7f9e  calm / normal — the old green slot
 *
 * All fills are solid: no alpha suffixes, so bars and markers stay crisp on
 * the white card surface. Chrome (grid, axis, baseline) stays cool grey and
 * recessive; ink stays dark navy.
 */
/*
 * The canvas palettes. CSS variables cannot reach a canvas, so the chart
 * colors are chosen HERE, once, at module init, from the data-theme attribute
 * the layout's inline script set before any bundle ran. Toggling the theme
 * reloads the page (see src/lib/theme-store.ts), which re-runs this choice —
 * that is the whole synchronisation mechanism, so nothing else may cache a
 * color across a theme change.
 *
 * Dark keeps the identity with the ground inverted: navy cannot carry a series
 * on a navy ground, so every blue lightens to read on #141d2e.
 */
export const IS_DARK = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";

const NAVY_DEEP = IS_DARK ? "#51719f" : "#0f2547";
const NAVY = IS_DARK ? "#7da2e0" : "#1e3a6e";
const NAVY_2 = IS_DARK ? "#6b8fc9" : "#2b4c8c";
const NAVY_3 = IS_DARK ? "#93b3e8" : "#4a6ea8";
// CBU gold, the accent the logo carries (rails, selection); amber, the
// counterpart series as a fill (partner exports, metered electricity) and as
// text legible at 11px
const GOLD = IS_DARK ? "#e3b84f" : "#c99a2e";
const GOLD_2 = IS_DARK ? "#c4862a" : "#c2780f";
const GOLD_INK = IS_DARK ? "#f0bd63" : "#8a5300";
// the further categorical slots
const PLUM = IS_DARK ? "#a07acb" : "#7a5195";
const TEAL = IS_DARK ? "#0f9a85" : "#0b9180";
// status, never a series: attention (suspicious, critical) and its step down,
// then calm (normal)
const ALERT_RED = IS_DARK ? "#f07167" : "#c0392b";
const GREEN = IS_DARK ? "#6cc79a" : "#3a9a6a";
const GREEN_INK = IS_DARK ? "#7fd1a6" : "#2f7d55";
const SLATE = IS_DARK ? "#9aa2b1" : "#5b6578";
const GREY = IS_DARK ? "#8d96a8" : "#8a93a3";

/**
 * Risk bands in the CBU palette: Critical takes the logo's gold — the one
 * accent, so the band that matters most is the one the eye finds — and High,
 * Medium and Low step down a navy ramp, dark to pale. The bands are ordered,
 * and every adjacent pair is validated for colour-blind readers (dataviz
 * palette script, adjacent pairs: light ΔE 22.2 CVD / 23.4 normal vision, dark
 * 18.7 / 19.1). Fills only — gold and the pale step are too light for text on
 * white; figures printed in a band's colour use BAND_INK.
 */
// CSS variables (globals.css, per theme), not hex: the prerendered HTML and the
// browser's render then emit the same style text, and the theme swaps the
// colours in CSS. Every consumer is DOM; a canvas could not read these.
// Written out literally: Tailwind drops custom properties nothing references,
// and globals.css's .band-palette rule is what keeps these ones.
export const BAND_COLORS: Record<string, string> = {
  critical: "var(--band-critical)", high: "var(--band-high)",
  elevated: "var(--band-elevated)", low: "var(--band-low)",
};

/** The same bands as text, legible at stat-figure size on the card surface. */
export const BAND_INK: Record<string, string> = {
  critical: "var(--band-ink-critical)", high: "var(--band-ink-high)",
  elevated: "var(--band-ink-elevated)", low: "var(--band-ink-low)",
};

/** The risk badges and score bars: an alert scale (red, orange, amber, green), apart from the navy band frames. */
export const ALERT_COLORS: Record<string, string> = {
  critical: "var(--alert-critical)", high: "var(--alert-high)",
  elevated: "var(--alert-elevated)", low: "var(--alert-low)",
};
export const ALERT_INK: Record<string, string> = {
  critical: "var(--alert-ink-critical)", high: "var(--alert-ink-high)",
  elevated: "var(--alert-ink-elevated)", low: "var(--alert-ink-low)",
};

/** Ink for a label printed inside a band's fill. */
export const BAND_ON: Record<string, string> = {
  critical: "var(--band-on-critical)", high: "var(--band-on-high)",
  elevated: "var(--band-on-elevated)", low: "var(--band-on-low)",
};

/**
 * Categorical slots, in order, for charts that need more than one series:
 * navy, amber, plum, teal. The order is the colour-blind safety: every adjacent
 * pair clears the validator (light: ΔE 11.2 CVD, 21.4 normal vision; dark steps
 * likewise), and a fifth series folds into slate or grey rather than a new hue.
 */
export const SERIES_COLORS = [NAVY, GOLD_2, PLUM, TEAL, SLATE, GREY];

export const COLORS = {
  // CBU brand ramps
  navy: NAVY_DEEP,
  navy1: NAVY,
  navy2: NAVY_2,
  navy3: NAVY_3,
  gold: GOLD,
  goldDeep: GOLD_2,
  goldInk: GOLD_INK,
  plum: PLUM,
  teal: TEAL,

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
  grid: IS_DARK ? "#263247" : "#e6ebf3",
  baseline: IS_DARK ? "#3a4862" : "#c5cedd",
  axis: GREY,
  text: IS_DARK ? "#c9d3e4" : "#2a3445",
  surface: IS_DARK ? "#141d2e" : "#ffffff",
  neutralMid: IS_DARK ? "#1f2a3e" : "#eef2f8",
  /** quiet bar fill beside the attention red (below a threshold) */
  calm: IS_DARK ? "#4a5f82" : "#a9bcdb",
  /** a threshold's attention side as a band behind bars */
  band: IS_DARK ? "#3a2226" : "#fbeeec",

  /* the geographic map's inert ground — themed here because a canvas cannot
     read the CSS tokens the rest of the page uses */
  mapArea: IS_DARK ? "#1f2a3e" : "#eef2f8",
  mapBorder: IS_DARK ? "#33405a" : "#d5dde9",
  mapEmphasis: IS_DARK ? "#2f3d58" : "#cfdcf0",
};
