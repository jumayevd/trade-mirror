/**
 * Years the data files carry but the dashboard leaves out: every page reads as
 * though the series began after them. They stay in src/data and public/data —
 * and in the scripts that rebuild those — untouched, so emptying this list
 * brings a year back.
 *
 * One list for the engine (src/lib/dataset.ts) and the risk fit
 * (scripts/build-risk-index.ts): the on-screen audit compares the live score
 * with the fitted index cell by cell, so the two must read the same years.
 * After changing it, rerun `npm run data:risk`.
 */
export const LEFT_OUT_YEARS = new Set<number>([2017]);
export const shown = (y: number): boolean => !LEFT_OUT_YEARS.has(y);
