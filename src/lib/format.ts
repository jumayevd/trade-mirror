export function fmtUSD(v: number, opts: { sign?: boolean } = {}): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : opts.sign ? "+" : "";
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`;
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

/** Anomaly strength dot color — neutral, warming with the score. Never red. */
export function anomalyColor(score: number): string {
  if (score >= 55) return "#eb6834";
  if (score >= 35) return "#a16207";
  return "#898781";
}
/** Evidence quality dot color — grey to green. */
export function evidenceColor(score: number): string {
  if (score >= 60) return "#0ca30c";
  if (score >= 40) return "#6d8a5c";
  return "#898781";
}

/** Status palette (fixed, dataviz reference): never reused as series colors. */
export const CLASS_COLORS: Record<string, string> = {
  investigate: "#d03b3b", // critical — the only red in the system
  verify: "#ec835a", // serious
  monitor: "#0ca30c", // good
  low: "#898781",
  transit: "#52514e",
};

export const COLORS = {
  // series (validated categorical slots 1 & 2)
  uzb: "#2a78d6",
  partner: "#eb6834",
  positive: "#eb6834",
  reverse: "#2a78d6",
  // status / accents
  transit: "#52514e",
  investigate: "#d03b3b",
  ok: "#006300", // success text
  good: "#0ca30c",
  warn: "#a16207",
  // chrome & ink
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  axis: "#898781",
  text: "#52514e",
  surface: "#fcfcfb",
  neutralMid: "#f0efec",
};
