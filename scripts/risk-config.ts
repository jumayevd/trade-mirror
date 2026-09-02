/**
 * Mirror Trade Risk Score (MTRS) v3.1 — every tunable constant, in one module.
 *
 * The score is built by scripts/build-risk-index.ts and consumed as static JSON;
 * nothing here is read at runtime by the dashboard, so changing a constant means
 * re-running the build. See /methodology for the plain-language description.
 *
 * Construction: RS = 100 × √(G × P), where G is the percentile-rank-normalized
 * gap rate of the cell and P = (k + 1) / (n + 2) — Laplace's rule of succession
 * over the k positive-gap years among the n matched years.
 */

export const METHODOLOGY_VERSION = "3.1";

/**
 * Laplace smoothing on the persistence rate: P = (k + ALPHA) / (n + ALPHA + BETA).
 * ALPHA = BETA = 1 is the rule of succession — the posterior mean of a Bernoulli
 * probability under a uniform prior. It stops one positive year out of one from
 * reading like eight out of eight.
 */
export const ALPHA = 1;
export const BETA = 1;

/** Default inclusion floor on a cell's mean annual trade value, in USD. */
export const MATERIALITY_FLOOR = 100_000;

/**
 * Comparability threshold: a cell-year is matched when both books report it.
 *
 * Zero, and deliberately — the same value src/lib/dataset.ts applies, so the
 * fitted index here and the comparable years shown in the interface stay one
 * population. It used to be $100,000 on each side, which at HS6 removed three
 * quarters of the cells both books actually reported.
 *
 * MATERIALITY_FLOOR below is a different quantity: it only labels how many
 * fitted cells are small, and filters nothing.
 */
export const NOISE = 0;

/** Critical band = the top share of cells by RS, following Gara et al. (2018). */
export const CRITICAL_TOP = 0.025;
