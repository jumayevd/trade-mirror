import { EvidenceLadder } from "@/components/ui";
import { aggregate, DEFAULT_FILTER, meta, DATA_VERSION, METHODOLOGY_VERSION } from "@/lib/dataset";
import { fmtUSD, fmtPct } from "@/lib/format";
import { Cite, REFERENCES } from "@/lib/references";

export const metadata = { title: "Methodology — Trade Mirror" };

const FULL = aggregate({ ...DEFAULT_FILTER, from: meta.window.start, to: meta.window.end, stage: "comparable", minGap: 0 });

/* ---- Modernist primitives: rule-separated stack, mono formula blocks ---- */

const RULE_1 = "1px solid rgba(32,30,29,.2)";
const RULE_ROW = "1px solid rgba(32,30,29,.14)";
const MUTED = "rgba(32,30,29,.7)";

function Section({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ padding: "14px 0", borderBottom: last ? undefined : RULE_1 }}>
      <div className="lbl">{label}</div>
      {children}
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="tabular"
      style={{ margin: "8px 0 0", border: "1px solid rgba(32,30,29,.4)", padding: "10px 12px", fontSize: 13, lineHeight: 1.7, overflowX: "auto" }}
    >
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: "8px 0 0", fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>{children}</p>;
}

const TH = "pb-[7px] pr-2.5 pt-[7px] text-left align-middle text-[10px] font-semibold uppercase tracking-[.1em] text-[rgba(32,30,29,.55)] whitespace-nowrap";
const TD = "py-[9px] pr-2.5 align-top text-[12.5px]";

/* ---- content (unchanged in substance — presentational re-homing only) ---- */

const DEFINITIONS: [string, string][] = [
  ["Reported flow", "A value one side actually submitted to UN Comtrade for a country-year-product."],
  ["Expected import CIF", "Partner export FOB × (1 + freight rate) — the partner's figure brought to an approximate import valuation basis."],
  ["Signed discrepancy", "Expected import CIF − Uzbekistan's recorded import CIF."],
  ["Positive discrepancy", "max(signed, 0): the partner reports more than Uzbekistan records."],
  ["Reverse discrepancy", "max(−signed, 0): Uzbekistan records more than the partner reports."],
  ["Absolute discrepancy", "Positive + reverse — the total two-sided asymmetry."],
  ["Bounded asymmetry %", "Absolute discrepancy ÷ max(expected CIF, UZB imports); bounded 0–100% for non-negative flows."],
  ["Residual unexplained discrepancy", "A comparable discrepancy that survives the basic checks: not transit-dominated, not a residual HS code, at least two comparable years, and sign-stable across the 6–15% freight band."],
  ["Robustness", "Whether the finding survives changes in assumptions (freight rate, coverage, data availability)."],
];

const CAUSES: [string, React.ReactNode][] = [
  ["CIF/FOB valuation", "Imports include freight and insurance; exports don't. Adjusted by the freight scenario — the one methodological assumption, shown as a 6–15% band."],
  ["Time lag", "Goods shipped in December may clear customs in January; annual data cuts across this."],
  ["Origin vs consignment", "Uzbekistan attributes imports to country of origin; hubs report re-exports by consignment — routed goods legitimately diverge."],
  ["Re-export & transit", <>Goods passing through third countries can appear in one mirror and not the other.<Cite ids={["ferrantino2008"]} /></>],
  ["Trade system differences", "General vs special trade system boundaries differ between reporters."],
  ["HS classification", "The two sides can classify the same good under different codes, especially near similar headings."],
  ["Confidentiality & residual codes", "Some exporters report sensitive trade under residual codes (HS 98–99) that can never be matched product-by-product."],
  ["Coverage & reporting quality", <>A partner that reports late, partially or not at all creates gaps that are data artifacts, not trade.<Cite ids={["yeats1990"]} /></>],
];

const SCORE_A: [string, string, React.ReactNode][] = [
  ["Magnitude", "35%", "log₁₀-scaled residual discrepancy with fixed anchors ($1M → 0, $10B → 1)."],
  ["Relative size", "25%", "Bounded asymmetry — a 90%-missing flow outranks a 10%-missing one of equal size."],
  ["Persistence", "20%", "Share of comparable years in the same direction plus longest streak, shrunk when fewer than 3 years exist."],
  ["Dynamics", "10%", <>Sustained growth of the discrepancy (recent vs early mean), not a single spike.<Cite ids={["fisman2004"]} /></>],
  ["Value/quantity anomaly", "10%", <>Unit-value divergence where both sides report weight; when weight is missing the remaining weights are renormalized.<Cite ids={["javorcik2008"]} /></>],
];
const SCORE_E: [string, string, React.ReactNode][] = [
  ["Both-side coverage", "25%", "Comparable years ÷ years in the selected period; missing-as-zero is never allowed."],
  ["Reporter reliability", "20%", "Partner's reporting coverage across the window, halved after a reporting stop."],
  ["HS comparability", "15%", "Residual codes score 0; regular codes 0.8 pending the HS-concordance dataset (single-revision extract)."],
  ["Weight/quantity evidence", "15%", "Share of years with comparable physical measures on both sides."],
  ["Freight robustness", "10%", "Sign stable across the 6–15% band."],
  ["Transit exposure", "10%", "Direct partners score above transit-sensitive hubs."],
  ["Residual/noise penalty", "5%", "Residual chapters and sub-$1M channels are down-weighted."],
];

const MATRIX = [
  ["High anomaly", "High evidence", "Investigate", "Strongest open-data signal; priority for further statistical or customs review."],
  ["High anomaly", "Low evidence", "Verify data first", "Check statistical comparability before interpreting."],
  ["Low anomaly", "High evidence", "Monitor", "Good data, anomaly not yet strong."],
  ["Low anomaly", "Low evidence", "Low priority", "Not usable for substantive conclusions."],
  ["Any", "Transit-sensitive", "Transit-sensitive", "Shown separately; never mixed into core results."],
];

const FORBIDDEN: [string, string][] = [
  ["“The shadow economy equals X”", "“The sum of positive statistical asymmetries is X under the selected scenario.”"],
  ["“Undeclared imports of X”", "“Positive residual unexplained discrepancy of X.”"],
  ["“Country/product is involved in smuggling”", "“The channel is a high priority for further review.”"],
  ["“Confirmed under-valuation”", "“The unit-value pattern is consistent with a possible valuation difference.”"],
  ["“Budget losses equal gap × tax rate”", "“A fiscal estimate is impossible without rates, exemptions, tax bases and verified declarations.”"],
];

/* Formula index — the reverse lookup from every figure the interface shows.  */
/* X = partner export FOB, M = UZB import CIF, f = freight rate.              */
const FORMULA_INDEX: { metric: string; where: string; formula: string; ref: string }[] = [
  { metric: "Residual unexplained discrepancy", where: "Overview headline", formula: "Σ max(X·(1+f) − M, 0), residual stage", ref: "§2.1" },
  { metric: "Share of comparable trade", where: "Overview headline", formula: "positive ÷ Σ X", ref: "§2.2" },
  { metric: "Freight band", where: "Overview · sensitivity strip", formula: "positive at f ∈ {6%, 10%, 15%}", ref: "§2.3" },
  { metric: "Comparable trade", where: "Overview · Countries", formula: "Σ X over channels where both sides reported", ref: "§1.2" },
  { metric: "Gap rate", where: "Countries · Products", formula: "positive ÷ (X·(1+f))", ref: "§2.2" },
  { metric: "Bounded asymmetry", where: "Queue column “Asym”", formula: "absolute ÷ max(X·(1+f), M)", ref: "§2.2" },
  { metric: "Anomaly strength", where: "Queue column A", formula: "0.35·mag + 0.25·rel + 0.20·pers + 0.10·dyn + 0.10·uv", ref: "§4" },
  { metric: "Evidence quality", where: "Queue column E", formula: "0.25·cov + 0.20·rel + 0.15·hs + 0.15·wgt + 0.10·frt + 0.10·trn + 0.05·res", ref: "§5" },
  { metric: "Signal class", where: "Queue column Class", formula: "A ≥ 55 ∧ E ≥ 60 → Investigate; transit hubs classified apart", ref: "§6" },
  { metric: "Robustness", where: "Queue column Robustness", formula: "sign stability over f, comparable years, coverage flags", ref: "§6" },
  { metric: "Partner-year coverage", where: "Overview · Data quality", formula: "reported partner-years ÷ possible partner-years", ref: "§7.1" },
  { metric: "Concentration / HHI", where: "Overview · Queue", formula: "Σ (channel share)² × 10,000", ref: "§9" },
];

export default function MethodologyPage() {
  const k = FULL.kpis;
  const funnelRows: { label: string; count: number; value: number | null; note: string }[] = [
    {
      label: "Comparable channels",
      count: FULL.funnel.comparableChannels,
      value: FULL.funnel.comparableValue,
      note: "partner × HS2 channels where both sides reported (value = partner exports)",
    },
    {
      label: "Residual unexplained",
      count: FULL.funnel.residualChannels,
      value: FULL.funnel.residualValue,
      note: "pass the transit, residual-code, coverage and freight checks (value = positive discrepancy)",
    },
    {
      label: "Robust residual signals",
      count: k.robustSignals,
      value: null,
      note: "HS6 channels classified Investigate whose sign holds across the whole freight band",
    },
  ];
  const funnelMax = Math.max(...funnelRows.map((r) => r.value ?? 0), 1);

  return (
    <div style={{ padding: "24px 28px 40px", maxWidth: 960 }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Methodology</h1>
      <p style={{ margin: "4px 0 0", fontSize: 13, lineHeight: 1.55, color: "rgba(32,30,29,.68)" }}>
        Methodology v{METHODOLOGY_VERSION} · data {DATA_VERSION}. Every figure in the interface carries the
        section reference of the formula that produced it; the index below is the reverse lookup.
      </p>
      <p style={{ margin: "10px 0 0", maxWidth: "46rem", fontSize: 13, lineHeight: 1.55, color: MUTED }}>
        Every trade flow is recorded at least twice — as a partner&apos;s export and as Uzbekistan&apos;s
        import. After a freight adjustment the two should roughly agree; where they don&apos;t, a mirror
        discrepancy appears. This site measures those discrepancies, tests their robustness and data
        quality, and ranks channels for further review<Cite ids={["bhagwati1964", "imf2023"]} />. A
        discrepancy — however large — is a screening signal: it shows where to look, never what happened.
      </p>

      <div style={{ marginTop: 22, borderTop: "2px solid rgba(32,30,29,.4)" }}>
        <Section label="§1 — Scope & the evidence ladder">
          <P>
            Mirror discrepancies are one open-data input into research on unrecorded trade and the shadow
            economy in Uzbekistan — they can flag where recorded trade diverges from partner records, and
            under which assumptions that divergence is robust. Structural estimates of the shadow economy
            itself require different methods (MIMIC and related latent-variable models), and a mirror gap
            must never be read as a measure of the shadow economy&apos;s size
            <Cite ids={["medina2018", "carrere2015"]} />. This platform therefore reports discrepancies,
            their robustness and the quality of the underlying data — not a shadow-economy estimate.
          </P>
          <div style={{ marginTop: 10 }}>
            <EvidenceLadder />
          </div>
          <P>
            Open trade data supports levels 1–3: observed values, comparable pairs and residual unexplained
            discrepancies. Level 4 (behavioural evidence — tariff-incentive and misclassification tests) is
            planned once a reliable HS6 tariff dataset is added
            <Cite ids={["fisman2004", "javorcik2008"]} />. Level 5 (verified non-compliance) requires
            declarations, audits or administrative decisions and is <em>never</em> claimed on this site.
          </P>
          <Formula>§1.2 · comparable_trade = Σ partner_export_fob over channels where BOTH sides reported</Formula>
          <P>
            Comparable trade is the denominator of every share on this site. Observations enter the mirror
            comparison only for country-years where the respective side actually reported — missing data is
            never treated as a zero flow.
          </P>
        </Section>

        <Section label="§2.1 — Core identities">
          <Formula>
            expected_import_cif = partner_export_fob × (1 + freight)<br />
            signed = expected_import_cif − uzb_import_cif<br />
            positive = Σ max(signed, 0) · reverse = Σ max(−signed, 0) · absolute = positive + reverse
          </Formula>
          <P>
            Positive and reverse totals are sums of per-channel-year maxima and are never netted against
            each other; a signed/net figure is never the only headline
            <Cite ids={["buehn2011", "gfi2021"]} />.
          </P>
          <div className="overflow-x-auto" style={{ marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {DEFINITIONS.map(([term, def]) => (
                  <tr key={term} style={{ borderBottom: RULE_ROW }}>
                    <td className={TD} style={{ width: 224, fontWeight: 800 }}>{term}</td>
                    <td className={TD} style={{ color: MUTED }}>{def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section label="§2.2 — Relative measures">
          <Formula>
            bounded_asymmetry = absolute ÷ max(expected_cif, uzb_imports) ∈ [0,1]<br />
            gap_rate = positive ÷ expected_cif<br />
            share_of_comparable_trade = positive ÷ Σ partner_export_fob
          </Formula>
          <P>
            Relative measures make a 90%-missing flow outrank a 10%-missing one of equal size; they are
            bounded so that near-zero denominators cannot manufacture extreme rates.
          </P>
        </Section>

        <Section label="§2.3 — The one assumption">
          <P>
            Imports are valued CIF, exports FOB. Because the CIF/FOB wedge between matched mirrors is noisy
            and commodity-dependent, no single rate is defensible — every headline is therefore computed
            across a 6% / 10% central / 15% scenario band rather than at one point
            <Cite ids={["hummels2006", "gaulier2010"]} />. Any channel whose sign flips inside the band is
            flagged freight-sensitive and held out of the residual stage.
          </P>
        </Section>

        <Section label="§3 — Legitimate statistical causes of asymmetry">
          <P>
            Most bilateral asymmetry has documented statistical explanations that must be exhausted before
            any behavioural reading
            <Cite ids={["unsd2019", "ferrantino2008", "yeats1990"]} />.
          </P>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>
            {CAUSES.map(([c, d]) => (
              <li key={c}><strong style={{ color: "#201e1d", fontWeight: 800 }}>{c}</strong> — {d}</li>
            ))}
          </ul>
        </Section>

        <Section label="§4 — Anomaly strength (0–100)">
          <P>Ranks how unusual a discrepancy is. It deliberately contains <em>no</em> data-quality information.</P>
          <ScoreTable rows={SCORE_A} />
        </Section>

        <Section label="§5 — Evidence quality (0–100)">
          <P>
            Ranks how reliable and comparable the underlying data is — displayed next to every anomaly,
            never hidden. Reporting quality must be assessed before a gap is interpreted at all
            <Cite ids={["yeats1990", "unsd2019"]} />.
          </P>
          <ScoreTable rows={SCORE_E} />
          <P>
            Weights are configuration, versioned with the methodology (v{METHODOLOGY_VERSION}). Anomaly and
            evidence are always scored independently.
          </P>
        </Section>

        <Section label="§6 — Classification matrix & robustness">
          <P>
            Crossing anomaly strength with evidence quality yields a review queue, following the practice of
            customs administrations that use mirror data for risk screening — a prioritization device, never
            a verdict<Cite ids={["imf2023", "kellenberg2019"]} />. Anomaly ≥ 55 counts as high,
            evidence ≥ 60 as high.
          </P>
          <div className="overflow-x-auto" style={{ marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(32,30,29,.4)" }}>
                  <th className={TH}>Anomaly</th><th className={TH}>Evidence</th><th className={TH}>Class</th><th className={TH}>Meaning</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX.map((r) => (
                  <tr key={r[2]} style={{ borderBottom: RULE_ROW }}>
                    <td className={TD}>{r[0]}</td>
                    <td className={TD}>{r[1]}</td>
                    <td className={TD} style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{r[2]}</td>
                    <td className={TD} style={{ color: MUTED }}>{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>
            Robustness labels: <strong style={{ color: "#201e1d", fontWeight: 800 }}>Robust</strong> (sign
            holds at 6/10/15%, enough comparable years, no major flags),{" "}
            <strong style={{ color: "#201e1d", fontWeight: 800 }}>Freight-sensitive</strong> (sign or class
            changes across scenarios), <strong style={{ color: "#201e1d", fontWeight: 800 }}>Coverage-sensitive</strong>{" "}
            (depends on a reporting stop or sparse reporting),{" "}
            <strong style={{ color: "#201e1d", fontWeight: 800 }}>Insufficient data</strong> (fewer than two
            comparable years).
          </P>
          <P>
            §6.10 Structural breaks — 2020 COVID-19, 2022 partner reporting stop, 2023 HS granularity
            expansion — are marked on time charts so that real trade shocks are not read as screening
            signals and data-coverage artifacts are not read as real shocks.
          </P>
        </Section>

        <Section label="§7.1 — Partner-year coverage & missing data">
          <Formula>coverage = reported partner-years ÷ possible partner-years in the selected period</Formula>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>
            <li><strong style={{ color: "#201e1d", fontWeight: 800 }}>Missing is never zero.</strong> If a partner did not report a year, no gap is computed for it; the year reads &ldquo;Not reported&rdquo; / &ldquo;Not comparable&rdquo; and coverage warnings appear instead.</li>
            <li><strong style={{ color: "#201e1d", fontWeight: 800 }}>Reporting stops</strong> (e.g. Russia after {meta.partners.find((p) => p.iso3 === "RUS")?.lastReportedYear ?? 2021}) down-weight evidence quality and exclude the partner from trend comparisons — a stop is not an improvement.</li>
            <li><strong style={{ color: "#201e1d", fontWeight: 800 }}>Orphan imports</strong> ({fmtUSD(meta.orphans.importValue)} across the window) lack a partner mirror; treating the missing side as a zero export would fabricate a reverse discrepancy, so they are excluded from all discrepancy metrics and lower the coverage share instead.</li>
          </ul>
        </Section>

        <Section label="§7.2 — Residual codes, noise floors & transit">
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6, fontSize: 12.5, lineHeight: 1.55, color: MUTED }}>
            <li><strong style={{ color: "#201e1d", fontWeight: 800 }}>Residual codes (HS 98–99)</strong> are shown for transparency but excluded from audit-priority framing: they cannot be mirror-matched by construction.</li>
            <li><strong style={{ color: "#201e1d", fontWeight: 800 }}>Transit hubs</strong> ({meta.partners.filter((p) => p.transit).map((p) => p.name).join(", ")}) are classified separately — origin-vs-consignment recording can create legitimate discrepancies.</li>
            <li><strong style={{ color: "#201e1d", fontWeight: 800 }}>Noise floor:</strong> channel-years below ≈$0.1M are ignored; HS6 channels below ≈$8M partner value / ≈$4M discrepancy over the window are excluded from the shipped channel tables (product profiles disclose when their totals include sub-floor channels).</li>
          </ul>
        </Section>

        <Section label="§8 — How the headline is built">
          <P>
            Every headline figure is the end of a reconciliation funnel over the full{" "}
            {meta.window.start}–{meta.window.end} window: all comparable channels are measured, the checks
            above strip away channels with a legitimate statistical explanation, and only what survives
            every assumption change is called a robust signal.
          </P>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
            {funnelRows.map((r) => (
              <div key={r.label}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3" style={{ fontSize: 12.5 }}>
                  <span style={{ fontWeight: 800 }}>{r.label}</span>
                  <span className="tabular" style={{ color: "rgba(32,30,29,.6)" }}>
                    {r.count.toLocaleString("en-US")} channels{r.value != null ? ` · ${fmtUSD(r.value)}` : ""}
                  </span>
                </div>
                {r.value != null && (
                  <div style={{ marginTop: 3, height: 6, background: "rgba(32,30,29,.12)" }}>
                    <div style={{ height: "100%", width: `${Math.max((r.value / funnelMax) * 100, 1.5)}%`, background: "#ec3013" }} />
                  </div>
                )}
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "rgba(32,30,29,.55)" }}>{r.note}</p>
              </div>
            ))}
          </div>
          <P>
            Uncertainty is reported, not hidden: the cumulative positive discrepancy is{" "}
            {fmtUSD(k.positive.low)} at a 6% freight rate, {fmtUSD(k.positive.central)} at 10% and{" "}
            {fmtUSD(k.positive.high)} at 15%, and {fmtPct(k.flipShare, 0)} of comparable channels change the
            sign of their net discrepancy somewhere inside that band — a headline is only quoted together
            with its scenario<Cite ids={["hummels2006"]} />.
          </P>
        </Section>

        <Section label="§9 — Concentration">
          <Formula>
            top5_share = Σ |top-5 channel values| ÷ Σ |all channel values| (active direction)<br />
            HHI = Σ (channel share)² × 10,000
          </Formula>
          <P>
            Concentration is computed over the filtered channels on the active direction; it shows whether
            review effort can be targeted, not where wrongdoing occurred.
          </P>
        </Section>

        <section style={{ padding: "14px 0", borderBottom: "2px solid rgba(32,30,29,.4)" }}>
          <div className="lbl">Formula index — every metric on this site</div>
          <div className="overflow-x-auto" style={{ marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(32,30,29,.4)" }}>
                  <th className={TH}>Shown as</th>
                  <th className={TH}>Where</th>
                  <th className={TH}>Formula / method</th>
                  <th className={`${TH} text-right`}>Section</th>
                </tr>
              </thead>
              <tbody>
                {FORMULA_INDEX.map((i) => (
                  <tr key={i.metric} style={{ borderBottom: RULE_ROW }}>
                    <td className={TD} style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{i.metric}</td>
                    <td className={TD} style={{ fontSize: 12, color: "rgba(32,30,29,.6)", whiteSpace: "nowrap" }}>{i.where}</td>
                    <td className={`${TD} tabular`} style={{ fontSize: 12 }}>{i.formula}</td>
                    <td className={`${TD} tabular text-right`} style={{ fontWeight: 600 }}>{i.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "rgba(32,30,29,.55)" }}>
            X = partner export FOB · M = Uzbekistan import CIF · f = freight rate.
          </p>
        </section>

        <Section label="§10 — What may and may not be said">
          <div className="overflow-x-auto" style={{ marginTop: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(32,30,29,.4)" }}>
                  <th className={TH}>Not allowed</th><th className={TH}>Allowed</th>
                </tr>
              </thead>
              <tbody>
                {FORBIDDEN.map(([bad, good]) => (
                  <tr key={bad} style={{ borderBottom: RULE_ROW }}>
                    <td className={TD} style={{ color: "#ae1800" }}>{bad}</td>
                    <td className={TD} style={{ color: MUTED }}>{good}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section label="§11 — Versioning & reproducibility">
          <P>
            Data version <strong style={{ color: "#201e1d", fontWeight: 800 }}>{DATA_VERSION}</strong> ·
            methodology <strong style={{ color: "#201e1d", fontWeight: 800 }}>v{METHODOLOGY_VERSION}</strong> ·
            generated {new Date(meta.generatedAt).toISOString().slice(0, 10)}. All pages and exports read one
            calculation source; filters are reflected in shareable URLs; CSV exports embed the data version,
            methodology version and active filter context. Cumulative {meta.window.start}–{meta.window.end}{" "}
            reference figures at the central scenario: comparable trade {fmtUSD(FULL.kpis.comparableTrade)},
            positive discrepancy {fmtUSD(FULL.kpis.positive.central)} ({fmtUSD(FULL.kpis.positive.low)}–{fmtUSD(FULL.kpis.positive.high)}{" "}
            across the freight band), reverse {fmtUSD(FULL.kpis.reverse)}.
          </P>
        </Section>

        <Section label="§12 — References" last>
          <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 0 }}>
            {REFERENCES.map((r) => (
              <li key={r.id} style={{ padding: "9px 0", borderBottom: RULE_ROW, fontSize: 12.5, lineHeight: 1.55 }}>
                <p style={{ margin: 0 }}>
                  {r.authors} ({r.year}). <em>{r.title}</em>. {r.source}.
                  {r.url && (
                    <>
                      {" "}
                      <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "#ae1800", textDecoration: "underline" }}>Link</a>
                    </>
                  )}
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "rgba(32,30,29,.55)" }}>{r.note}</p>
              </li>
            ))}
          </ul>
          <p style={{ margin: "10px 0 0", fontSize: 11.5, lineHeight: 1.5, color: "rgba(32,30,29,.55)" }}>
            Architecture note: this version computes all figures from a versioned static snapshot in one
            client-side engine (one calculation source). The FastAPI + DuckDB service layer described in the
            technical specification is the planned next infrastructure step and does not change any formula
            on this page.
          </p>
        </Section>
      </div>
    </div>
  );
}

function ScoreTable({ rows }: { rows: [string, string, React.ReactNode][] }) {
  return (
    <div className="overflow-x-auto" style={{ marginTop: 8 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid rgba(32,30,29,.4)" }}>
            <th className={TH}>Component</th>
            <th className={`${TH} text-right`}>Weight</th>
            <th className={TH}>Computation</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} style={{ borderBottom: RULE_ROW }}>
              <td className={TD} style={{ fontWeight: 800, whiteSpace: "nowrap" }}>{r[0]}</td>
              <td className={`${TD} tabular text-right`}>{r[1]}</td>
              <td className={TD} style={{ color: MUTED }}>{r[2]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
