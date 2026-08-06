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

/**
 * Modernist palette (Claude Design handoff): one accent, ink, greys.
 * Positive = #ec3013 accent; reverse = ink at 22% (deliberately not a second hue);
 * #ae1800 wherever the accent appears at text size.
 */
export function anomalyColor(score: number): string {
  if (score >= 55) return "#ae1800";
  return "rgba(32,30,29,.55)";
}
export function evidenceColor(score: number): string {
  if (score >= 60) return "#201e1d";
  return "rgba(32,30,29,.55)";
}

export const CLASS_COLORS: Record<string, string> = {
  investigate: "#ae1800",
  verify: "#201e1d",
  monitor: "rgba(32,30,29,.55)",
  low: "rgba(32,30,29,.55)",
  transit: "#605d5d",
};

export const COLORS = {
  uzb: "#201e1d",
  partner: "#ec3013",
  positive: "#ec3013",
  reverse: "rgba(32,30,29,.22)",
  transit: "#605d5d",
  investigate: "#ae1800",
  ok: "#201e1d",
  good: "#201e1d",
  warn: "#605d5d",
  grid: "rgba(32,30,29,.14)",
  baseline: "#201e1d",
  axis: "rgba(32,30,29,.55)",
  text: "rgba(32,30,29,.72)",
  surface: "#f3f2f2",
  neutralMid: "#eae9e9",
};
