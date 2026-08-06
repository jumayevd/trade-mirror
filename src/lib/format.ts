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

/** Anomaly strength: neutral greys warming to amber — never red on its own. */
export function anomalyColor(score: number): string {
  if (score >= 55) return "#c2701e";
  if (score >= 35) return "#8a7a4d";
  return "#8a948e";
}
/** Evidence quality: grey to green. */
export function evidenceColor(score: number): string {
  if (score >= 60) return "#2f7d4f";
  if (score >= 40) return "#6d8a5c";
  return "#8a948e";
}

export const CLASS_COLORS: Record<string, string> = {
  investigate: "#b91c1c", // the only red in the system
  verify: "#a16207",
  monitor: "#2f7d4f",
  low: "#8a948e",
  transit: "#6b6480",
};

export const COLORS = {
  uzb: "#3565c0",
  partner: "#c2701e",
  positive: "#c2701e",
  reverse: "#3565c0",
  transit: "#6b6480",
  investigate: "#b91c1c",
  ok: "#2f7d4f",
  warn: "#a16207",
  grid: "#eef0ee",
  axis: "#8a948e",
  text: "#55605a",
};
