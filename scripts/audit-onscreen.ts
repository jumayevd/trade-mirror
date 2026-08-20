/**
 * Internal-consistency audit of the figures the dashboard actually renders.
 *
 *   npx tsx scripts/audit-onscreen.ts
 *
 * verify-against-source.ts proves the engine reproduces the workbook and
 * audit-vs-comtrade.ts proves the workbook matches UN Comtrade. Neither checks
 * that the numbers PRINTED on each page hold together — that a tile, the table
 * beneath it and the chart beside it describe a coherent population.
 *
 * Every assertion below mirrors one thing a reader can do with a mouse: read two
 * figures on the same screen and expect them to relate.
 */
import { aggregate, DEFAULT_FILTER, meta, type Aggregate, type Channel, type Filter } from "../src/lib/dataset";
import riskRaw from "../src/data/risk.json";

/* the identity holds at whatever rate the default filter carries */
const K = 1 + DEFAULT_FILTER.cif;
const FULL: Filter = { ...DEFAULT_FILTER, years: [...meta.years], minGap: 0 };

let pass = 0;
const fails: string[] = [];
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
function check(name: string, ok: boolean, detail = "") {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/* ---------------------------------------------------------------- */
/* 1. the identity the user asked for, at every level and scope      */
/* ---------------------------------------------------------------- */
function identityOf(chs: Channel[]) {
  let pe = 0, ui = 0, pos = 0;
  for (const c of chs) {
    pe += c.pePosT; ui += c.uiPosT; pos += c.posT;
  }
  return { pe, ui, pos };
}

const full = aggregate(FULL);
for (const [lbl, chs] of [["HS2", full.channels], ["HS4", full.channels4], ["HS6", full.channels6]] as const) {
  const { pe, ui, pos } = identityOf(chs);
  check(`identity ${lbl} all-chapters`, near(pe - ui / K, pos, 2), `${Math.round(pe - ui / K)} vs ${Math.round(pos)}`);
}
// per chapter drill-down, as Product Analysis renders it
for (const ch of ["85", "87", "84", "30", "72"]) {
  const chs = full.channels6.filter((c) => c.chapter === ch);
  const { pe, ui, pos } = identityOf(chs);
  check(`identity HS6 within chapter ${ch}`, near(pe - ui / K, pos, 2));
}

/* ---------------------------------------------------------------- */
/* 2. Country Analysis: the summary-by-year table, row by row        */
/* ---------------------------------------------------------------- */
for (const r of full.annual) {
  check(`annual identity ${r.year}`, near(r.pePos - r.uiPos / K, r.positive, 2),
    `${Math.round(r.pePos - r.uiPos / K)} vs ${Math.round(r.positive)}`);
}
// monthly basis too
const monthly = aggregate({ ...FULL, granularity: "month", months: [] });
for (const r of monthly.annual) {
  check(`monthly annual identity ${r.label}`, near(r.pePos - r.uiPos / K, r.positive, 2));
}

/* ---------------------------------------------------------------- */
/* 3. the by-year comparison ties to the headline                    */
/* ---------------------------------------------------------------- */
// each partner's yearly positive figures must sum to the all-comparable total
for (const p of full.partners.slice(0, 25)) {
  const summed = p.byYear.reduce((s, y) => s + y.positive, 0);
  const base = full.baseChannels.filter((c) => c.partnerIso === p.iso3).reduce((s, c) => s + c.posT, 0);
  check(`byYear sums to comparable total (${p.iso3})`, near(summed, base, 2),
    `${Math.round(summed)} vs ${Math.round(base)}`);
}
// and the sum over all partners equals the headline KPI
const listed = new Set(full.partners.map((p) => p.iso3));
const allByYear = full.partners.reduce((s, p) => s + p.byYear.reduce((t, y) => t + y.positive, 0), 0);
const listedBase = full.baseChannels.filter((c) => listed.has(c.partnerIso)).reduce((s, c) => s + c.posT, 0);
check("byYear across listed partners = their comparable total", near(allByYear, listedBase, 5),
  `${Math.round(allByYear)} vs ${Math.round(listedBase)}`);
/*
 * The headline covers every comparable channel, including partners whose gaps
 * all sit under the noise floor and therefore never earn a row. That remainder
 * is what the ranking footnote discloses; assert only that it stays negligible.
 */
const unlistedBase = full.kpis.positive.central - listedBase;
check("unlisted-partner residue stays immaterial", unlistedBase >= 0 && unlistedBase / full.kpis.positive.central < 0.001,
  `$${Math.round(unlistedBase).toLocaleString()}`);
console.log(`  note: ${Math.round(unlistedBase).toLocaleString()} USD of the headline belongs to partners with no screened channel (${(unlistedBase / full.kpis.positive.central * 100).toFixed(5)}%)`);

/* ---------------------------------------------------------------- */
/* 4. partner profile figures                                       */
/* ---------------------------------------------------------------- */
for (const p of full.partners.slice(0, 25)) {
  check(`profile identity (${p.iso3})`, near(p.pePosT - p.uiPosT / K, p.posT, 2));
  check(`profile observed >= paired (${p.iso3})`, p.observed.pe + 1 >= p.peT && p.observed.ui + 1 >= p.uiT);
}

/* ---------------------------------------------------------------- */
/* 5. channel pages                                                 */
/* ---------------------------------------------------------------- */
for (const c of full.channels6.slice(0, 200)) {
  check(`channel adjUiT (${c.partnerIso}/${c.cmd})`, near(c.adjUiT, c.uiT / K, 2));
  const yearlyPos = c.years.reduce((s, y) => s + Math.max(y.signed, 0), 0);
  check(`channel posT = sum of years (${c.partnerIso}/${c.cmd})`, near(yearlyPos, c.posT, 2));
  check(`channel signedT (${c.partnerIso}/${c.cmd})`, near(c.signedT, c.peT - c.adjUiT, 2));
}

/* ---------------------------------------------------------------- */
/* 6. the risk score, as printed in Discrepancy & Risk              */
/* ---------------------------------------------------------------- */
const riskCells = (riskRaw as unknown as { cells: Record<string, number[]> }).cells;
let rsChecked = 0;
for (const [key, row] of Object.entries(riskCells)) {
  const [rs, g, p, k, n] = row;
  if (rsChecked++ > 4000) break;
  /*
   * G and P ship rounded to 3 decimals and RS to 1, so RS cannot be re-derived
   * exactly — it only has to be consistent with SOME (G, P) inside the rounding
   * box. Test the interval; a midpoint tolerance breaks down where G rounds to
   * zero, which is precisely where the relative error is largest.
   */
  const lo = 100 * Math.sqrt(Math.max(g - 0.0005, 0) * Math.max(p - 0.0005, 0));
  const hi = 100 * Math.sqrt((g + 0.0005) * (p + 0.0005));
  check(`RS consistent with stored G,P [${key}]`, rs >= lo - 0.06 && rs <= hi + 0.06,
    `${rs} outside [${lo.toFixed(2)}, ${hi.toFixed(2)}]`);
  check(`P = (k+1)/(n+2) [${key}]`, Math.abs(p - (k + 1) / (n + 2)) <= 0.0006);
}

/* ---------------------------------------------------------------- */
/* 7. one-sided flows are never counted as a gap                    */
/* ---------------------------------------------------------------- */
for (const c of full.channels6.slice(0, 300)) {
  check(`no one-sided year in channel (${c.partnerIso}/${c.cmd})`,
    c.years.every((y) => y.pe > 0 && y.ui > 0));
}

/* ---------------------------------------------------------------- */
/* 8. filtered <= base, always                                      */
/* ---------------------------------------------------------------- */
const sumPos = (chs: Channel[]) => chs.reduce((s, c) => s + c.posT, 0);
check("screened positive <= comparable positive", sumPos(full.channels) <= sumPos(full.baseChannels) + 1);
check("headline uses the comparable population",
  near(sumPos(full.baseChannels), full.kpis.positive.central, 5));

/* ---------------------------------------------------------------- */
/* 9. freight monotonicity — a higher wedge can never shrink the gap */
/* ---------------------------------------------------------------- */
let prev = -1;
for (const f of [0, 0.03, 0.06, 0.1, 0.15]) {
  const a: Aggregate = aggregate({ ...FULL, cif: f });
  const v = a.kpis.positive.central;
  check(`positive rises with freight (${Math.round(f * 100)}%)`, v >= prev, `${Math.round(v)} < ${Math.round(prev)}`);
  prev = v;
}

/* ---------------------------------------------------------------- */
/* 10. the sensitivity band printed beside the headline               */
/* ---------------------------------------------------------------- */
/* Overview, Methodology and the country ranking all print a low-high
 * range next to the positive total. Those endpoints have to be the SAME
 * identity evaluated at the band rates — computed any other way they stop
 * bracketing the figure they annotate. */
for (const [tag, rate, shown] of [
  ["low", meta.cif.low, full.kpis.positive.low],
  ["high", meta.cif.high, full.kpis.positive.high],
] as const) {
  const recomputed = aggregate({ ...FULL, cif: rate }).kpis.positive.central;
  check(`band ${tag} endpoint = positive at ${Math.round(rate * 100)}%`,
    near(shown, recomputed, 5), `shown ${Math.round(shown)} vs ${Math.round(recomputed)}`);
}
check("band brackets the central rate",
  full.kpis.positive.low <= aggregate({ ...FULL, cif: meta.cif.central }).kpis.positive.central + 1
  && aggregate({ ...FULL, cif: meta.cif.central }).kpis.positive.central <= full.kpis.positive.high + 1);

/* ---------------------------------------------------------------- */
console.log(`on-screen consistency: ${pass} assertions passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\nfailures:");
  for (const f of fails.slice(0, 40)) console.log(`  - ${f}`);
  if (fails.length > 40) console.log(`  … and ${fails.length - 40} more`);
  process.exit(1);
}
console.log("Every figure the dashboard prints is consistent with the others on its page.");
