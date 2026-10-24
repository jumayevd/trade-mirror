import { IS_DARK } from "@/lib/format";

/*
 * The portal's sequential (magnitude) scale, shared by the partner map and the
 * products heatmap so one shade means the same size of gap on both.
 */

/*
 * Six classes on a single-hue sequential ramp, low → high: the house navy,
 * stepped by lightness alone.
 *
 * Magnitude is a sequential job, and one hue says "more of the same thing"
 * where a multi-hue ramp invites the reader to look for a boundary at each
 * hue change. It also leaves gold to the accents the interface reserves it for.
 *
 * Dark mode gets its own steps rather than an inverted copy: the ramp must
 * separate from the chart surface AND from the inert fill used for countries
 * outside the partner set, and on a dark ground a deep-navy low end vanishes
 * into both, so there it runs light-ward instead.
 *
 * Checked for what a sequential ramp needs — strictly monotonic lightness,
 * evenly spaced steps (max/min 1.43 and 1.48), a total OKLab-L range of 0.51
 * and 0.44, and a low end clear of the no-data fill (ΔE 12.8 and 11.6). The
 * categorical validator does not apply: its adjacent-pair separation check
 * asks for the opposite of what one hue stepped by lightness wants, and its
 * own output says as much.
 */
export const SEQ_RAMP = IS_DARK
  ? ["#344c79", "#41608f", "#5179ac", "#6b95c8", "#8db3de", "#b7d2f2"]
  : ["#b7cbe8", "#95b3da", "#6e92c5", "#4a72ab", "#2d5286", "#19335e"];

/** Two significant figures, so class edges read as $1.2M rather than $1,187,433. */
function niceRound(x: number): number {
  if (!(x > 0)) return 0;
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.round(x / p) * p;
}

/**
 * Class edges at the quantiles of the values actually on the map. The old
 * edges were fixed fractions of the largest value (50/20/5/1%), and with one
 * partner far above the rest nearly every country fell below 1% of it —
 * the palest bin — so the map read as a single colour. Quantile edges put
 * roughly the same number of countries in each class.
 */
export function quantileEdges(values: number[], classes: number): number[] {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return [];
  const edges: number[] = [];
  for (let i = 1; i < classes; i++) {
    const q = v[Math.min(v.length - 1, Math.floor((i * v.length) / classes))];
    const e = niceRound(q);
    if (e > 0 && (edges.length === 0 || e > edges[edges.length - 1])) edges.push(e);
  }
  return edges;
}

/** One legend class of a piecewise visualMap. */
export interface RampPiece { min?: number; max?: number; label: string; color: string }

/**
 * Legend classes over the positive values, highest first as a legend reads
 * top-down: "over X", the bands between, "under Y". The ramp is indexed from
 * the top so a short edge list (few values) still ends on the deepest colour
 * for the largest.
 */
export function rampPieces(values: number[], fmt: (v: number) => string, overWord: string, underWord: string): RampPiece[] {
  const e = quantileEdges(values.filter((v) => Number.isFinite(v) && v > 0), SEQ_RAMP.length);
  if (e.length === 0) return [{ min: 0, label: underWord, color: SEQ_RAMP[0] }];
  const top = SEQ_RAMP.length - 1;
  const out: RampPiece[] = [{ min: e[e.length - 1], label: `${overWord} ${fmt(e[e.length - 1])}`, color: SEQ_RAMP[top] }];
  for (let i = e.length - 1; i >= 1; i--) {
    out.push({ min: e[i - 1], max: e[i], label: `${fmt(e[i - 1])} – ${fmt(e[i])}`, color: SEQ_RAMP[top - (e.length - i)] });
  }
  out.push({ max: e[0], label: `${underWord} ${fmt(e[0])}`, color: SEQ_RAMP[top - e.length] });
  return out;
}
