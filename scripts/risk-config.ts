/**
 * Mirror Trade Risk Score (MTRS) v3.0 — every tunable constant, in one module.
 *
 * The score is built by scripts/build-risk-index.ts and consumed as static JSON;
 * nothing here is read at runtime by the dashboard, so changing a constant means
 * re-running the build. See /methodology for the plain-language description.
 */

export const METHODOLOGY_VERSION = "3.0";

/**
 * In-scope rule for a cell-year.
 *  - "conservative": d > 0 AND e > 0 — the partner reported more than Uzbekistan
 *    did, AND the shortfall exceeds what freight and structure predict.
 *  - "residual_only": e > 0 — statistically broader, keeps cells whose raw gap is
 *    negative but still larger than the structure predicts.
 */
export const FILTER_MODE: "conservative" | "residual_only" = "conservative";

/** A cell-year counts toward persistence when its annual rank reaches this. */
export const TAU = 0.75;

/**
 * Beta-binomial prior on the flagging rate. ALPHA/(ALPHA+BETA) must equal the
 * flagging rate under the null, which is 1 − TAU: change TAU and BETA moves with
 * it. At TAU = 0.75 the null rate is 0.25 = 1/(1+3).
 */
export const ALPHA = 1;
export const BETA = 3;

/** Default inclusion floor on a cell's mean annual trade value, in USD. */
export const MATERIALITY_FLOOR = 100_000;

/**
 * Values at or below this are treated as noise rather than a reported flow —
 * the same threshold the rest of the platform applies, so the matched set here
 * and the comparable years shown in the interface are the same population.
 */
export const NOISE = 100_000;

/** Critical band = the top share of cells by MTRS, following Gara et al. (2018). */
export const CRITICAL_TOP = 0.025;

/**
 * Ranking strata for the percentile rank.
 *  - "decile": size decile only. Chapter is already removed by the fixed effects
 *    in Step 1, and with ~3k cells a chapter × decile grid averages three cells
 *    per stratum, which is too thin to rank inside.
 *  - "chapter_decile": the spec's chapter × size-decile grid, for datasets large
 *    enough to fill it.
 */
export const STRATA: "decile" | "chapter_decile" = "decile";

/** Iteration limits for the crossed random-effects fit. */
export const MAX_ITER = 4000;
export const TOL = 1e-8;

/** Great-circle origin: Tashkent. */
export const TASHKENT = { lat: 41.2995, lon: 69.2401 };

/**
 * Partner capital coordinates, for the great-circle distance term. A static table
 * rather than a build-time API call, so the pipeline is reproducible offline.
 * Covers every partner with at least one matched cell in the current extract.
 */
export const CAPITALS: Record<string, [number, number]> = {
  AFG: [34.53, 69.17], ALB: [41.33, 19.82], ARE: [24.47, 54.37], ARG: [-34.61, -58.38],
  ARM: [40.18, 44.51], AUS: [-35.28, 149.13], AUT: [48.21, 16.37], AZE: [40.41, 49.87],
  BEL: [50.85, 4.35], BGD: [23.81, 90.41], BGR: [42.70, 23.32], BHR: [26.23, 50.59],
  BIH: [43.86, 18.41], BLR: [53.90, 27.57], BOL: [-16.49, -68.13], BRA: [-15.79, -47.88],
  CAN: [45.42, -75.70], CHE: [46.95, 7.45], CHL: [-33.45, -70.67], CHN: [39.90, 116.41],
  COL: [4.71, -74.07], CUB: [23.11, -82.37], CYP: [35.19, 33.38], CZE: [50.08, 14.44],
  DEU: [52.52, 13.40], DNK: [55.68, 12.57], ECU: [-0.18, -78.47], EGY: [30.04, 31.24],
  ESP: [40.42, -3.70], EST: [59.44, 24.75], FIN: [60.17, 24.94], FRA: [48.86, 2.35],
  GBR: [51.51, -0.13], GEO: [41.72, 44.83], GRC: [37.98, 23.73], GTM: [14.63, -90.51],
  HKG: [22.32, 114.17], HND: [14.07, -87.19], HRV: [45.81, 15.98], HUN: [47.50, 19.04],
  IDN: [-6.21, 106.85], IND: [28.61, 77.21], IRL: [53.35, -6.26], IRN: [35.69, 51.39],
  ISR: [31.77, 35.21], ITA: [41.90, 12.50], JOR: [31.95, 35.93], JPN: [35.68, 139.69],
  KAZ: [51.17, 71.43], KEN: [-1.29, 36.82], KGZ: [42.87, 74.59], KHM: [11.56, 104.92],
  KOR: [37.57, 126.98], KWT: [29.38, 47.98], LBN: [33.89, 35.50], LKA: [6.93, 79.86],
  LTU: [54.69, 25.28], LUX: [49.61, 6.13], LVA: [56.95, 24.11], MAR: [34.02, -6.84],
  MDA: [47.01, 28.86], MEX: [19.43, -99.13], MLI: [12.64, -8.00], MLT: [35.90, 14.51],
  MNE: [42.44, 19.26], MNG: [47.89, 106.91], MOZ: [-25.97, 32.57], MYS: [3.14, 101.69],
  NLD: [52.37, 4.90], NOR: [59.91, 10.75], NZL: [-41.29, 174.78], OMN: [23.59, 58.41],
  PAK: [33.68, 73.05], PHL: [14.60, 120.98], POL: [52.23, 21.01], PRT: [38.72, -9.14],
  PSE: [31.90, 35.20], ROU: [44.43, 26.10], RUS: [55.76, 37.62], RWA: [-1.94, 30.06],
  SAU: [24.71, 46.68], SGP: [1.35, 103.82], SRB: [44.79, 20.45], SVK: [48.15, 17.11],
  SVN: [46.06, 14.51], SWE: [59.33, 18.07], THA: [13.76, 100.50], TJK: [38.56, 68.79],
  TUN: [36.81, 10.18], TUR: [39.93, 32.86], TZA: [-6.79, 39.21], UGA: [0.35, 32.58],
  UKR: [50.45, 30.52], USA: [38.91, -77.04], VNM: [21.03, 105.85], ZAF: [-25.75, 28.19],
  ZWE: [-17.83, 31.05],
};

/** Great-circle distance in km between two [lat, lon] points. */
export function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
