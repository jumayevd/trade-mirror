/**
 * Build-time feature flags.
 *
 * A section that is still being worked on stays in the repository, complete and
 * running, but is kept out of the deployed dashboard until it is ready to show.
 * Hiding it here rather than reverting the work means the branch never diverges:
 * the code, its data and its tests carry on being maintained alongside
 * everything else, and publishing it later is a one-line change rather than a
 * merge.
 *
 * `NEXT_PUBLIC_*` values are substituted by Next at build time, so this is a
 * constant in the bundle and the hidden route is absent from the production
 * build rather than merely unreachable. Both halves of a flag have to be gated —
 * the navigation entry AND the route — or the page stays reachable by URL.
 *
 * The default is OFF, so a deployment shows a flagged section only where the
 * variable is deliberately set. Production has no .env.local, so it hides;
 * a local checkout with one shows the section in `next dev` and in a local
 * production build alike (NODE_ENV cannot do this job — the dashboard is
 * previewed locally with `npm run build && next start`, which is production
 * mode).
 *
 * To work on a flagged section locally, create `.env.local` (gitignored) with:
 *
 *     NEXT_PUBLIC_SHOW_UNEXPLAINED=1
 *
 * and restart the dev server or rebuild — build-time values are not picked up
 * by a hot reload.
 */

/**
 * Unexplained Discrepancy Analysis (`/unexplained`): the anomaly model, its
 * caterpillar plot and the partner/product decompositions. Complete and
 * working, not yet presentable, so it is not deployed.
 */
export const SHOW_UNEXPLAINED = process.env.NEXT_PUBLIC_SHOW_UNEXPLAINED === "1";
