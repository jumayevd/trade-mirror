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
 * Score colors. Anomaly strength alone is NEVER red — red is reserved for the
 * Investigate class (high anomaly + high evidence), per spec §10.1.
 */
export function anomalyColor(score: number): string {
  if (score >= 55) return "#d97706"; // amber — strong anomaly
  if (score >= 35) return "#eab308"; // yellow
  return "#75847b"; // grey
}
export function evidenceColor(score: number): string {
  if (score >= 60) return "#15803d"; // green — good data
  if (score >= 40) return "#65a30d";
  return "#75847b"; // grey
}

export const CLASS_COLORS: Record<string, string> = {
  investigate: "#dc2626", // red — only here
  verify: "#d97706",
  monitor: "#15803d",
  low: "#75847b",
  transit: "#7c3aed",
};

export const COLORS = {
  uzb: "#2563eb", // blue — UZB-reported / reverse
  partner: "#d97706", // amber — partner-reported / positive
  positive: "#d97706",
  reverse: "#2563eb",
  transit: "#7c3aed",
  investigate: "#dc2626",
  ok: "#15803d",
  warn: "#b45309",
  grid: "#e5e9e5",
  axis: "#75847b",
  text: "#45544b",
};
