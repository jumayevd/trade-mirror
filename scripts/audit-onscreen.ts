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
import fs from "node:fs";
import path from "node:path";
import {
  aggregate, DEFAULT_FILTER, loadMonthlyDetail, meta, monthlyOnlyYears, officialImportsOver, yearsFor,
  type Aggregate, type Channel, type Filter, type RiskBand,
} from "../src/lib/dataset";
import riskRaw from "../src/data/risk.json";
import diagRaw from "../src/data/diagnostics.json";
import { CONFIG_KEYS, chapterRollup, clustersOf, metaOf, partnerRollup } from "../src/lib/anomaly";

/* the monthly grain is gated on the detail layer, so the audit loads it the
 * way the client eventually does — without this, every monthly assertion below
 * would iterate zero rows and pass vacuously */
loadMonthlyDetail(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "public", "data", "monthly-hs6.json"), "utf8"),
));

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
/* 0. scores are never served from another period                    */
/* ---------------------------------------------------------------- */
/* Runs first, on a rate nothing below uses, so the score cache is cold — the
 * order the browser meets it in. The filter provider aggregates with no year
 * ticked (the workbook years) before any page does; a page on the whole
 * window must still get scores fitted on the whole window. P follows from a
 * row's own years, so a row scored on another period, or left unscored,
 * cannot match it. */
{
  const cold = 0.05;
  aggregate({ ...DEFAULT_FILTER, years: [], cif: cold });
  const whole = aggregate({ ...DEFAULT_FILTER, years: [...yearsFor("year")], cif: cold });
  for (const [lvl, rows] of [[2, whole.channels], [4, whole.channels4], [6, whole.channels6]] as const) {
    const off = rows.filter((c) =>
      Math.abs(c.persistence - Math.round(((c.posYears + 1) / (c.comparableYears + 2)) * 1000) / 1000) > 0.0005).length;
    check(`HS${lvl} scores fitted on the period in view after a workbook-years call`, off === 0, `${off} of ${rows.length} rows`);
  }
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
const riskConfig = (riskRaw as unknown as { config: { freight: number } }).config;
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
/* 6b. the live score reproduces the fit it was derived from        */
/* ---------------------------------------------------------------- */
/*
 * The dashboard now scores the period on screen rather than reading the index,
 * so the two constructions have to meet where they describe the same thing: the
 * whole annual window at the freight rate the index was fitted at. Any drift
 * here means the runtime path and the fitted model have diverged.
 */
{
  // the index is fitted on the annual window; the comparison pins those years
  // rather than inheriting the default window, which now runs past the fit
  const fitted = aggregate({ ...DEFAULT_FILTER, years: [...meta.years], cif: riskConfig.freight });
  const pairs: [Channel[], number][] = [[fitted.channels, 2], [fitted.channels4, 4], [fitted.channels6, 6]];
  let compared = 0, gDrift = 0, rsDrift = 0;
  for (const [cs, level] of pairs) {
    for (const c of cs) {
      const row = riskCells[`${level}|${c.partnerIso}|${c.cmd}`];
      if (!row) continue;
      const [rs, g, p] = row;
      compared++;
      gDrift = Math.max(gDrift, Math.abs(g - c.abnormalGap));
      rsDrift = Math.max(rsDrift, Math.abs(rs - c.mtrs));
      check(`P matches the fitted index [${level}|${c.partnerIso}|${c.cmd}]`,
        Math.abs(p - c.persistence) <= 0.0011, `${p} vs ${c.persistence}`);
    }
  }
  /*
   * G is a rank over the cells present, and the index also ranks the HS4 rollups
   * it derives itself, so the two cross-sections are not identical cell for cell.
   * The tolerance is on the rank, not on equality.
   */
  check("live G tracks the fitted G", gDrift <= 0.02, `max |dG| = ${gDrift.toFixed(4)}`);
  check("live RS tracks the fitted RS", rsDrift <= 1.5, `max |dRS| = ${rsDrift.toFixed(2)}`);
  console.log(`  note: live-vs-fitted compared ${compared.toLocaleString()} cells; max |dG| ${gDrift.toFixed(4)}, max |dRS| ${rsDrift.toFixed(2)}`);
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
/* 12. the unexplained-discrepancy section, every configuration     */
/* ---------------------------------------------------------------- */
/*
 * Four fitted configurations ship and the reader switches between them, so each
 * has to stand on its own: the tier a cluster carries must follow from its own
 * interval against its own threshold, and nothing may claim more precision than
 * shrinkage allows.
 */
for (const key of CONFIG_KEYS) {
  const m = metaOf(key);
  const cs = clustersOf(key);
  check(`[${key}] cluster count matches its metadata`, cs.length === m.clusters,
    `${cs.length} vs ${m.clusters}`);
  check(`[${key}] tier counts match the cluster list`,
    cs.filter((c) => c.tier === 1).length === m.tier1
    && cs.filter((c) => c.tier === 2).length === m.tier2);
  let bad = 0;
  for (const c of cs) {
    const expect = c.nObs === 1 ? 3 : c.lo90 >= m.threshold ? 1 : c.uHat >= m.threshold ? 2 : 0;
    if (c.tier !== expect || c.lo90 > c.uHat || c.shrinkage < 0 || c.shrinkage > 1) bad++;
  }
  check(`[${key}] every cluster obeys the two-tier rule and its interval bounds`, bad === 0,
    `${bad} of ${cs.length} clusters violate it`);
  // a Confirmed cluster whose interval sits below the line would name a country wrongly
  const wrong = cs.filter((c) => c.tier === 1 && c.lo90 < m.threshold).length;
  check(`[${key}] no Confirmed cluster has an interval below the threshold`, wrong === 0);
  check(`[${key}] rho is a share`, m.rho > 0 && m.rho < 1, `${m.rho}`);
  check(`[${key}] the model converged`, m.converged);

  /*
   * The ranked table and the partner rollup must cover the same population at the
   * data layer. This does not reach the view — the defect it is named for was a
   * display filter, `clusters >= 10`, which dropped the highest-scoring Confirmed
   * row out of its own rollup and which no data-level assertion can see. What
   * this pins is the layer underneath: if the two populations ever diverge in the
   * export, the view cannot paper over it.
   */
  const rollupPartners = new Set(partnerRollup(key).map((r) => r.iso));
  const rankedPartners = new Set(cs.filter((c) => c.tier !== 3).map((c) => c.iso));
  const orphans = [...rankedPartners].filter((iso) => !rollupPartners.has(iso));
  check(`[${key}] every ranked partner appears in the partner rollup`, orphans.length === 0,
    `missing: ${orphans.slice(0, 6).join(", ")}`);

  const rollupChapters = new Set(chapterRollup(key).map((r) => r.hs2));
  const rankedChapters = new Set(cs.filter((c) => c.tier !== 3).map((c) => c.code.slice(0, 2)));
  const chOrphans = [...rankedChapters].filter((h) => !rollupChapters.has(h));
  check(`[${key}] every ranked chapter appears in the sector rollup`, chOrphans.length === 0,
    `missing: ${chOrphans.slice(0, 6).join(", ")}`);

  check(`[${key}] the rollup count matches the metadata`,
    rollupPartners.size === m.partnersScored, `${rollupPartners.size} vs ${m.partnersScored}`);
}

/* ---------------------------------------------------------------- */
/* the small-cell flag names the same cells the index counts as small  */
/* ---------------------------------------------------------------- */
/* The flag is a label, never a filter: it tells a reader that a row scoring
 * high on a scale-free rate is a small flow. It is only worth trusting if it
 * marks exactly the cells the fitted index measured as below the floor, so it
 * is computed the same way — mean annual (pe + ui) / 2 over comparable years,
 * pre-freight — against the floor the index published. These assertions fail
 * if either definition drifts from the other. */
{
  const coverage = (diagRaw as unknown as {
    coverage: Record<string, { belowFloor: number }>;
  }).coverage;
  const levels: [number, Channel[]][] = [
    [2, full.baseChannels], [4, full.baseChannels4], [6, full.baseChannels6],
  ];
  for (const [lvl, chs] of levels) {
    const flagged = chs.filter((c) => c.flags.includes("small-cell")).length;
    const fitted = coverage[String(lvl)]?.belowFloor;
    check(`HS${lvl} small-cell flags match the fitted index's below-floor count`,
      flagged === fitted, `${flagged} flagged vs ${fitted} counted`);
  }
  // a label must not remove a row: every positive-gap channel is still ranked
  for (const [lvl, base] of levels) {
    const ranked = lvl === 2 ? full.channels : lvl === 4 ? full.channels4 : full.channels6;
    check(`HS${lvl} the small-cell flag hides nothing`,
      ranked.length === base.filter((c) => c.posT > 0).length,
      `${ranked.length} ranked vs ${base.filter((c) => c.posT > 0).length} with a positive gap`);
  }
}

/* ---------------------------------------------------------------- */
/* one grain: every level reports the same money                       */
/* ---------------------------------------------------------------- */
/* The discrepancy is measured per partner × HS6 × period and coarser levels
 * aggregate it, so the positive total, the reverse total and the comparable
 * value totals must be identical at HS2, HS4 and HS6 — the defect this grain
 * exists to prevent is three totals from one dataset. Checked at two freight
 * rates so a re-derivation hiding in one branch cannot pass at the other. */
for (const cif of [0, 0.10]) {
  const a = aggregate({ ...FULL, cif });
  const sum = (chs: Channel[], k: "posT" | "revT" | "peT" | "uiT") => chs.reduce((s, c) => s + c[k], 0);
  for (const k of ["posT", "revT", "peT", "uiT"] as const) {
    const two = sum(a.baseChannels, k), four = sum(a.baseChannels4, k), six = sum(a.baseChannels6, k);
    check(`${k} identical across levels at ${Math.round(cif * 100)}%`,
      near(two, six, 5) && near(four, six, 5), `${Math.round(two)} / ${Math.round(four)} / ${Math.round(six)}`);
  }
  check(`the headline is the level-independent total (${Math.round(cif * 100)}%)`,
    near(a.kpis.positive.central, sum(a.baseChannels6, "posT"), 5));
}

/* ---------------------------------------------------------------- */
/* derived years: the annualized layer IS the monthly fold              */
/* ---------------------------------------------------------------- */
/* 2025 and 2026 reach the yearly basis from a build-time annualization of the
 * monthly HS6 book. The client folding those same months live must land on the
 * same figures to the dollar, or the two vintage paths have diverged. */
{
  check("there are derived years to audit", monthlyOnlyYears.length > 0,
    String(monthlyOnlyYears.length));
  for (const y of monthlyOnlyYears) {
    const yearly = aggregate({ ...DEFAULT_FILTER, years: [y], minGap: 0 });
    const folded = aggregate({ ...DEFAULT_FILTER, granularity: "month", years: [y], months: [], minGap: 0 });
    check(`derived ${y}: positive equals the monthly fold`,
      near(yearly.kpis.positive.central, folded.kpis.positive.central, 1),
      `${Math.round(yearly.kpis.positive.central)} vs ${Math.round(folded.kpis.positive.central)}`);
    const v = (a: Aggregate) => a.baseChannels6.reduce((t, c) => t + c.peT + c.uiT, 0);
    check(`derived ${y}: comparable value equals the monthly fold`, near(v(yearly), v(folded), 1));
  }
  // and the monthly series must actually have rows — the vacuous-pass trap
  const m = aggregate({ ...FULL, granularity: "month", months: [] });
  check("the monthly series is populated under the audit", m.annual.length > 0, String(m.annual.length));
}

/* ---------------------------------------------------------------- */
/* official imports: the stat.uz context figures                       */
/* ---------------------------------------------------------------- */
/* The overview quotes Uzbekistan's actual imports from the statistics office.
 * Two things must hold: the sum covers every selected year (or the cards do
 * not render at all — asserted by non-null), and the official series is the
 * same order of magnitude as the mirror's UZB-recorded imports over the same
 * years. The sources genuinely differ by revisions and coverage, but past a
 * few percent the likeliest cause is a units mistake in the data file, which
 * this fails loudly. */
{
  const official = officialImportsOver(DEFAULT_FILTER.years);
  check("official imports cover the default window", official !== null);
  if (official) {
    check("the running year is cut to the mirror book's reach",
      official.partial !== null && official.partial.year === 2026 && official.partial.throughMonth >= 1 && official.partial.throughMonth <= 12,
      JSON.stringify(official.partial));
    const annualOnly = officialImportsOver([...meta.years]);
    const mirrorUi = aggregate({ ...FULL }).observed.ui;
    check("official and mirror imports agree within 5% over the annual window",
      annualOnly !== null && Math.abs(annualOnly.usd - mirrorUi) / mirrorUi < 0.05,
      `official ${annualOnly ? Math.round(annualOnly.usd) : "null"} vs mirror ${Math.round(mirrorUi)}`);
  }
}

/* ---------------------------------------------------------------- */
/* Country Analysis and the country page: what those screens print     */
/* ---------------------------------------------------------------- */
/* Every figure on the ranking row, the comparison card, the six frames and
 * the HS6 table is pinned here, at two freight rates:
 *   - Export − Import ÷ (1 + f) = Positive discrepancy, per partner row and
 *     per HS6 row (the columns are positive-line values precisely so this holds)
 *   - the country page's frames equal the sum of its table rows
 *   - an HS2 chapter and an HS4 heading, for a partner, equal the sum of their
 *     HS6 rows — the "derived from HS6" guarantee the table's filters rely on
 *   - the ranking's totals row equals the sum of its partner rows
 *   - a product's band is the same whether the country filter is on or off, so
 *     the comparison card's critical count and the country page's agree
 *   - the Top HS6 cell is the partner's HS6 line with the largest gap */
for (const cif of [0, 0.10]) {
  const Kc = 1 + cif;
  // the window both screens open on: every year the picker offers, derived ones included
  const ranked = aggregate({ ...FULL, years: [...yearsFor("year")], cif, rollupLevel: 6 });
  const tag = `${Math.round(cif * 100)}%`;
  let rowFails = 0, sumFails = 0, derivFails = 0, bandFails = 0, topFails = 0, checked = 0;
  // ranking totals
  const tPe = ranked.partners.reduce((a, p) => a + p.pePosT, 0);
  const tPos = ranked.partners.reduce((a, p) => a + p.posT, 0);
  check(`ranking totals: export = sum of partner rows (${tag})`,
    near(tPe, ranked.baseChannels6.reduce((a, c) => a + c.pePosT, 0), 5));
  check(`ranking totals: positive = headline (${tag})`, near(tPos, ranked.kpis.positive.central, 5));

  // the six largest partners get the full per-page treatment
  for (const p of [...ranked.partners].sort((a, b) => b.posT - a.posT).slice(0, 6)) {
    checked++;
    if (!near(p.pePosT - p.uiPosT / Kc, p.posT, 2)) rowFails++;
    const page = aggregate({ ...FULL, years: [...yearsFor("year")], cif, country: [p.iso3] });
    const pp = page.partners.find((x) => x.iso3 === p.iso3)!;
    const rows = page.baseChannels6.filter((c) => c.partnerIso === p.iso3);
    const sum = (k: "pePosT" | "uiPosT" | "posT") => rows.reduce((a, c) => a + c[k], 0);
    if (!(near(sum("pePosT"), pp.pePosT, 2) && near(sum("uiPosT"), pp.uiPosT, 2) && near(sum("posT"), pp.posT, 2))) sumFails++;
    // the same partner, same period: page and ranking must agree
    if (!near(pp.posT, p.posT, 2)) sumFails++;
    for (const r of rows) if (!near(r.pePosT - r.uiPosT / Kc, r.posT, 2)) rowFails++;
    // HS2 and HS4, derived from HS6
    for (const [level, chans] of [[2, page.baseChannels], [4, page.baseChannels4]] as const) {
      for (const agg of chans.filter((c) => c.partnerIso === p.iso3)) {
        const kids = rows.filter((r) => r.cmd.startsWith(agg.cmd));
        const d = (k: "pePosT" | "uiPosT" | "posT") => Math.abs(kids.reduce((a, c) => a + c[k], 0) - agg[k]);
        if (d("pePosT") > 2 || d("uiPosT") > 2 || d("posT") > 2) derivFails++;
        void level;
      }
    }
    // bands: filtered page vs unfiltered ranking
    const global = new Map(ranked.baseChannels6.filter((c) => c.partnerIso === p.iso3).map((c) => [c.cmd, c.band]));
    for (const r of rows) if (global.get(r.cmd) !== r.band) bandFails++;
    // one product count on every screen: ranking column, comparison card, page frame
    if (global.size !== rows.length) bandFails++;
    // top HS6 is the largest positive line
    const top = rows.reduce((b, c) => (c.posT > (b?.posT ?? 0) ? c : b), null as Channel | null);
    const maxPos = Math.max(0, ...rows.map((r) => r.posT));
    if (!top || !near(top.posT, maxPos, 0)) topFails++;
  }
  check(`Export − Import ÷ (1+f) = positive, partner and HS6 rows (${tag}, ${checked} partners)`, rowFails === 0, `${rowFails} rows off`);
  check(`country page frames = sum of its HS6 rows, and = the ranking row (${tag})`, sumFails === 0, `${sumFails} off`);
  check(`HS2 and HS4 figures are the sums of their HS6 rows (${tag})`, derivFails === 0, `${derivFails} codes off`);
  check(`bands agree with and without the country filter (${tag})`, bandFails === 0, `${bandFails} lines differ`);
  check(`Top HS6 is the partner's largest positive line (${tag})`, topFails === 0);
}

/* ---------------------------------------------------------------- */
/* Discrepancy & Risk: the frames and the products ranking             */
/* ---------------------------------------------------------------- */
/* The page lists every pair with a positive discrepancy at the active level.
 *   - every listed row: Export − Import ÷ (1 + f) = Positive discrepancy
 *   - an HS2 or HS4 row's Export, Import and discrepancy = the sums of the
 *     HS6 products beneath it, for the same partner
 *   - the three levels list the same trade: equal Export, Import and
 *     discrepancy totals
 *   - the four band frames add up to the rows listed, and the score frames
 *     bracket every scored row */
for (const cif of [0, 0.10]) {
  const Kc = 1 + cif;
  const tag = `${Math.round(cif * 100)}%`;
  // the filter provider asks for its series with no year ticked (the workbook
  // years) before any page aggregates; that call must not leave its scores
  // behind for the whole-window view below
  aggregate({ ...DEFAULT_FILTER, years: [], cif });
  const q = aggregate({ ...DEFAULT_FILTER, years: [...yearsFor("year")], cif });
  const byLevel = [[2, q.channels], [4, q.channels4], [6, q.channels6]] as const;
  const hs6 = new Map<string, Channel[]>();
  for (const c of q.baseChannels6) {
    for (const k of [`${c.partnerIso}|${c.cmd.slice(0, 2)}`, `${c.partnerIso}|${c.cmd.slice(0, 4)}`]) {
      (hs6.get(k) ?? hs6.set(k, []).get(k)!).push(c);
    }
  }
  const totals: Record<number, [number, number, number]> = {};
  for (const [lvl, rows] of byLevel) {
    let rowFails = 0, derivFails = 0, bracketFails = 0, scoreFails = 0;
    const counts = { critical: 0, high: 0, elevated: 0, low: 0 } as Record<RiskBand, number>;
    const scored = rows.filter((c) => c.scored).map((c) => c.mtrs);
    const hi = Math.max(...scored), lo = Math.min(...scored);
    for (const c of rows) {
      counts[c.band]++;
      if (!(c.posT > 0)) rowFails++;
      if (!near(c.pePosT - c.uiPosT / Kc, c.posT, 2)) rowFails++;
      if (c.scored && (c.mtrs > hi || c.mtrs < lo)) bracketFails++;
      // the score was fitted on this row's own period: P follows from its years
      if (!near(c.persistence, Math.round(((c.posYears + 1) / (c.comparableYears + 2)) * 1000) / 1000, 0.0005)) scoreFails++;
      if (lvl !== 6) {
        const kids = hs6.get(`${c.partnerIso}|${c.cmd}`) ?? [];
        const d = (k: "pePosT" | "uiPosT" | "posT") => Math.abs(kids.reduce((a, x) => a + x[k], 0) - c[k]);
        if (kids.length === 0 || d("pePosT") > 2 || d("uiPosT") > 2 || d("posT") > 2) derivFails++;
      }
    }
    totals[lvl] = [
      rows.reduce((a, c) => a + c.pePosT, 0),
      rows.reduce((a, c) => a + c.uiPosT, 0),
      rows.reduce((a, c) => a + c.posT, 0),
    ];
    check(`risk page HS${lvl}: Export − Import ÷ (1+f) = positive on every listed row (${tag}, ${rows.length} rows)`, rowFails === 0, `${rowFails} rows off`);
    if (lvl !== 6) check(`risk page HS${lvl}: rows are the sums of their HS6 products (${tag})`, derivFails === 0, `${derivFails} rows off`);
    check(`risk page HS${lvl}: band frames add up to the rows listed (${tag})`,
      counts.critical + counts.high + counts.elevated + counts.low === rows.length);
    check(`risk page HS${lvl}: highest/lowest frames bracket every scored row (${tag})`, scored.length > 0 && bracketFails === 0);
    check(`risk page HS${lvl}: every row is scored on the period in view (${tag})`, scoreFails === 0, `${scoreFails} rows carry another period's score`);
  }
  for (const i of [0, 1, 2]) {
    check(`risk page: HS2, HS4 and HS6 list the same trade (${tag}, ${["export", "import", "positive"][i]})`,
      near(totals[2][i], totals[6][i], 5) && near(totals[4][i], totals[6][i], 5));
  }
  check(`risk page: positive total = the headline (${tag})`, near(totals[6][2], q.kpis.positive.central, 5));
}

/* ---------------------------------------------------------------- */
/* Product Analysis: frames and the per-code table                     */
/* ---------------------------------------------------------------- */
/* The page groups the listed partner × code pairs by code at each level.
 *   - every row: Export − Import ÷ (1 + f) = Positive discrepancy
 *   - an HS2 row = the sum of its HS4 rows = the sum of its HS6 rows, on all
 *     three values, and on the partner count (partners with a positive line)
 *   - the frames (sum of the rows) are the same at HS2, HS4 and HS6, and
 *     equal the headline positive discrepancy */
{
  type Row = { pe: number; ui: number; pos: number; partners: Set<string>; mtrs: number };
  const byCode = (chs: Channel[]) => {
    const m = new Map<string, Row>();
    for (const c of chs) {
      const r = m.get(c.cmd) ?? m.set(c.cmd, { pe: 0, ui: 0, pos: 0, partners: new Set(), mtrs: -1 }).get(c.cmd)!;
      r.pe += c.pePosT; r.ui += c.uiPosT; r.pos += c.posT; r.partners.add(c.partnerIso);
      r.mtrs = Math.max(r.mtrs, c.mtrs);
    }
    return m;
  };
  const windows: [string, number[]][] = [["newest year", [...DEFAULT_FILTER.years]], ["2017–2026", [...yearsFor("year")]]];
  for (const [wname, years] of windows) {
    for (const cif of [0, 0.10]) {
      const Kc = 1 + cif;
      const tag = `${wname}, ${Math.round(cif * 100)}%`;
      const d = aggregate({ ...DEFAULT_FILTER, years, cif });
      const levels = [[2, byCode(d.channels)], [4, byCode(d.channels4)], [6, byCode(d.channels6)]] as const;
      let rowFails = 0, derivFails = 0;
      const tot: number[][] = [];
      for (const [lvl, rows] of levels) {
        let pe = 0, ui = 0, pos = 0;
        for (const r of rows.values()) {
          if (!near(r.pe - r.ui / Kc, r.pos, 2)) rowFails++;
          pe += r.pe; ui += r.ui; pos += r.pos;
        }
        tot.push([pe, ui, pos]);
        if (lvl === 6) continue;
        for (const [cmd, r] of rows) {
          for (const [, finer] of levels.filter(([l]) => l > lvl)) {
            let fpe = 0, fui = 0, fpos = 0;
            const fp = new Set<string>();
            for (const [k, x] of finer) if (k.startsWith(cmd)) { fpe += x.pe; fui += x.ui; fpos += x.pos; x.partners.forEach((p) => fp.add(p)); }
            if (!near(fpe, r.pe, 2) || !near(fui, r.ui, 2) || !near(fpos, r.pos, 2) || fp.size !== r.partners.size) derivFails++;
          }
        }
      }
      check(`products: Export − Import ÷ (1+f) = positive on every row (${tag})`, rowFails === 0, `${rowFails} rows off`);
      check(`products: HS2 rows = sums of their HS4 and HS6 rows, partners included (${tag})`, derivFails === 0, `${derivFails} rows off`);
      for (const i of [0, 1, 2]) {
        check(`products: frames equal at HS2, HS4 and HS6 (${tag}, ${["export", "import", "positive"][i]})`,
          near(tot[0][i], tot[2][i], 5) && near(tot[1][i], tot[2][i], 5));
      }
      check(`products: positive frame = the headline (${tag})`, near(tot[2][2], d.kpis.positive.central, 5));
    }
  }
}

/* ---------------------------------------------------------------- */
/* Data Quality table and Methodology's product coverage               */
/* ---------------------------------------------------------------- */
/* The table lists partners with at least one reported year in the window:
 *   - coverage = reported years ÷ window years, exactly what the marks show
 *   - the last reported year is the latest mark, and a lapsed partner has
 *     none after it; lapse and tier follow the workbook rule on those years
 * The chart counts partner × code pairs with data per year:
 *   - an HS2 or HS4 pair has data in a year exactly when one of its HS6
 *     lines does, and the partner-reported value is equal at every level */
{
  const W = yearsFor("year");
  const listed = meta.partners.filter((p) => p.reportedYears.length > 0);
  let bad = 0;
  for (const p of listed) {
    const r = p.reportedYears;
    const last = r[r.length - 1];
    const lapse = last < meta.window.end;
    const tier = p.coverage >= 0.8 && !lapse ? "High" : p.coverage >= 0.5 && !lapse ? "Medium" : "Low";
    if (r.some((y) => !W.includes(y))) bad++;
    if (p.coverage !== r.length / W.length || p.lastReportedYear !== last || p.lapse !== lapse || p.tier !== tier) bad++;
    if (!near(r.length, new Set(r).size, 0)) bad++;
  }
  check(`quality table: coverage, last year, lapse and tier follow the marks (${listed.length} partners)`, bad === 0, `${bad} partners off`);
  check("quality table: every partner with a mark is listed, none without",
    listed.length + meta.partners.filter((p) => p.reportedYears.length === 0).length === meta.partners.length && listed.length > 0);

  const whole = aggregate({ ...DEFAULT_FILTER, years: [...W], minGap: 0 });
  const perYear = (chs: Channel[]) => {
    const m = new Map<number, { n: number; pe: number }>();
    for (const c of chs) for (const y of c.years) {
      const e = m.get(y.y) ?? m.set(y.y, { n: 0, pe: 0 }).get(y.y)!;
      e.n++; e.pe += y.pe;
    }
    return m;
  };
  const lv = { 2: perYear(whole.baseChannels), 4: perYear(whole.baseChannels4), 6: perYear(whole.baseChannels6) };
  for (const y of W) {
    for (const d of [2, 4] as const) {
      const keys = new Set<string>();
      for (const c of whole.baseChannels6) if (c.years.some((x) => x.y === y)) keys.add(`${c.partnerIso}|${c.cmd.slice(0, d)}`);
      check(`product coverage ${y}: HS${d} pairs = distinct HS6 prefixes with data`, (lv[d].get(y)?.n ?? 0) === keys.size,
        `${lv[d].get(y)?.n ?? 0} vs ${keys.size}`);
      check(`product coverage ${y}: HS${d} value = HS6 value`, near(lv[d].get(y)?.pe ?? 0, lv[6].get(y)?.pe ?? 0, 5));
    }
  }
}

/* ---------------------------------------------------------------- */
console.log(`on-screen consistency: ${pass} assertions passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\nfailures:");
  for (const f of fails.slice(0, 40)) console.log(`  - ${f}`);
  if (fails.length > 40) console.log(`  … and ${fails.length - 40} more`);
  process.exit(1);
}
console.log("Every figure the dashboard prints is consistent with the others on its page.");
